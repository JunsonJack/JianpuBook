-- JianpuBook 曲库 schema（P0）
-- 对应产品规划「数据模型（v0.1 草案）」

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS song (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL CHECK (type IN ('image', 'text')),
  title      TEXT NOT NULL,
  key        TEXT,                 -- 调号，如 1=C
  meter      TEXT,                 -- 拍号，如 4/4
  tempo      TEXT,                 -- 速度，如 ♩=100
  tags       TEXT DEFAULT '[]',    -- JSON array
  stars      INTEGER DEFAULT 0 CHECK (stars BETWEEN 0 AND 5),
  source     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS image_asset (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id       INTEGER NOT NULL REFERENCES song(id) ON DELETE CASCADE,
  original_path TEXT NOT NULL,     -- 原图永不修改
  thumb_path    TEXT,
  meta          TEXT DEFAULT '{}', -- JSON：宽高/格式/EXIF 等
  phash         TEXT,              -- 64-bit hex，归一化后计算
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS enhance (
  song_id  INTEGER PRIMARY KEY REFERENCES song(id) ON DELETE CASCADE,
  params   TEXT NOT NULL DEFAULT '{}', -- EnhanceParams JSON，非破坏性可重算
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS song_text (
  song_id       INTEGER PRIMARY KEY REFERENCES song(id) ON DELETE CASCADE,
  jianpu_text   TEXT NOT NULL,
  lyrics        TEXT DEFAULT '[]', -- JSON array of lyric verses
  transpose_semi INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS book (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  pagesetup   TEXT NOT NULL DEFAULT '{}', -- 纸张/边距/镜像/页码
  theme       TEXT NOT NULL DEFAULT 'classic',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS book_item (
  book_id  INTEGER NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  song_id  INTEGER NOT NULL REFERENCES song(id) ON DELETE CASCADE,
  ord      INTEGER NOT NULL,
  override TEXT DEFAULT '{}', -- 单曲覆盖：标题样式/缩放/小节号等
  PRIMARY KEY (book_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_song_title ON song(title);
CREATE INDEX IF NOT EXISTS idx_image_phash ON image_asset(phash);
CREATE INDEX IF NOT EXISTS idx_book_item_ord ON book_item(book_id, ord);
