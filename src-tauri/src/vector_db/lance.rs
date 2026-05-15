use std::sync::Arc;

use arrow_array::{FixedSizeListArray, LargeStringArray, RecordBatch, types::Float32Type};
use lancedb::{
    arrow::arrow_schema::{DataType, Field, Schema},
    connect,
    connection::Connection,
};
use serde::{Deserialize, Serialize};

pub const MEMORIES_TABLE: &str = "memories";
pub const MEMORY_VECTOR_DIMS: usize = 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryRecord {
    pub id: String,
    pub text: String,
    pub vector: Vec<f32>,
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

    RecordBatch::try_new(
        memories_schema(),
        vec![
            Arc::new(LargeStringArray::from(vec![record.id.as_str()])),
            Arc::new(LargeStringArray::from(vec![record.text.as_str()])),
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
