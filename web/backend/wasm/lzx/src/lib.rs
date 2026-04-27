use std::io::{Cursor, Write};
use wasm_bindgen::prelude::*;
use amiga_lzx::{ArchiveReader, ArchiveWriter, EntryBuilder};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct ExtractedEntry {
    name: String,
    data: Vec<u8>,
}

#[derive(Deserialize)]
struct PackEntry {
    name: String,
    data: Vec<u8>,
}

/// Extract all entries from an LZX archive.
/// Returns a JSON string: [{name: string, data: number[]}]
#[wasm_bindgen]
pub fn lzx_extract_all(archive_bytes: &[u8]) -> Result<String, JsValue> {
    let mut reader = ArchiveReader::new(Cursor::new(archive_bytes))
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let mut entries: Vec<ExtractedEntry> = Vec::new();
    while let Some(entry) = reader.next_entry()
        .map_err(|e| JsValue::from_str(&e.to_string()))?
    {
        entries.push(ExtractedEntry { name: entry.filename, data: entry.data });
    }
    serde_json::to_string(&entries).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// List filenames in an LZX archive.
/// Returns a JSON string: string[]
#[wasm_bindgen]
pub fn lzx_list_files(archive_bytes: &[u8]) -> Result<String, JsValue> {
    let mut reader = ArchiveReader::new(Cursor::new(archive_bytes))
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let mut names: Vec<String> = Vec::new();
    while let Some(entry) = reader.next_entry()
        .map_err(|e| JsValue::from_str(&e.to_string()))?
    {
        names.push(entry.filename);
    }
    serde_json::to_string(&names).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Create an LZX archive from entries.
/// entries_json: JSON string [{name: string, data: number[]}]
/// Returns the raw archive bytes.
#[wasm_bindgen]
pub fn lzx_pack(entries_json: &str) -> Result<Vec<u8>, JsValue> {
    let pack_entries: Vec<PackEntry> = serde_json::from_str(entries_json)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let buf: Vec<u8> = Vec::new();
    let mut writer = ArchiveWriter::new(Cursor::new(buf))
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    for e in &pack_entries {
        let mut entry = writer.add_entry(EntryBuilder::new(&e.name))
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        entry.write_all(&e.data)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        entry.finish().map_err(|e| JsValue::from_str(&e.to_string()))?;
    }
    let cursor = writer.finish().map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(cursor.into_inner())
}
