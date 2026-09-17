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
    #[serde(rename = "thumbPath")]
    pub thumb_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub song_id: i64,
    pub title: String,
    pub path: String,
    pub phash: Option<String>,
    /// None=新导入；Some(id)=判重/近重复
    pub duplicate_of: Option<i64>,
    /// duplicate / near / new / error
    pub status: String,
    pub message: Option<String>,
    #[serde(rename = "thumbPath")]
    pub thumb_path: Option<String>,
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
            "SELECT s.id, s.type, s.title, s.key, s.meter, s.tempo, s.tags, s.stars, s.source,
                    s.created_at, a.thumb_path
             FROM song s
             LEFT JOIN image_asset a ON a.song_id = s.id
             ORDER BY s.id DESC",
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
                thumb_path: row.get(10)?,
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
        thumb_path: Option<&str>,
    ) -> Result<i64, LibraryError> {
        self.conn.execute(
            "INSERT INTO song (type, title, source) VALUES ('image', ?1, ?2)",
            params![title, original_path],
        )?;
        let id = self.conn.last_insert_rowid();
        self.conn.execute(
            "INSERT INTO image_asset (song_id, original_path, thumb_path, phash)
             VALUES (?1, ?2, ?3, ?4)",
            params![id, original_path, thumb_path, phash_hex],
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

    /// 全量哈希，供汉明距离近邻搜索
    pub fn all_hashes(&self) -> Result<Vec<(i64, u64)>, LibraryError> {
        let mut stmt = self
            .conn
            .prepare("SELECT song_id, phash FROM image_asset WHERE phash IS NOT NULL")?;
        let rows = stmt.query_map([], |row| {
            let id: i64 = row.get(0)?;
            let hex: String = row.get(1)?;
            let v = u64::from_str_radix(hex.trim(), 16).unwrap_or(0);
            Ok((id, v))
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }
}

/// 应用数据目录
#[derive(Clone)]
pub struct AppPaths {
    pub data_dir: std::path::PathBuf,
}

impl AppPaths {
    pub fn thumbs_dir(&self) -> std::path::PathBuf {
        self.data_dir.join("thumbs")
    }
}

pub struct LibraryState {
    pub library: Mutex<Library>,
    pub paths: AppPaths,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_lib(tag: &str) -> (std::path::PathBuf, Library) {
        let dir = std::env::temp_dir().join(format!("jp-lib-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let lib = Library::open(&dir.join("t.db")).unwrap();
        (dir, lib)
    }

    #[test]
    fn open_and_insert_text() {
        let (dir, lib) = temp_lib("text");
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
        let (dir, lib) = temp_lib("img");
        lib.insert_image_song("扫描谱", "D:/a.png", Some("deadbeefcafebabe"), None)
            .unwrap();
        assert!(lib.find_by_phash_exact("deadbeefcafebabe").unwrap().is_some());
        assert!(lib.find_by_phash_exact("0000000000000000").unwrap().is_none());
        let hashes = lib.all_hashes().unwrap();
        assert_eq!(hashes.len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
