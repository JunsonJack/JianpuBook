/** 监听 Tauri 事件：导入进度等 */

type ListenFn = (
  event: string,
  handler: (payload: unknown) => void,
) => Promise<() => Promise<void>>;

async function getListen(): Promise<ListenFn | null> {
  const w = window as unknown as {
    __TAURI_INTERNALS__?: { listen?: ListenFn };
    __TAURI__?: { listen?: ListenFn };
  };
  if (w.__TAURI_INTERNALS__?.listen) return w.__TAURI_INTERNALS__.listen.bind(w.__TAURI_INTERNALS__);
  if (w.__TAURI__?.listen) return w.__TAURI__.listen.bind(w.__TAURI__);
  try {
    const mod = await import("@tauri-apps/api/event");
    return mod.listen as unknown as ListenFn;
  } catch {
    return null;
  }
}

export interface ImportProgressPayload {
  done: number;
  total: number;
  title: string;
}

export async function onImportProgress(
  handler: (p: ImportProgressPayload) => void,
): Promise<() => void> {
  const listen = await getListen();
  if (!listen) return () => {};
  const un = await listen("import:progress", (payload) => {
    const p = payload as ImportProgressPayload;
    if (p && typeof p.done === "number") handler(p);
  });
  return () => {
    void un();
  };
}
