//! 曲库：SQLite 存取。原图路径引用用户目录，不把图片二进制放进库。

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

const SCHEMA: &str = include_str!("../migrations/001_init.sql");

#[derive(Debug, thiserror::Error)]
pub enum LibraryError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

impl Serialize for LibraryError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongDto {
    pub id: i64,
    #[serde(rename = "type")]
    pub song_type: String,
    pub title: String,
    pub key: Option<String>,
    pub meter: Option<String>,
    pub tempo: Option<String>,
    pub tags: Vec<String>,
    pub stars: i64,
    pub source: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub song_id: i64,
    pub title: String,
    pub duplicate_of: Option<i64>,
}

pub struct Library {
    conn: Connection,
}

impl Library {
    pub fn open(path: &Path) -> Result<Self, LibraryError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self { conn })
    }

    pub fn list_songs(&self) -> Result<Vec<SongDto>, LibraryError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, type, title, key, meter, tempo, tags, stars, source, created_at
             FROM song ORDER BY id DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            let tags_json: String = row.get(6)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
            Ok(SongDto {
                id: row.get(0)?,
                song_type: row.get(1)?,
                title: row.get(2)?,
                key: row.get(3)?,
                meter: row.get(4)?,
                tempo: row.get(5)?,
                tags,
                stars: row.get(7)?,
                source: row.get(8)?,
                created_at: row.get(9)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    pub fn insert_text_song(
        &self,
        title: &str,
        key: Option<&str>,
        meter: Option<&str>,
        jianpu_text: &str,
    ) -> Result<i64, LibraryError> {
        self.conn.execute(
            "INSERT INTO song (type, title, key, meter) VALUES ('text', ?1, ?2, ?3)",
            params![title, key, meter],
        )?;
        let id = self.conn.last_insert_rowid();
        self.conn.execute(
            "INSERT INTO song_text (song_id, jianpu_text) VALUES (?1, ?2)",
            params![id, jianpu_text],
        )?;
        Ok(id)
    }

    pub fn insert_image_song(
        &self,
        title: &str,
        original_path: &str,
        phash_hex: Option<&str>,
    ) -> Result<i64, LibraryError> {
        self.conn.execute(
            "INSERT INTO song (type, title) VALUES ('image', ?1)",
            params![title],
        )?;
        let id = self.conn.last_insert_rowid();
        self.conn.execute(
            "INSERT INTO image_asset (song_id, original_path, phash) VALUES (?1, ?2, ?3)",
            params![id, original_path, phash_hex],
        )?;
        Ok(id)
    }

    pub fn find_by_phash_exact(&self, phash: &str) -> Result<Option<i64>, LibraryError> {
        let id = self
            .conn
            .query_row(
                "SELECT song_id FROM image_asset WHERE phash = ?1 LIMIT 1",
                params![phash],
                |row| row.get(0),
            )
            .optional()?;
        Ok(id)
    }
}

pub struct LibraryState(pub Mutex<Library>);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_and_insert_text() {
        let dir = std::env::temp_dir().join(format!("jp-lib-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let db = dir.join("t.db");
        let lib = Library::open(&db).unwrap();
        let id = lib
            .insert_text_song("小星星", Some("1=C"), Some("4/4"), "1 1 5 5 |")
            .unwrap();
        assert!(id > 0);
        let songs = lib.list_songs().unwrap();
        assert_eq!(songs.len(), 1);
        assert_eq!(songs[0].title, "小星星");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn image_hash_roundtrip() {
        let dir = std::env::temp_dir().join(format!("jp-lib2-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let lib = Library::open(&dir.join("t.db")).unwrap();
        lib.insert_image_song("扫描谱", "D:/a.png", Some("deadbeefcafebabe"))
            .unwrap();
        assert!(lib.find_by_phash_exact("deadbeefcafebabe").unwrap().is_some());
        assert!(lib.find_by_phash_exact("0000000000000000").unwrap().is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
