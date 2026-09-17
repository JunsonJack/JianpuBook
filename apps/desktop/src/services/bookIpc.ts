/** 册子 IPC */

import { hasTauri } from "./ipc";

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

export interface BookSummary {
  id: number;
  title: string;
  pagesetup: string;
  theme: string;
  itemCount: number;
}

export interface BookItemRow {
  songId: number;
  ord: number;
  type: "image" | "text";
  title: string;
  key: string | null;
  meter: string | null;
  originalPath: string | null;
  jianpuText: string | null;
}

const mockBooks: BookSummary[] = [];
const mockItems = new Map<number, BookItemRow[]>();

export async function createBook(title: string): Promise<number> {
  const invoke = getInvoke();
  if (!invoke) {
    const id = mockBooks.length + 1;
    mockBooks.unshift({
      id,
      title,
      pagesetup: "{}",
      theme: "classic",
      itemCount: 0,
    });
    mockItems.set(id, []);
    return id;
  }
  return invoke<number>("create_book", { title });
}

export async function listBooks(): Promise<BookSummary[]> {
  const invoke = getInvoke();
  if (!invoke) return [...mockBooks];
  return invoke<BookSummary[]>("list_books");
}

export async function deleteBook(bookId: number): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) {
    const i = mockBooks.findIndex((b) => b.id === bookId);
    if (i >= 0) mockBooks.splice(i, 1);
    return;
  }
  await invoke("delete_book", { bookId });
}

export async function renameBook(bookId: number, title: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) {
    const b = mockBooks.find((x) => x.id === bookId);
    if (b) b.title = title;
    return;
  }
  await invoke("rename_book", { bookId, title });
}

export async function setBookTheme(
  bookId: number,
  theme: string,
  pagesetup: string,
): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke("set_book_theme", { bookId, theme, pagesetup });
}

export async function addBookItem(bookId: number, songId: number): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) {
    const list = mockItems.get(bookId) ?? [];
    if (!list.some((x) => x.songId === songId)) {
      list.push({
        songId,
        ord: list.length,
        type: "text",
        title: `曲目 ${songId}`,
        key: "1=C",
        meter: "4/4",
        originalPath: null,
        jianpuText: "1 2 3 4 | 5 - - - ||",
      });
      mockItems.set(bookId, list);
    }
    return;
  }
  await invoke("add_book_item", { bookId, songId });
}

export async function removeBookItem(bookId: number, songId: number): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) {
    const list = mockItems.get(bookId) ?? [];
    mockItems.set(
      bookId,
      list.filter((x) => x.songId !== songId),
    );
    return;
  }
  await invoke("remove_book_item", { bookId, songId });
}

export async function reorderBookItems(
  bookId: number,
  songIds: number[],
): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke("reorder_book_items", { bookId, songIds });
}

export async function listBookItems(bookId: number): Promise<BookItemRow[]> {
  const invoke = getInvoke();
  if (!invoke) return [...(mockItems.get(bookId) ?? [])];
  return invoke<BookItemRow[]>("list_book_items", { bookId });
}

export async function exportBookJson(bookId: number): Promise<string> {
  const invoke = getInvoke();
  if (!invoke) return JSON.stringify({ mock: true, bookId }, null, 2);
  return invoke<string>("export_book_json", { bookId });
}

export async function saveBookHtml(path: string, html: string): Promise<string> {
  const invoke = getInvoke();
  if (!invoke) throw new Error("需要 Tauri");
  return invoke<string>("save_book_html", { path, html });
}

export async function revealPath(path: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke("reveal_path", { path });
}

export function bookIpcAvailable(): boolean {
  return hasTauri();
}
