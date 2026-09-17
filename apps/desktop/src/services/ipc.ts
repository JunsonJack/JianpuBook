/** Tauri IPC 封装；无 Tauri 环境时回退到内存 mock，便于纯浏览器开发。 */

import type { Song } from "@/domain/library";

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): InvokeFn | null {
  const w = window as unknown as {
    __TAURI_INTERNALS__?: { invoke: InvokeFn };
    __TAURI__?: { invoke: InvokeFn };
  };
  if (w.__TAURI_INTERNALS__?.invoke) return w.__TAURI_INTERNALS__.invoke.bind(w.__TAURI_INTERNALS__);
  if (w.__TAURI__?.invoke) return w.__TAURI__.invoke.bind(w.__TAURI__);
  return null;
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
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ""),
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

export async function importImageSong(input: {
  title: string;
  path: string;
  phash?: string;
}): Promise<{ songId: number; duplicateOf: number | null }> {
  const invoke = getInvoke();
  if (!invoke) {
    return { songId: -1, duplicateOf: null };
  }
  const r = await invoke<{ song_id: number; duplicate_of: number | null }>(
    "import_image_song",
    {
      title: input.title,
      path: input.path,
      phash: input.phash ?? null,
    },
  );
  return { songId: r.song_id, duplicateOf: r.duplicate_of };
}

export function hasTauri(): boolean {
  return getInvoke() !== null;
}
