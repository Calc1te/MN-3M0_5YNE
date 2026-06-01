pub mod vector_db;

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use serde::de::Error as SerdeError;
use serde::{Deserialize, Deserializer, Serialize};
use std::sync::{Mutex, OnceLock};
use std::{
    env,
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    process::Command,
    str,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, WebviewWindow};

use chrono::prelude::*;
use tower_http::cors::CorsLayer;
use vector_db::lance::{self, MEMORY_VECTOR_DIMS, MemoryRecord};

const DEFAULT_MAX_CHARS: usize = 2000;
const BOOTSTRAP_FILE_NAME: &str = "bootstrap.json";

#[derive(Clone)]
struct ApiState;

#[derive(Serialize)]
struct HealthResponse {
    ok: bool,
}

#[derive(Serialize)]
struct ApiError {
    error: String,
}

#[derive(Deserialize, Default)]
struct BaseListRequest {
    dir: Option<String>,
}

#[derive(Serialize)]
struct BaseEntry {
    path: String,
    name: String,
    is_dir: bool,
    size: u64,
    modified_unix_secs: Option<u64>,
    content: Option<String>,
    content_source: Option<String>,
    content_error: Option<String>,
}

#[derive(Deserialize)]
struct BaseGetRequest {
    path: String,
    include_content: Option<bool>,
    max_chars: Option<usize>,
}

#[derive(Deserialize)]
struct MixDataDrinkRequest {
    file_paths: Option<Vec<String>>,
    ingredients: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize)]
struct StagedFileRecord {
    original_path: String,
    staged_path: String,
}

#[derive(Serialize, Deserialize)]
struct DrinkManifest {
    drink_id: String,
    staged_files: Vec<StagedFileRecord>,
}

#[derive(Serialize)]
struct MixDataDrinkResponse {
    message: String,
    drink_id: String,
    staged_dir: String,
    staged_count: usize,
}

#[derive(Deserialize)]
struct FinalizeDrinkRequest {
    drink_id: String,
    action: String,
}

#[derive(Serialize)]
struct FinalizeDrinkResponse {
    drink_id: String,
    action: String,
    affected_paths: Vec<String>,
}

#[derive(Deserialize)]
struct DeleteRequest {
    path: String,
}

#[derive(Deserialize)]
struct AddMemoryRequest {
    text: String,
    vector: Option<Vec<f32>>,
    tags: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct RetrieveMemoryRequest {
    vector: Vec<f32>,
}

#[derive(Serialize)]
struct AddMemoryResponse {
    id: String,
    text: String,
    vector: Vec<f32>,
    tags: Vec<String>,
    created_at: i64,
    updated_at: i64,
}

#[derive(Serialize)]
struct DeleteResponse {
    deleted: String,
}

static CURRENT_BASE_DIR: OnceLock<Mutex<PathBuf>> = OnceLock::new();
static STARTUP_CONTEXT: OnceLock<BarConfig> = OnceLock::new();

fn current_base_dir() -> PathBuf {
    let default_dir = dirs::desktop_dir().unwrap_or_else(|| ".".into());
    CURRENT_BASE_DIR
        .get_or_init(|| Mutex::new(default_dir.clone()))
        .lock()
        .unwrap()
        .clone()
}

fn bar_root_dir() -> Result<PathBuf, String> {
    let root = resolve_bar_root_parent()?.join(".bar");
    fs::create_dir_all(&root)
        .map_err(|e| format!("Failed to create bar directory {}: {e}", root.display()))?;
    Ok(root)
}

fn shaker_root_dir() -> Result<PathBuf, String> {
    let root = bar_root_dir()?.join("shaker");
    fs::create_dir_all(&root)
        .map_err(|e| format!("Failed to create shaker directory {}: {e}", root.display()))?;
    Ok(root)
}

fn config_root_dir() -> Result<PathBuf, String> {
    bar_root_dir()
}

#[derive(Clone, Serialize, Deserialize, Default)]
struct BootstrapConfig {
    #[serde(rename = "Bar_Root_Parent", default)]
    bar_root_parent: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct BarConfig {
    #[serde(rename = "Name", default = "default_user_name")]
    name: String,
    #[serde(rename = "Last_Activated", default)]
    last_activated: i64,
    #[serde(
        rename = "Base_Dir",
        alias = "Bar_Path",
        default,
        deserialize_with = "deserialize_path_string"
    )]
    base_dir: String,
    #[serde(
        rename = "Bar_Root_Parent",
        default,
        deserialize_with = "deserialize_path_string"
    )]
    bar_root_parent: String,
    #[serde(rename = "API_Key", default)]
    api_key: String,
    #[serde(rename = "Chat_Base_URL", default)]
    chat_base_url: String,
    #[serde(rename = "Chat_Model", default)]
    chat_model: String,
    #[serde(rename = "Embedding_Base_URL", default)]
    embedding_base_url: String,
    #[serde(rename = "Embedding_Model", default)]
    embedding_model: String,
    #[serde(rename = "Setup_Completed", default)]
    setup_completed: bool,
    #[serde(rename = "Remember_On_Exit", default)]
    remember_on_exit: bool,
}

fn default_user_name() -> String {
    "User".to_string()
}

impl Default for BarConfig {
    fn default() -> Self {
        Self {
            name: default_user_name(),
            last_activated: 0,
            base_dir: String::new(),
            bar_root_parent: String::new(),
            api_key: String::new(),
            chat_base_url: String::new(),
            chat_model: String::new(),
            embedding_base_url: String::new(),
            embedding_model: String::new(),
            setup_completed: false,
            remember_on_exit: false,
        }
    }
}

fn deserialize_path_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::String(value) => Ok(value),
        serde_json::Value::Number(_) | serde_json::Value::Null => Ok(String::new()),
        _ => Err(SerdeError::custom("path value must be a string")),
    }
}

fn bootstrap_dir() -> Result<PathBuf, String> {
    let base = dirs::config_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Failed to resolve user config directory".to_string())?;
    let dir = base.join("B4-rt_3n-der");
    fs::create_dir_all(&dir).map_err(|e| {
        format!(
            "Failed to create bootstrap directory {}: {e}",
            dir.display()
        )
    })?;
    Ok(dir)
}

fn bootstrap_path() -> Result<PathBuf, String> {
    Ok(bootstrap_dir()?.join(BOOTSTRAP_FILE_NAME))
}

fn read_bootstrap_config() -> Result<BootstrapConfig, String> {
    let path = bootstrap_path()?;
    if !path.exists() {
        return Ok(BootstrapConfig::default());
    }
    let bytes =
        fs::read(&path).map_err(|e| format!("Failed to read bootstrap {}: {e}", path.display()))?;
    serde_json::from_slice(&bytes)
        .map_err(|e| format!("Failed to parse bootstrap {}: {e}", path.display()))
}

fn write_bootstrap_config(config: &BootstrapConfig) -> Result<(), String> {
    let path = bootstrap_path()?;
    let bytes = serde_json::to_vec_pretty(config)
        .map_err(|e| format!("Failed to serialize bootstrap {}: {e}", path.display()))?;
    fs::write(&path, bytes)
        .map_err(|e| format!("Failed to write bootstrap {}: {e}", path.display()))
}

fn legacy_bar_root_parent() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn resolve_bar_root_parent() -> Result<PathBuf, String> {
    let bootstrap = read_bootstrap_config()?;
    if !bootstrap.bar_root_parent.trim().is_empty() {
        return Ok(PathBuf::from(bootstrap.bar_root_parent));
    }
    Ok(legacy_bar_root_parent())
}

fn config_path() -> Result<PathBuf, String> {
    Ok(config_root_dir()?.join("configs.json"))
}

fn read_config() -> Result<BarConfig, String> {
    let path = config_path()?;
    if !path.exists() {
        let mut config = BarConfig::default();
        config.bar_root_parent = resolve_bar_root_parent()?.to_string_lossy().into_owned();
        return Ok(config);
    }
    let bytes =
        fs::read(&path).map_err(|e| format!("Failed to read config {}: {e}", path.display()))?;
    serde_json::from_slice(&bytes)
        .map_err(|e| format!("Failed to parse config {}: {e}", path.display()))
}

fn write_config(config: &BarConfig) -> Result<(), String> {
    let path = config_path()?;
    let bytes = serde_json::to_vec_pretty(config)
        .map_err(|e| format!("Failed to serialize config {}: {e}", path.display()))?;
    fs::write(&path, bytes).map_err(|e| format!("Failed to write config {}: {e}", path.display()))
}

fn update_config<F>(mutator: F) -> Result<BarConfig, String>
where
    F: FnOnce(BarConfig) -> Result<BarConfig, String>,
{
    let current = read_config()?;
    let updated = mutator(current)?;
    write_config(&updated)?;
    Ok(updated)
}

fn initialize_startup_context() -> Result<BarConfig, String> {
    let mut config = read_config()?;
    let previous_last = config.last_activated;
    if config.base_dir.trim().is_empty() {
        config.base_dir = current_base_dir().to_string_lossy().into_owned();
    }
    if config.bar_root_parent.trim().is_empty() {
        config.bar_root_parent = resolve_bar_root_parent()?.to_string_lossy().into_owned();
    }

    let updated = BarConfig {
        last_activated: Local::now().timestamp(),
        ..config.clone()
    };
    write_config(&updated)?;
    set_current_base_dir(PathBuf::from(&updated.base_dir));

    let mut context = updated;
    context.last_activated = previous_last;
    let _ = STARTUP_CONTEXT.set(context.clone());
    Ok(context)
}

fn set_user_name_internal(name: String) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("name cannot be empty".to_string());
    }
    let config = update_config(|mut config| {
        config.name = trimmed.to_string();
        Ok(config)
    })?;
    Ok(config.name)
}

fn set_api_key_internal(api_key: String) -> Result<String, String> {
    let trimmed = api_key.trim().to_string();
    let config = update_config(|mut config| {
        config.api_key = trimmed;
        Ok(config)
    })?;
    Ok(config.api_key)
}

fn get_api_key_internal() -> Result<String, String> {
    Ok(read_config()?.api_key)
}

fn set_current_base_dir(path: PathBuf) {
    let base = CURRENT_BASE_DIR.get_or_init(|| Mutex::new(path.clone()));
    *base.lock().unwrap() = path;
}

fn memory_db_dir() -> Result<PathBuf, String> {
    let dir = bar_root_dir()?.join("memory.lancedb");
    fs::create_dir_all(&dir).map_err(|e| {
        format!(
            "Failed to create memory DB directory {}: {e}",
            dir.display()
        )
    })?;
    Ok(dir)
}

fn build_drink_id() -> String {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("drink-{}-{}", stamp.as_secs(), stamp.subsec_nanos())
}

fn move_item(src: &Path, dst: &Path) -> Result<(), String> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {e}", parent.display()))?;
    }
    fs::rename(src, dst)
        .map_err(|e| format!("Failed to move {} -> {}: {e}", src.display(), dst.display()))
}

fn write_manifest(dir: &Path, manifest: &DrinkManifest) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(manifest)
        .map_err(|e| format!("Failed to serialize manifest: {e}"))?;
    let path = dir.join("manifest.json");
    fs::write(&path, bytes).map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

fn read_manifest(drink_id: &str) -> Result<(PathBuf, DrinkManifest), String> {
    let shaker = shaker_root_dir()?;
    let session_dir = shaker.join(drink_id);
    let manifest_path = session_dir.join("manifest.json");
    let bytes = fs::read(&manifest_path)
        .map_err(|e| format!("Failed to read {}: {e}", manifest_path.display()))?;
    let manifest: DrinkManifest = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Failed to parse {}: {e}", manifest_path.display()))?;
    Ok((session_dir, manifest))
}

fn trim_to_chars(input: String, max_chars: usize) -> String {
    if input.chars().count() <= max_chars {
        return input;
    }
    input.chars().take(max_chars).collect()
}

fn extension_lower(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_ascii_lowercase())
}

fn read_text_file(path: &Path, max_chars: usize) -> Result<String, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open {}: {e}", path.display()))?;
    let mut bytes = Vec::new();
    let limit = (max_chars.saturating_mul(6)).max(4096) as u64;
    file.take(limit)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    let content = String::from_utf8_lossy(&bytes).to_string();
    Ok(trim_to_chars(content, max_chars))
}

fn run_textutil(path: &Path, max_chars: usize) -> Result<Option<String>, String> {
    let output = Command::new("textutil")
        .arg("-convert")
        .arg("txt")
        .arg("-stdout")
        .arg(path.as_os_str())
        .output()
        .map_err(|e| format!("Failed to launch textutil for {}: {e}", path.display()))?;

    if !output.status.success() {
        return Ok(None);
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return Ok(None);
    }
    Ok(Some(trim_to_chars(text, max_chars)))
}

fn run_mdls_text(path: &Path, max_chars: usize) -> Result<Option<String>, String> {
    let output = Command::new("mdls")
        .arg("-name")
        .arg("kMDItemTextContent")
        .arg("-raw")
        .arg(path.as_os_str())
        .output()
        .map_err(|e| format!("Failed to launch mdls for {}: {e}", path.display()))?;

    if !output.status.success() {
        return Ok(None);
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() || text == "(null)" {
        return Ok(None);
    }
    Ok(Some(trim_to_chars(text, max_chars)))
}

fn extract_content(
    path: &Path,
    max_chars: usize,
) -> (Option<String>, Option<String>, Option<String>) {
    let is_text_like = matches!(
        extension_lower(path).as_deref(),
        Some(
            "txt"
                | "md"
                | "json"
                | "csv"
                | "xml"
                | "yaml"
                | "yml"
                | "log"
                | "ts"
                | "tsx"
                | "js"
                | "jsx"
                | "rs"
                | "py"
                | "go"
                | "java"
                | "toml"
                | "ini"
                | "c"
                | "cpp"
                | "tex"
        )
    );

    if is_text_like {
        match read_text_file(path, max_chars) {
            Ok(content) => return (Some(content), Some("plain_text".to_string()), None),
            Err(error) => return (None, None, Some(error)),
        }
    }

    match run_textutil(path, max_chars) {
        Ok(Some(content)) => return (Some(content), Some("textutil".to_string()), None),
        Ok(None) => {}
        Err(error) => return (None, None, Some(error)),
    }

    match run_mdls_text(path, max_chars) {
        Ok(Some(content)) => (Some(content), Some("mdls".to_string()), None),
        Ok(None) => (None, None, Some("No extractable text content".to_string())),
        Err(error) => (None, None, Some(error)),
    }
}

fn metadata_to_entry(
    path: &Path,
    metadata: fs::Metadata,
    include_content: bool,
    max_chars: usize,
) -> Result<BaseEntry, String> {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid UTF-8 file name".to_string())?
        .to_string();

    let modified_unix_secs = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs());

    let (content, content_source, content_error) = if include_content && !metadata.is_dir() {
        extract_content(path, max_chars)
    } else {
        (None, None, None)
    };

    Ok(BaseEntry {
        path: path.to_string_lossy().into_owned(),
        name,
        is_dir: metadata.is_dir(),
        size: metadata.len(),
        modified_unix_secs,
        content,
        content_source,
        content_error,
    })
}

fn validate_base_dir(path: &str) -> Result<PathBuf, String> {
    let pathbuf = PathBuf::from(path);

    let metadata = fs::metadata(&pathbuf)
        .map_err(|e| format!("Failed to access path {}: {e}", pathbuf.display()))?;

    if !metadata.is_dir() {
        return Err(format!("{path} is not a directory"));
    }

    fs::read_dir(&pathbuf)
        .map_err(|e| format!("Failed to read directory {}: {e}", pathbuf.display()))?;

    Ok(fs::canonicalize(&pathbuf).unwrap_or(pathbuf))
}

fn read_base_list(dir_override: Option<&str>) -> Result<Vec<BaseEntry>, String> {
    let target_dir = match dir_override {
        Some(dir) if !dir.trim().is_empty() => validate_base_dir(dir)?,
        _ => current_base_dir(),
    };
    let entries = fs::read_dir(&target_dir)
        .map_err(|e| format!("Failed to read directory {}: {e}", target_dir.display()))?;

    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "Invalid UTF-8 file name".to_string())?;
        if name.starts_with('.') && !name[1..].contains('.') {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata for {}: {e}", path.display()))?;
        out.push(metadata_to_entry(
            &path,
            metadata,
            false,
            DEFAULT_MAX_CHARS,
        )?);
    }

    out.sort_by(|a, b| b.name.chars().count().cmp(&a.name.chars().count()));

    Ok(out)
}

fn resolve_base_path(path: &str) -> PathBuf {
    let pathbuf = PathBuf::from(path);
    if pathbuf.is_absolute() {
        pathbuf
    } else {
        current_base_dir().join(pathbuf)
    }
}

fn read_base(path: &str, include_content: bool, max_chars: usize) -> Result<BaseEntry, String> {
    let pathbuf = resolve_base_path(path);
    let metadata = fs::metadata(&pathbuf)
        .map_err(|e| format!("Failed to read metadata for {}: {e}", pathbuf.display()))?;
    metadata_to_entry(&pathbuf, metadata, include_content, max_chars)
}

fn permanently_delete(path: &str) -> Result<(), String> {
    let pathbuf = PathBuf::from(path);
    let metadata = fs::metadata(&pathbuf)
        .map_err(|e| format!("Failed to inspect {} before delete: {e}", pathbuf.display()))?;

    if metadata.is_dir() {
        fs::remove_dir_all(&pathbuf)
            .map_err(|e| format!("Failed to delete directory {}: {e}", pathbuf.display()))?;
    } else {
        fs::remove_file(&pathbuf)
            .map_err(|e| format!("Failed to delete file {}: {e}", pathbuf.display()))?;
    }

    Ok(())
}

fn stage_files_for_drink(file_paths: Vec<String>) -> Result<MixDataDrinkResponse, String> {
    if file_paths.is_empty() {
        return Err("file_paths cannot be empty".to_string());
    }

    let bar = shaker_root_dir()?;
    let drink_id = build_drink_id();
    let session_dir = bar.join(&drink_id);
    let files_dir = session_dir.join("files");

    fs::create_dir_all(&files_dir).map_err(|e| {
        format!(
            "Failed to create staging directory {}: {e}",
            files_dir.display()
        )
    })?;

    let mut staged: Vec<StagedFileRecord> = Vec::new();
    for (idx, src_raw) in file_paths.iter().enumerate() {
        let src = PathBuf::from(src_raw);
        if !src.exists() {
            for item in staged.iter().rev() {
                let _ = move_item(Path::new(&item.staged_path), Path::new(&item.original_path));
            }
            let _ = fs::remove_dir_all(&session_dir);
            return Err(format!("Selected file does not exist: {}", src.display()));
        }

        let name = src
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| format!("Invalid file name: {}", src.display()))?;
        let dst = files_dir.join(format!("{idx:03}_{name}"));

        if let Err(error) = move_item(&src, &dst) {
            for item in staged.iter().rev() {
                let _ = move_item(Path::new(&item.staged_path), Path::new(&item.original_path));
            }
            let _ = fs::remove_dir_all(&session_dir);
            return Err(error);
        }

        staged.push(StagedFileRecord {
            original_path: src.to_string_lossy().into_owned(),
            staged_path: dst.to_string_lossy().into_owned(),
        });
    }

    let manifest = DrinkManifest {
        drink_id: drink_id.clone(),
        staged_files: staged,
    };
    write_manifest(&session_dir, &manifest)?;

    Ok(MixDataDrinkResponse {
        message: format!("Staged {} file(s) for drink", manifest.staged_files.len()),
        drink_id,
        staged_dir: session_dir.to_string_lossy().into_owned(),
        staged_count: manifest.staged_files.len(),
    })
}

fn finalize_drink_internal(drink_id: &str, action: &str) -> Result<FinalizeDrinkResponse, String> {
    let (session_dir, manifest) = read_manifest(drink_id)?;
    let mut affected_paths = Vec::new();

    match action {
        "drink" => {
            for item in &manifest.staged_files {
                permanently_delete(&item.staged_path)?;
                affected_paths.push(item.original_path.clone());
            }
        }
        "restore" => {
            for item in &manifest.staged_files {
                let original = PathBuf::from(&item.original_path);
                if original.exists() {
                    return Err(format!(
                        "Cannot restore {} because target path already exists",
                        original.display()
                    ));
                }
                if let Some(parent) = original.parent() {
                    fs::create_dir_all(parent).map_err(|e| {
                        format!("Failed to recreate directory {}: {e}", parent.display())
                    })?;
                }
                move_item(Path::new(&item.staged_path), &original)?;
                affected_paths.push(item.original_path.clone());
            }
        }
        _ => return Err("action must be either 'drink' or 'restore'".to_string()),
    }

    fs::remove_dir_all(&session_dir).map_err(|e| {
        format!(
            "Failed to clean staging session {}: {e}",
            session_dir.display()
        )
    })?;

    Ok(FinalizeDrinkResponse {
        drink_id: manifest.drink_id,
        action: action.to_string(),
        affected_paths,
    })
}

fn change_base_directory_internal(path: String) -> Result<String, String> {
    let canonical = validate_base_dir(&path)?;

    update_config(|mut config| {
        config.base_dir = canonical.to_string_lossy().into_owned();
        Ok(config)
    })?;

    set_current_base_dir(canonical.clone());

    Ok(canonical.to_string_lossy().into_owned())
}

fn change_bar_root_parent_internal(path: String) -> Result<String, String> {
    let canonical = validate_base_dir(&path)?;
    let mut config = read_config()?;
    config.bar_root_parent = canonical.to_string_lossy().into_owned();

    let next_bar_root = canonical.join(".bar");
    fs::create_dir_all(&next_bar_root).map_err(|e| {
        format!(
            "Failed to create bar directory {}: {e}",
            next_bar_root.display()
        )
    })?;

    write_bootstrap_config(&BootstrapConfig {
        bar_root_parent: config.bar_root_parent.clone(),
    })?;
    write_config(&config)?;

    Ok(config.bar_root_parent)
}

fn save_app_config_internal(mut config: BarConfig) -> Result<BarConfig, String> {
    if config.name.trim().is_empty() {
        config.name = default_user_name();
    }
    if config.bar_root_parent.trim().is_empty() {
        config.bar_root_parent = resolve_bar_root_parent()?.to_string_lossy().into_owned();
    } else {
        let canonical = validate_base_dir(&config.bar_root_parent)?;
        config.bar_root_parent = canonical.to_string_lossy().into_owned();
    }
    if !config.base_dir.trim().is_empty() {
        let canonical = validate_base_dir(&config.base_dir)?;
        config.base_dir = canonical.to_string_lossy().into_owned();
    }

    write_bootstrap_config(&BootstrapConfig {
        bar_root_parent: config.bar_root_parent.clone(),
    })?;
    write_config(&config)?;

    if !config.base_dir.trim().is_empty() {
        set_current_base_dir(PathBuf::from(&config.base_dir));
    }

    Ok(config)
}

fn normalize_memory_vector(vector: Option<Vec<f32>>, _text: &str) -> Result<Vec<f32>, String> {
    let values = vector.ok_or_else(|| {
        format!("vector is required; embedding model output must contain {MEMORY_VECTOR_DIMS} f32 values")
    })?;

    if values.len() != MEMORY_VECTOR_DIMS {
        return Err(format!(
            "vector must contain exactly {MEMORY_VECTOR_DIMS} numbers, got {}",
            values.len()
        ));
    }

    if let Some((index, value)) = values
        .iter()
        .enumerate()
        .find(|(_, value)| !value.is_finite())
    {
        return Err(format!(
            "vector contains a non-finite value at index {index}: {value}"
        ));
    }

    Ok(values)
}

fn build_memory_id() -> String {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("memory-{}-{}", stamp.as_secs(), stamp.subsec_nanos())
}

async fn add_memory_internal(
    text: String,
    vector: Option<Vec<f32>>,
    tags: Option<Vec<String>>,
) -> Result<AddMemoryResponse, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("text cannot be empty".to_string());
    }
    let tags = tags
        .unwrap_or_default()
        .into_iter()
        .map(|tag| tag.trim().to_string())
        .filter(|tag| !tag.is_empty())
        .collect::<Vec<_>>();

    let vector = normalize_memory_vector(vector, trimmed)?;
    let now = Local::now().timestamp();
    let record = MemoryRecord {
        id: build_memory_id(),
        text,
        vector,
        tags,
        created_at: now,
        updated_at: now,
    };
    let uri = memory_db_dir()?.to_string_lossy().into_owned();
    let record = lance::add_memory(&uri, record).await?;

    Ok(AddMemoryResponse {
        id: record.id,
        text: record.text,
        vector: record.vector,
        tags: record.tags,
        created_at: record.created_at,
        updated_at: record.updated_at,
    })
}

#[tauri::command]
fn change_base_directory(path: String) -> Result<String, String> {
    change_base_directory_internal(path)
}

#[tauri::command]
fn change_bar_root_parent(path: String) -> Result<String, String> {
    change_bar_root_parent_internal(path)
}

#[tauri::command]
fn set_user_name(name: String) -> Result<String, String> {
    set_user_name_internal(name)
}

#[tauri::command]
fn set_api_key(api_key: String) -> Result<String, String> {
    set_api_key_internal(api_key)
}

#[tauri::command]
fn get_api_key() -> Result<String, String> {
    get_api_key_internal()
}

#[tauri::command]
fn get_app_config() -> Result<BarConfig, String> {
    read_config()
}

#[tauri::command]
fn save_app_config(config: BarConfig) -> Result<BarConfig, String> {
    save_app_config_internal(config)
}

#[tauri::command]
fn complete_initial_setup(config: BarConfig) -> Result<BarConfig, String> {
    let mut next = config;
    next.setup_completed = true;
    save_app_config_internal(next)
}

#[derive(Serialize)]
struct InitialSetupStatus {
    completed: bool,
    config: BarConfig,
}

#[tauri::command]
fn get_initial_setup_status() -> Result<InitialSetupStatus, String> {
    let config = read_config()?;
    let legacy_completed = !config.base_dir.trim().is_empty() && !config.api_key.trim().is_empty();
    Ok(InitialSetupStatus {
        completed: config.setup_completed || legacy_completed,
        config,
    })
}

#[tauri::command]
fn get_startup_context() -> Result<BarConfig, String> {
    if let Some(context) = STARTUP_CONTEXT.get() {
        return Ok(context.clone());
    }
    initialize_startup_context()
}

#[tauri::command]
async fn get_time_and_date() -> String {
    let local: DateTime<Local> = Local::now();
    local.format("%Y-%m-%d %H:%M:%S").to_string()
}

#[tauri::command]
fn base_list(dir: Option<String>) -> Result<Vec<BaseEntry>, String> {
    read_base_list(dir.as_deref())
}

#[tauri::command]
fn get_base(
    path: String,
    include_content: Option<bool>,
    max_chars: Option<usize>,
) -> Result<BaseEntry, String> {
    let with_content = include_content.unwrap_or(true);
    let max = max_chars.unwrap_or(DEFAULT_MAX_CHARS).max(1);
    read_base(&path, with_content, max)
}

#[tauri::command]
fn mix_data_drink(
    file_paths: Option<Vec<String>>,
    ingredients: Option<Vec<String>>,
) -> Result<MixDataDrinkResponse, String> {
    let selected_paths = if let Some(paths) = file_paths {
        paths
    } else if let Some(legacy_paths) = ingredients {
        legacy_paths
    } else {
        return Err("file_paths is required".to_string());
    };
    if selected_paths.is_empty() {
        return Err("file_paths cannot be empty".to_string());
    }
    stage_files_for_drink(selected_paths)
}

#[tauri::command]
fn finalize_drink(drink_id: String, action: String) -> Result<FinalizeDrinkResponse, String> {
    finalize_drink_internal(&drink_id, &action)
}

#[tauri::command]
fn permanently_delete_base(path: String) -> Result<DeleteResponse, String> {
    permanently_delete(&path)?;
    Ok(DeleteResponse { deleted: path })
}

#[tauri::command]
async fn add_memory(
    text: String,
    vector: Option<Vec<f32>>,
    tags: Option<Vec<String>>,
) -> Result<AddMemoryResponse, String> {
    add_memory_internal(text, vector, tags).await
}

#[tauri::command]
async fn retrive_memory(vector: Vec<f32>) -> Result<String, ApiError> {
    let vector = normalize_memory_vector(Some(vector), "").map_err(|error| ApiError { error })?;
    let uri = memory_db_dir()
        .map_err(|error| ApiError { error })?
        .to_string_lossy()
        .into_owned();
    let memories = lance::retrieve_memory_texts(&uri, vector)
        .await
        .map_err(|error| ApiError { error })?;
    Ok(memories.join("\n"))
}

#[tauri::command]
async fn set_ghost_mode(window: WebviewWindow, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { ok: true })
}

async fn base_list_handler(
    State(_state): State<Arc<ApiState>>,
    Json(req): Json<BaseListRequest>,
) -> Result<Json<Vec<BaseEntry>>, (StatusCode, Json<ApiError>)> {
    let items = read_base_list(req.dir.as_deref())
        .map_err(|error| (StatusCode::BAD_REQUEST, Json(ApiError { error })))?;
    Ok(Json(items))
}

async fn get_base_handler(
    State(_state): State<Arc<ApiState>>,
    Json(req): Json<BaseGetRequest>,
) -> Result<Json<BaseEntry>, (StatusCode, Json<ApiError>)> {
    let with_content = req.include_content.unwrap_or(true);
    let max = req.max_chars.unwrap_or(DEFAULT_MAX_CHARS).max(1);
    let item = read_base(&req.path, with_content, max)
        .map_err(|error| (StatusCode::BAD_REQUEST, Json(ApiError { error })))?;
    Ok(Json(item))
}

async fn mix_data_drink_handler(
    State(_state): State<Arc<ApiState>>,
    Json(req): Json<MixDataDrinkRequest>,
) -> Result<Json<MixDataDrinkResponse>, (StatusCode, Json<ApiError>)> {
    let selected_paths = if let Some(paths) = req.file_paths {
        paths
    } else if let Some(legacy_paths) = req.ingredients {
        legacy_paths
    } else {
        Vec::new()
    };

    let result = stage_files_for_drink(selected_paths)
        .map_err(|error| (StatusCode::BAD_REQUEST, Json(ApiError { error })))?;
    Ok(Json(result))
}

async fn finalize_drink_handler(
    State(_state): State<Arc<ApiState>>,
    Json(req): Json<FinalizeDrinkRequest>,
) -> Result<Json<FinalizeDrinkResponse>, (StatusCode, Json<ApiError>)> {
    let result = finalize_drink_internal(&req.drink_id, &req.action)
        .map_err(|error| (StatusCode::BAD_REQUEST, Json(ApiError { error })))?;
    Ok(Json(result))
}

async fn permanently_delete_handler(
    State(_state): State<Arc<ApiState>>,
    Json(req): Json<DeleteRequest>,
) -> Result<Json<DeleteResponse>, (StatusCode, Json<ApiError>)> {
    permanently_delete(&req.path)
        .map_err(|error| (StatusCode::BAD_REQUEST, Json(ApiError { error })))?;
    Ok(Json(DeleteResponse { deleted: req.path }))
}

async fn add_memory_handler(
    State(_state): State<Arc<ApiState>>,
    Json(req): Json<AddMemoryRequest>,
) -> Result<Json<AddMemoryResponse>, (StatusCode, Json<ApiError>)> {
    let result = add_memory_internal(req.text, req.vector, req.tags)
        .await
        .map_err(|error| (StatusCode::BAD_REQUEST, Json(ApiError { error })))?;
    Ok(Json(result))
}

async fn retrieve_memory_handler(
    State(_state): State<Arc<ApiState>>,
    Json(req): Json<RetrieveMemoryRequest>,
) -> Result<Json<Vec<String>>, (StatusCode, Json<ApiError>)> {
    let vector = normalize_memory_vector(Some(req.vector), "")
        .map_err(|error| (StatusCode::BAD_REQUEST, Json(ApiError { error })))?;
    let uri = memory_db_dir()
        .map_err(|error| (StatusCode::BAD_REQUEST, Json(ApiError { error })))?
        .to_string_lossy()
        .into_owned();
    let memories = lance::retrieve_memory_texts(&uri, vector)
        .await
        .map_err(|error| (StatusCode::BAD_REQUEST, Json(ApiError { error })))?;
    Ok(Json(memories))
}

async fn start_local_api() -> Result<(), String> {
    let state = Arc::new(ApiState);
    let app = Router::new()
        .route("/health", get(health))
        .route("/base/list", post(base_list_handler))
        .route("/base/get", post(get_base_handler))
        .route("/mix", post(mix_data_drink_handler))
        .route("/mix/finalize", post(finalize_drink_handler))
        .route("/base/delete", post(permanently_delete_handler))
        .route("/memory/add", post(add_memory_handler))
        .route("/memory/retrieve", post(retrieve_memory_handler))
        .route("/time", get(get_time_and_date))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:47821")
        .await
        .map_err(|e| format!("Failed to bind local API: {e}"))?;

    axum::serve(listener, app)
        .await
        .map_err(|e| format!("Local API server failed: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(error) = initialize_startup_context() {
        eprintln!("{error}");
    }

    tauri::async_runtime::spawn(async move {
        if let Err(error) = start_local_api().await {
            eprintln!("{error}");
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_shadow(false);
                window.show().unwrap();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            base_list,
            get_base,
            mix_data_drink,
            finalize_drink,
            permanently_delete_base,
            change_base_directory,
            change_bar_root_parent,
            set_user_name,
            set_api_key,
            get_api_key,
            get_app_config,
            save_app_config,
            complete_initial_setup,
            get_initial_setup_status,
            get_startup_context,
            add_memory,
            retrive_memory,
            get_time_and_date,
            set_ghost_mode,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
