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
    #[serde(rename = "originalPath")]
    pub original_path: Option<String>,
    #[serde(rename = "enhancedPath")]
    pub enhanced_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub song_id: i64,
    pub title: String,
    pub path: String,
    pub phash: Option<String>,
    pub duplicate_of: Option<i64>,
    pub status: String,
    pub message: Option<String>,
    #[serde(rename = "thumbPath")]
    pub thumb_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookDto {
    pub id: i64,
    pub title: String,
    pub pagesetup: String,
    pub theme: String,
    #[serde(rename = "itemCount")]
    pub item_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookItemDto {
    #[serde(rename = "songId")]
    pub song_id: i64,
    pub ord: i64,
    #[serde(rename = "type")]
    pub song_type: String,
    pub title: String,
    pub key: Option<String>,
    pub meter: Option<String>,
    #[serde(rename = "originalPath")]
    pub original_path: Option<String>,
    #[serde(rename = "jianpuText")]
    pub jianpu_text: Option<String>,
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
                    s.created_at, a.thumb_path, a.original_path,
                    json_extract(a.meta, '$.enhancedPath')
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
                original_path: row.get(11)?,
                enhanced_path: row.get(12)?,
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

    /// 保存非破坏性增强参数
    pub fn save_enhance_params(
        &self,
        song_id: i64,
        params_json: &str,
    ) -> Result<(), LibraryError> {
        self.conn.execute(
            "INSERT INTO enhance (song_id, params, updated_at)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(song_id) DO UPDATE SET params=excluded.params, updated_at=excluded.updated_at",
            params![song_id, params_json],
        )?;
        Ok(())
    }

    pub fn load_enhance_params(&self, song_id: i64) -> Result<Option<String>, LibraryError> {
        let p = self
            .conn
            .query_row(
                "SELECT params FROM enhance WHERE song_id = ?1",
                params![song_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(p)
    }

    // ---- Book ----

    pub fn create_book(&self, title: &str, pagesetup_json: &str, theme: &str) -> Result<i64, LibraryError> {
        self.conn.execute(
            "INSERT INTO book (title, pagesetup, theme) VALUES (?1, ?2, ?3)",
            params![title, pagesetup_json, theme],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn list_books(&self) -> Result<Vec<BookDto>, LibraryError> {
        let mut stmt = self.conn.prepare(
            "SELECT b.id, b.title, b.pagesetup, b.theme,
                    (SELECT COUNT(*) FROM book_item bi WHERE bi.book_id = b.id) AS n
             FROM book b ORDER BY b.id DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(BookDto {
                id: row.get(0)?,
                title: row.get(1)?,
                pagesetup: row.get(2)?,
                theme: row.get(3)?,
                item_count: row.get::<_, i64>(4)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    pub fn get_book(&self, book_id: i64) -> Result<Option<BookDto>, LibraryError> {
        let b = self
            .conn
            .query_row(
                "SELECT b.id, b.title, b.pagesetup, b.theme,
                        (SELECT COUNT(*) FROM book_item bi WHERE bi.book_id = b.id)
                 FROM book b WHERE b.id = ?1",
                params![book_id],
                |row| {
                    Ok(BookDto {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        pagesetup: row.get(2)?,
                        theme: row.get(3)?,
                        item_count: row.get(4)?,
                    })
                },
            )
            .optional()?;
        Ok(b)
    }

    pub fn delete_book(&self, book_id: i64) -> Result<(), LibraryError> {
        self.conn
            .execute("DELETE FROM book WHERE id = ?1", params![book_id])?;
        Ok(())
    }

    pub fn rename_book(&self, book_id: i64, title: &str) -> Result<(), LibraryError> {
        self.conn.execute(
            "UPDATE book SET title = ?2, updated_at = datetime('now') WHERE id = ?1",
            params![book_id, title],
        )?;
        Ok(())
    }

    pub fn set_book_theme(&self, book_id: i64, theme: &str, pagesetup_json: &str) -> Result<(), LibraryError> {
        self.conn.execute(
            "UPDATE book SET theme = ?2, pagesetup = ?3, updated_at = datetime('now') WHERE id = ?1",
            params![book_id, theme, pagesetup_json],
        )?;
        Ok(())
    }

    pub fn add_book_item(&self, book_id: i64, song_id: i64) -> Result<i64, LibraryError> {
        let max_ord: Option<i64> = self
            .conn
            .query_row(
                "SELECT MAX(ord) FROM book_item WHERE book_id = ?1",
                params![book_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        let ord = max_ord.map(|m| m + 1).unwrap_or(0);
        self.conn.execute(
            "INSERT OR IGNORE INTO book_item (book_id, song_id, ord) VALUES (?1, ?2, ?3)",
            params![book_id, song_id, ord],
        )?;
        Ok(ord)
    }

    pub fn remove_book_item(&self, book_id: i64, song_id: i64) -> Result<(), LibraryError> {
        self.conn.execute(
            "DELETE FROM book_item WHERE book_id = ?1 AND song_id = ?2",
            params![book_id, song_id],
        )?;
        Ok(())
    }

    /// 按给定 song_id 顺序重排
    pub fn reorder_book_items(&self, book_id: i64, song_ids: &[i64]) -> Result<(), LibraryError> {
        for (i, sid) in song_ids.iter().enumerate() {
            self.conn.execute(
                "UPDATE book_item SET ord = ?3 WHERE book_id = ?1 AND song_id = ?2",
                params![book_id, sid, i as i64],
            )?;
        }
        Ok(())
    }

    pub fn list_book_items(&self, book_id: i64) -> Result<Vec<BookItemDto>, LibraryError> {
        let mut stmt = self.conn.prepare(
            "SELECT bi.song_id, bi.ord, s.type, s.title, s.key, s.meter,
                    a.original_path, t.jianpu_text
             FROM book_item bi
             JOIN song s ON s.id = bi.song_id
             LEFT JOIN image_asset a ON a.song_id = s.id
             LEFT JOIN song_text t ON t.song_id = s.id
             WHERE bi.book_id = ?1
             ORDER BY bi.ord ASC",
        )?;
        let rows = stmt.query_map(params![book_id], |row| {
            Ok(BookItemDto {
                song_id: row.get(0)?,
                ord: row.get(1)?,
                song_type: row.get(2)?,
                title: row.get(3)?,
                key: row.get(4)?,
                meter: row.get(5)?,
                original_path: row.get(6)?,
                jianpu_text: row.get(7)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    pub fn get_song_text(&self, song_id: i64) -> Result<Option<String>, LibraryError> {
        let t = self
            .conn
            .query_row(
                "SELECT jianpu_text FROM song_text WHERE song_id = ?1",
                params![song_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(t)
    }

    pub fn update_song_text(&self, song_id: i64, jianpu_text: &str) -> Result<(), LibraryError> {
        let n = self.conn.execute(
            "UPDATE song_text SET jianpu_text = ?2 WHERE song_id = ?1",
            params![song_id, jianpu_text],
        )?;
        if n == 0 {
            self.conn.execute(
                "INSERT INTO song_text (song_id, jianpu_text) VALUES (?1, ?2)",
                params![song_id, jianpu_text],
            )?;
        }
        Ok(())
    }

    pub fn set_song_stars(&self, song_id: i64, stars: i64) -> Result<(), LibraryError> {
        let s = stars.clamp(0, 5);
        self.conn.execute(
            "UPDATE song SET stars = ?2, updated_at = datetime('now') WHERE id = ?1",
            params![song_id, s],
        )?;
        Ok(())
    }

    pub fn set_song_tags(&self, song_id: i64, tags_json: &str) -> Result<(), LibraryError> {
        self.conn.execute(
            "UPDATE song SET tags = ?2, updated_at = datetime('now') WHERE id = ?1",
            params![song_id, tags_json],
        )?;
        Ok(())
    }

    /// 记录增强输出路径（非破坏性，原图路径不变）
    pub fn set_enhanced_path(&self, song_id: i64, path: &str) -> Result<(), LibraryError> {
        self.conn.execute(
            "UPDATE image_asset SET meta = json_set(COALESCE(meta, '{}'), '$.enhancedPath', ?2)
             WHERE song_id = ?1",
            params![song_id, path],
        )?;
        Ok(())
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

    #[test]
    fn book_crud_and_reorder() {
        let (dir, lib) = temp_lib("book");
        let s1 = lib
            .insert_text_song("A", Some("1=C"), Some("4/4"), "1 2 3 4 |")
            .unwrap();
        let s2 = lib
            .insert_text_song("B", Some("1=G"), Some("2/4"), "5 5 |")
            .unwrap();
        let bid = lib.create_book("我的册子", "{}", "classic").unwrap();
        lib.add_book_item(bid, s1).unwrap();
        lib.add_book_item(bid, s2).unwrap();
        let items = lib.list_book_items(bid).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].song_id, s1);
        lib.reorder_book_items(bid, &[s2, s1]).unwrap();
        let items = lib.list_book_items(bid).unwrap();
        assert_eq!(items[0].song_id, s2);
        assert_eq!(items[0].title, "B");
        assert!(items[1].jianpu_text.as_deref().unwrap().contains("1 2 3 4"));
        lib.remove_book_item(bid, s2).unwrap();
        assert_eq!(lib.list_book_items(bid).unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
