use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use std::{
    env,
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

const DEFAULT_MAX_CHARS: usize = 2000;

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

#[derive(Deserialize)]
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

#[derive(Serialize)]
struct DeleteResponse {
    deleted: String,
}

fn desktop_dir() -> PathBuf {
    return dirs::desktop_dir().unwrap_or(".".into())
}

fn bar_root_dir() -> Result<PathBuf, String> {
    let root = env::current_dir()
        .map_err(|e| format!("Failed to resolve current directory for .bar: {e}"))?
        .join(".bar");
    fs::create_dir_all(&root)
        .map_err(|e| format!("Failed to create bar directory {}: {e}", root.display()))?;
    Ok(root)
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
    let bar = bar_root_dir()?;
    let session_dir = bar.join(drink_id);
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
    let file =
        File::open(path).map_err(|e| format!("Failed to open {}: {e}", path.display()))?;
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

fn extract_content(path: &Path, max_chars: usize) -> (Option<String>, Option<String>, Option<String>) {
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

fn read_base_list(dir: Option<&str>) -> Result<Vec<BaseEntry>, String> {
    let target_dir = dir.map(PathBuf::from).unwrap_or_else(desktop_dir);
    let entries = fs::read_dir(&target_dir)
        .map_err(|e| format!("Failed to read directory {}: {e}", target_dir.display()))?;

    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;
        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata for {}: {e}", path.display()))?;
        out.push(metadata_to_entry(&path, metadata, false, DEFAULT_MAX_CHARS)?);
    }

    Ok(out)
}

fn read_base(path: &str, include_content: bool, max_chars: usize) -> Result<BaseEntry, String> {
    let pathbuf = PathBuf::from(path);
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

    let bar = bar_root_dir()?;
    let drink_id = build_drink_id();
    let session_dir = bar.join(&drink_id);
    let files_dir = session_dir.join("files");

    fs::create_dir_all(&files_dir)
        .map_err(|e| format!("Failed to create staging directory {}: {e}", files_dir.display()))?;

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

    fs::remove_dir_all(&session_dir)
        .map_err(|e| format!("Failed to clean staging session {}: {e}", session_dir.display()))?;

    Ok(FinalizeDrinkResponse {
        drink_id: manifest.drink_id,
        action: action.to_string(),
        affected_paths,
    })
}

#[tauri::command]
fn base_list(dir: Option<String>) -> Result<Vec<BaseEntry>, String> {
    read_base_list(dir.as_deref())
}

#[tauri::command]
fn get_base(path: String, include_content: Option<bool>, max_chars: Option<usize>) -> Result<BaseEntry, String> {
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

async fn start_local_api() -> Result<(), String> {
    let state = Arc::new(ApiState);
    let app = Router::new()
        .route("/health", get(health))
        .route("/base/list", post(base_list_handler))
        .route("/base/get", post(get_base_handler))
        .route("/mix", post(mix_data_drink_handler))
        .route("/mix/finalize", post(finalize_drink_handler))
        .route("/base/delete", post(permanently_delete_handler))
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
    tauri::async_runtime::spawn(async move {
        if let Err(error) = start_local_api().await {
            eprintln!("{error}");
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            base_list,
            get_base,
            mix_data_drink,
            finalize_drink,
            permanently_delete_base
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
