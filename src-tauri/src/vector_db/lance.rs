use std::sync::Arc;

use arrow_array::{
    Array, FixedSizeListArray, Int64Array, LargeStringArray, RecordBatch, types::Float32Type,
};
use futures::TryStreamExt;
use lancedb::{
    arrow::arrow_schema::{DataType, Field, Schema},
    connect,
    connection::Connection,
    query::{ExecutableQuery, QueryBase, Select},
};
use serde::{Deserialize, Serialize};

pub const MEMORIES_TABLE: &str = "memories";
pub const MEMORY_VECTOR_DIMS: usize = 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryRecord {
    pub id: String,
    pub text: String,
    pub vector: Vec<f32>,
    pub tags: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn connect_vectordb(uri: &str) -> Result<(), String> {
    connect(uri)
        .execute()
        .await
        .map_err(|e| format!("Failed to connect to vector DB: {e}"))?;
    Ok(())
}

fn memories_schema() -> Arc<Schema> {
    Arc::new(Schema::new(vec![
        Field::new("id", DataType::LargeUtf8, false),
        Field::new("text", DataType::LargeUtf8, false),
        Field::new("tags", DataType::LargeUtf8, false),
        Field::new("created_at", DataType::Int64, false),
        Field::new("updated_at", DataType::Int64, false),
        Field::new(
            "vector",
            DataType::FixedSizeList(
                Arc::new(Field::new("item", DataType::Float32, true)),
                MEMORY_VECTOR_DIMS as i32,
            ),
            false,
        ),
    ]))
}

async fn ensure_memories_table(db: &Connection) -> Result<lancedb::Table, String> {
    let table_names = db
        .table_names()
        .execute()
        .await
        .map_err(|e| format!("Failed to list vector DB tables: {e}"))?;

    if table_names.iter().any(|name| name == MEMORIES_TABLE) {
        return db
            .open_table(MEMORIES_TABLE)
            .execute()
            .await
            .map_err(|e| format!("Failed to open memories table: {e}"));
    }

    db.create_empty_table(MEMORIES_TABLE, memories_schema())
        .execute()
        .await
        .map_err(|e| format!("Failed to create memories table: {e}"))
}

fn memory_batch(record: &MemoryRecord) -> Result<RecordBatch, String> {
    if record.vector.len() != MEMORY_VECTOR_DIMS {
        return Err(format!(
            "memory vector must contain exactly {MEMORY_VECTOR_DIMS} values, got {}",
            record.vector.len()
        ));
    }
    let tags_json = serde_json::to_string(&record.tags)
        .map_err(|e| format!("Failed to serialize memory tags: {e}"))?;

    RecordBatch::try_new(
        memories_schema(),
        vec![
            Arc::new(LargeStringArray::from(vec![record.id.as_str()])),
            Arc::new(LargeStringArray::from(vec![record.text.as_str()])),
            Arc::new(LargeStringArray::from(vec![tags_json.as_str()])),
            Arc::new(Int64Array::from(vec![record.created_at])),
            Arc::new(Int64Array::from(vec![record.updated_at])),
            Arc::new(
                FixedSizeListArray::from_iter_primitive::<Float32Type, _, _>(
                    [Some(
                        record.vector.iter().copied().map(Some).collect::<Vec<_>>(),
                    )],
                    MEMORY_VECTOR_DIMS as i32,
                ),
            ),
        ],
    )
    .map_err(|e| format!("Failed to build memory: {e}"))
}

pub async fn add_memory(uri: &str, record: MemoryRecord) -> Result<MemoryRecord, String> {
    let db = connect(uri)
        .execute()
        .await
        .map_err(|e| format!("Failed to connect DB: {e}"))?;
    let table = ensure_memories_table(&db).await?;
    let batch = memory_batch(&record)?;

    table
        .add(batch)
        .execute()
        .await
        .map_err(|e| format!("Failed to add memory: {e}"))?;

    Ok(record)
}

pub async fn retrieve_memory_texts(uri: &str, vector: Vec<f32>) -> Result<Vec<String>, String> {
    let db = connect(uri)
        .execute()
        .await
        .map_err(|e| format!("Failed to connect DB: {e}"))?;
    let table = ensure_memories_table(&db).await?;
    let stream = table
        .query()
        .nearest_to(vector)
        .map_err(|e| format!("Failed to build memory query: {e}"))?
        .select(Select::columns(&["text"]))
        .execute()
        .await
        .map_err(|e| format!("Failed to query memory: {e}"))?;
    let batches: Vec<RecordBatch> = stream
        .try_collect()
        .await
        .map_err(|e| format!("Failed to read memory results: {e}"))?;

    let mut results = Vec::new();
    for batch in batches {
        let text_index = batch
            .schema()
            .index_of("text")
            .map_err(|e| format!("Memory query missing text column: {e}"))?;
        let texts = batch
            .column(text_index)
            .as_any()
            .downcast_ref::<LargeStringArray>()
            .ok_or_else(|| "Memory query returned non-text column".to_string())?;
        for row in 0..batch.num_rows() {
            if texts.is_null(row) {
                return Err(format!("Memory result text at row {row} is null"));
            }
            results.push(texts.value(row).to_string());
        }
    }

    Ok(results)
}
