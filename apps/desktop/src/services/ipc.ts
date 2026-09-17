/** Tauri IPC 封装；无 Tauri 环境时回退到内存 mock。 */

import type { Song } from "@/domain/library";

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): InvokeFn | null {
  const w = window as unknown as {
    __TAURI_INTERNALS__?: { invoke: InvokeFn };
    __TAURI__?: { invoke: InvokeFn };
  };
  if (w.__TAURI_INTERNALS__?.invoke)
    return w.__TAURI_INTERNALS__.invoke.bind(w.__TAURI_INTERNALS__);
  if (w.__TAURI__?.invoke) return w.__TAURI__.invoke.bind(w.__TAURI__);
  return null;
}

export function hasTauri(): boolean {
  return getInvoke() !== null;
}

export function convertFileSrc(path: string): string {
  const w = window as unknown as {
    __TAURI_INTERNALS__?: { convertFileSrc?: (p: string) => string };
    __TAURI__?: { convertFileSrc?: (p: string) => string };
  };
  const fn =
    w.__TAURI_INTERNALS__?.convertFileSrc ?? w.__TAURI__?.convertFileSrc;
  if (fn) return fn(path);
  return path;
}

const mockSongs: Song[] = [
  {
    id: 1,
    type: "text",
    title: "小星星",
    key: "1=C",
    meter: "4/4",
    tempo: "♩=100",
    tags: ["儿歌"],
    stars: 5,
    source: "内置示例",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    thumbPath: null,
    originalPath: null,
  },
];

let mockSeq = 1;

function normalize(raw: Record<string, unknown>): Song {
  return {
    id: Number(raw.id),
    type: (raw.type as Song["type"]) ?? "text",
    title: String(raw.title ?? ""),
    key: (raw.key as string) ?? null,
    meter: (raw.meter as string) ?? null,
    tempo: (raw.tempo as string) ?? null,
    tags: (raw.tags as string[]) ?? [],
    stars: Number(raw.stars ?? 0),
    source: (raw.source as string) ?? null,
    createdAt: String(raw.createdAt ?? ""),
    updatedAt: String(raw.updatedAt ?? ""),
    thumbPath: (raw.thumbPath as string) ?? null,
    originalPath: (raw.originalPath as string) ?? null,
  };
}

export async function listSongs(): Promise<Song[]> {
  const invoke = getInvoke();
  if (!invoke) return [...mockSongs];
  const rows = await invoke<Record<string, unknown>[]>("list_songs");
  return rows.map(normalize);
}

export async function importTextSong(input: {
  title: string;
  key?: string;
  meter?: string;
  jianpuText: string;
}): Promise<number> {
  const invoke = getInvoke();
  if (!invoke) {
    mockSeq += 1;
    mockSongs.unshift({
      id: mockSeq,
      type: "text",
      title: input.title,
      key: input.key ?? null,
      meter: input.meter ?? null,
      tags: [],
      stars: 0,
      source: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      thumbPath: null,
      originalPath: null,
    });
    return mockSeq;
  }
  return invoke<number>("import_text_song", {
    title: input.title,
    key: input.key ?? null,
    meter: input.meter ?? null,
    jianpuText: input.jianpuText,
  });
}

export interface ImportImageResult {
  songId: number;
  title: string;
  path: string;
  phash: string | null;
  duplicateOf: number | null;
  status: "new" | "near" | "duplicate" | "error";
  message: string | null;
  thumbPath: string | null;
}

export async function importImages(paths: string[]): Promise<ImportImageResult[]> {
  const invoke = getInvoke();
  if (!invoke) {
    return paths.map((p) => ({
      songId: -1,
      title: p.split(/[\\/]/).pop() ?? p,
      path: p,
      phash: null,
      duplicateOf: null,
      status: "error" as const,
      message: "浏览器 mock 模式无法读取本地文件，请启动 Tauri",
      thumbPath: null,
    }));
  }
  const rows = await invoke<
    {
      song_id: number;
      title: string;
      path: string;
      phash: string | null;
      duplicate_of: number | null;
      status: string;
      message: string | null;
      thumbPath: string | null;
    }[]
  >("import_images", { paths });
  return rows.map((r) => ({
    songId: r.song_id,
    title: r.title,
    path: r.path,
    phash: r.phash,
    duplicateOf: r.duplicate_of,
    status: r.status as ImportImageResult["status"],
    message: r.message,
    thumbPath: r.thumbPath,
  }));
}

export type EnhancePresetId = "light" | "standard" | "strong";

export interface EnhancePreviewResult {
  path: string;
  preset: string;
  elapsedMs: number;
  inkRatio: number;
  usedSauvola: boolean;
  width: number;
  height: number;
}

export async function enhancePreview(
  path: string,
  preset: EnhancePresetId = "standard",
): Promise<EnhancePreviewResult> {
  const invoke = getInvoke();
  if (!invoke) throw new Error("需要 Tauri 环境");
  const r = await invoke<{
    path: string;
    preset: string;
    elapsed_ms: number;
    ink_ratio: number;
    used_sauvola: boolean;
    width: number;
    height: number;
  }>("enhance_preview", { path, preset });
  return {
    path: r.path,
    preset: r.preset,
    elapsedMs: r.elapsed_ms,
    inkRatio: r.ink_ratio,
    usedSauvola: r.used_sauvola,
    width: r.width,
    height: r.height,
  };
}

export async function saveEnhanceParams(
  songId: number,
  params: Record<string, unknown>,
): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke("save_enhance_params", {
    songId,
    paramsJson: JSON.stringify(params),
  });
}

export async function loadEnhanceParams(
  songId: number,
): Promise<Record<string, unknown> | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  const raw = await invoke<string | null>("load_enhance_params", { songId });
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getSongText(songId: number): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<string | null>("get_song_text", { songId });
}

export async function updateSongText(
  songId: number,
  jianpuText: string,
): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke("update_song_text", { songId, jianpuText });
}

export async function setSongStars(songId: number, stars: number): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke("set_song_stars", { songId, stars });
}

export async function setSongTags(
  songId: number,
  tags: string[],
): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke("set_song_tags", { songId, tags });
}
