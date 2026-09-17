/**
 * 文件选择：Tauri 2 下 HTML <input type=file> 没有真实磁盘路径。
 * 优先系统对话框拿绝对路径；失败则读字节走 import_images_from_bytes。
 */

import { hasTauri } from "./ipc";

export interface PickedFile {
  /** 真实绝对路径（对话框）；无则 null */
  path: string | null;
  name: string;
  bytes?: Uint8Array;
}

export async function pickImageFiles(): Promise<PickedFile[]> {
  if (!hasTauri()) return [];
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [
        {
          name: "简谱图片",
          extensions: ["jpg", "jpeg", "png", "webp", "bmp", "gif"],
        },
      ],
    });
    if (!selected) return [];
    const list = Array.isArray(selected) ? selected : [selected];
    return list.map((p) => ({
      path: String(p),
      name: String(p).split(/[\\/]/).pop() || "image",
    }));
  } catch {
    return [];
  }
}

export async function pickImageFolder(): Promise<string[]> {
  if (!hasTauri()) return [];
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      directory: true,
    });
    if (!selected) return [];
    return [String(selected)];
  } catch {
    return [];
  }
}

/** 把 HTML File 转成可上传字节（无 path 时的回退） */
export async function filesToBytePayload(
  files: File[],
): Promise<{ name: string; bytes: number[] }[]> {
  const out: { name: string; bytes: number[] }[] = [];
  for (const f of files) {
    const buf = new Uint8Array(await f.arrayBuffer());
    out.push({ name: f.name, bytes: Array.from(buf) });
  }
  return out;
}
