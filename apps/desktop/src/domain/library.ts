/**
 * 曲库领域类型（前端侧镜像 SQLite schema）。
 * W1 接入 Tauri IPC 后由命令层填充。
 */

export type SongType = "image" | "text";

export interface Song {
  id: number;
  type: SongType;
  title: string;
  key?: string | null;
  meter?: string | null;
  tempo?: string | null;
  tags: string[];
  stars: number;
  source?: string | null;
  createdAt: string;
  updatedAt: string;
  thumbPath?: string | null;
  originalPath?: string | null;
}

export interface ImageAsset {
  id: number;
  songId: number;
  originalPath: string;
  thumbPath?: string | null;
  meta: Record<string, unknown>;
  /** 64-bit hex，归一化后计算 */
  phash?: string | null;
}

export interface EnhanceParamsDto {
  deskew: boolean;
  median: number;
  binarize: boolean;
  sauvolaWindow: number;
  sauvolaK: number;
  inkFallback: number;
  cropBorder: boolean;
}

export interface Book {
  id: number;
  title: string;
  pageSetup: Record<string, unknown>;
  theme: string;
}

export interface BookItem {
  bookId: number;
  songId: number;
  ord: number;
  override: Record<string, unknown>;
}
