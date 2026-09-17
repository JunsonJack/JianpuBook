<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { Song } from "@/domain/library";
import { convertFileSrc, hasTauri, listSongs } from "@/services/ipc";
import {
  addBookItem,
  createBook,
  deleteBook,
  exportBookJson,
  listBookItems,
  listBooks,
  removeBookItem,
  reorderBookItems,
  renameBook,
  saveBookHtml,
  setBookTheme,
  type BookItemRow,
  type BookSummary,
} from "@/services/bookIpc";
import {
  assembleBookHtml,
  defaultPageSetup,
  type BookTheme,
  type PageSetup,
} from "@/services/book";

const tauri = hasTauri();
const books = ref<BookSummary[]>([]);
const activeBookId = ref<number | null>(null);
const items = ref<BookItemRow[]>([]);
const library = ref<Song[]>([]);
const newTitle = ref("我的简谱册");
const theme = ref<BookTheme>("classic");
const pageSetup = ref<PageSetup>({ ...defaultPageSetup });
const previewHtml = ref("");
const pageCount = ref(0);
const status = ref("");
const error = ref("");

const activeBook = computed(
  () => books.value.find((b) => b.id === activeBookId.value) ?? null,
);

const addableSongs = computed(() => {
  const used = new Set(items.value.map((i) => i.songId));
  return library.value.filter((s) => !used.has(s.id));
});

async function refreshBooks() {
  try {
    books.value = await listBooks();
    if (activeBookId.value == null && books.value.length > 0) {
      activeBookId.value = books.value[0]!.id;
    }
    await refreshItems();
  } catch (e) {
    error.value = String(e);
  }
}

async function refreshItems() {
  if (activeBookId.value == null) {
    items.value = [];
    previewHtml.value = "";
    return;
  }
  items.value = await listBookItems(activeBookId.value);
  library.value = await listSongs();
  rebuildPreview();
}

function enhancedUrlFor(songId: number): string | null {
  const s = library.value.find((x) => x.id === songId);
  if (s?.enhancedPath) return convertFileSrc(s.enhancedPath);
  return null;
}

function rebuildPreview() {
  if (activeBookId.value == null || items.value.length === 0) {
    previewHtml.value = "";
    pageCount.value = 0;
    return;
  }
  const mapped = items.value.map((it) => ({
    songId: it.songId,
    ord: it.ord,
    type: it.type,
    title: it.title,
    key: it.key,
    meter: it.meter,
    originalPath: it.originalPath,
    jianpuText: it.jianpuText,
    displayUrl: it.originalPath ? convertFileSrc(it.originalPath) : null,
    enhancedUrl: enhancedUrlFor(it.songId),
  }));
  const title = activeBook.value?.title ?? newTitle.value;
  const assembled = assembleBookHtml(title, mapped, pageSetup.value, theme.value);
  previewHtml.value = assembled.html;
  pageCount.value = assembled.pageCount;
}

async function onCreateBook() {
  error.value = "";
  try {
    const id = await createBook(newTitle.value.trim() || "未命名册子");
    activeBookId.value = id;
    await refreshBooks();
    status.value = `已创建册子 #${id}`;
  } catch (e) {
    error.value = String(e);
  }
}

async function onSelectBook(id: number) {
  activeBookId.value = id;
  await refreshItems();
}

async function onAddSong(songId: number) {
  if (activeBookId.value == null) return;
  await addBookItem(activeBookId.value, songId);
  await refreshItems();
  books.value = await listBooks();
}

async function onRemoveSong(songId: number) {
  if (activeBookId.value == null) return;
  await removeBookItem(activeBookId.value, songId);
  await refreshItems();
  books.value = await listBooks();
}

async function move(idx: number, dir: -1 | 1) {
  const list = [...items.value];
  const j = idx + dir;
  if (j < 0 || j >= list.length) return;
  const a = list[idx]!;
  const b = list[j]!;
  list[idx] = b;
  list[j] = a;
  items.value = list;
  if (activeBookId.value != null) {
    await reorderBookItems(
      activeBookId.value,
      list.map((x) => x.songId),
    );
  }
  rebuildPreview();
}

async function onThemeChange() {
  if (activeBookId.value == null) return;
  await setBookTheme(
    activeBookId.value,
    theme.value,
    JSON.stringify(pageSetup.value),
  );
  rebuildPreview();
}

async function onRename() {
  if (activeBookId.value == null) return;
  const t = activeBook.value?.title ?? "";
  const next = window.prompt("册子标题", t);
  if (next == null || !next.trim()) return;
  await renameBook(activeBookId.value, next.trim());
  await refreshBooks();
  rebuildPreview();
}

async function onDeleteBook() {
  if (activeBookId.value == null) return;
  if (!window.confirm("删除该册子？（不删曲库与原图）")) return;
  await deleteBook(activeBookId.value);
  activeBookId.value = null;
  await refreshBooks();
}

async function onExport() {
  if (activeBookId.value == null) return;
  const json = await exportBookJson(activeBookId.value);
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${activeBook.value?.title || "book"}.book.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  status.value = "已导出 book.json";
}

async function onExportHtml() {
  if (!previewHtml.value || activeBookId.value == null) return;
  const name = `${(activeBook.value?.title || "book").replace(/[\\/:*?"<>|]/g, "_")}.html`;
  const blob = new Blob([previewHtml.value], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  status.value = "已下载册子 HTML，可用浏览器打印为 PDF";
}

function openPrintPreview() {
  if (!previewHtml.value) return;
  sessionStorage.setItem("jianpubook-book-html", previewHtml.value);
  location.hash = "#/print";
}

onMounted(async () => {
  library.value = await listSongs();
  await refreshBooks();
});
</script>

<template>
  <div>
    <h1>册子排版</h1>
    <p class="hint">
      封面 / 目录两遍渲染 / 曲序拖拽排序。图片谱与文本谱混排。
      <span v-if="!tauri" class="badge">mock 模式</span>
    </p>

    <div class="layout">
      <aside class="side panel">
        <h2>册子</h2>
        <ul class="book-list">
          <li
            v-for="b in books"
            :key="b.id"
            :class="{ active: b.id === activeBookId }"
            @click="onSelectBook(b.id)"
          >
            <strong>{{ b.title }}</strong>
            <span>{{ b.itemCount }} 首</span>
          </li>
        </ul>
        <div class="row">
          <input v-model="newTitle" placeholder="新册子标题" />
          <button class="btn" @click="onCreateBook">新建</button>
        </div>
        <div v-if="activeBook" class="row">
          <button class="btn ghost" @click="onRename">重命名</button>
          <button class="btn danger" @click="onDeleteBook">删除</button>
        </div>

        <h2>页面设置</h2>
        <label>
          主题
          <select v-model="theme" @change="onThemeChange">
            <option value="classic">经典（白底黑谱）</option>
            <option value="warm">护眼（米色）</option>
            <option value="minimal">极简</option>
          </select>
        </label>
        <label>
          纸张
          <select v-model="pageSetup.paper" @change="onThemeChange">
            <option>A4</option>
            <option>Letter</option>
            <option>B5</option>
          </select>
        </label>
        <label class="check">
          <input
            v-model="pageSetup.showCover"
            type="checkbox"
            @change="onThemeChange"
          />
          显示封面
        </label>
        <label class="check">
          <input
            v-model="pageSetup.showToc"
            type="checkbox"
            @change="onThemeChange"
          />
          显示目录
        </label>
        <label>
          页边距 mm
          <input
            v-model.number="pageSetup.marginMm"
            type="number"
            min="8"
            max="30"
            @change="onThemeChange"
          />
        </label>
        <label>
          打印校准系数
          <input
            v-model.number="pageSetup.printScale"
            type="number"
            step="0.001"
            min="0.9"
            max="1.2"
            @change="onThemeChange"
          />
        </label>

        <h2>加入曲目</h2>
        <ul class="add-list">
          <li v-for="s in addableSongs" :key="s.id">
            <span>{{ s.title }}</span>
            <button class="btn tiny" @click="onAddSong(s.id)">+</button>
          </li>
          <li v-if="!addableSongs.length" class="muted">曲库已全部加入或为空</li>
        </ul>
      </aside>

      <section class="main-col">
        <div class="toolbar">
          <span v-if="pageCount">约 {{ pageCount }} 页</span>
          <button class="btn" :disabled="!items.length" @click="openPrintPreview">
            打印预览
          </button>
          <button class="btn ghost" :disabled="!activeBookId" @click="onExport">
            导出 book.json
          </button>
          <button class="btn ghost" :disabled="!previewHtml" @click="onExportHtml">
            下载 HTML
          </button>
        </div>
        <p v-if="status" class="ok">{{ status }}</p>
        <p v-if="error" class="error-list">{{ error }}</p>

        <div v-if="items.length" class="order panel">
          <h2>曲序（{{ items.length }}）</h2>
          <ol>
            <li v-for="(it, i) in items" :key="it.songId">
              <span class="t">{{ it.title }}</span>
              <span class="tag">{{ it.type === "text" ? "文本" : "图片" }}</span>
              <button class="btn tiny ghost" @click="move(i, -1)">↑</button>
              <button class="btn tiny ghost" @click="move(i, 1)">↓</button>
              <button class="btn tiny danger" @click="onRemoveSong(it.songId)">
                移除
              </button>
            </li>
          </ol>
        </div>

        <div v-if="previewHtml" class="preview panel">
          <h2>预览</h2>
          <iframe class="frame" :srcdoc="previewHtml" title="册子预览" />
        </div>
        <div v-else class="panel muted-box">
          选择册子并加入曲目后，这里显示封面/目录/曲目预览。
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  align-items: start;
}
.side h2,
.order h2,
.preview h2 {
  margin: 14px 0 8px;
  font-size: 14px;
}
.side h2:first-child {
  margin-top: 0;
}
.book-list {
  list-style: none;
  padding: 0;
  margin: 0 0 10px;
}
.book-list li {
  display: flex;
  justify-content: space-between;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.book-list li.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.row input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
}
.side label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}
.side label.check {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  color: var(--ink);
}
.side select,
.side input[type="number"] {
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
}
.add-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 180px;
  overflow: auto;
}
.add-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 13px;
}
.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}
.btn {
  background: var(--accent);
  color: #fff;
  border: 0;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
}
.btn.ghost {
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--accent);
}
.btn.danger {
  background: #a33;
}
.btn.tiny {
  padding: 2px 8px;
  font-size: 12px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.order ol {
  margin: 0;
  padding-left: 18px;
}
.order li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 13px;
}
.order .t {
  flex: 1;
}
.tag {
  font-size: 11px;
  color: var(--muted);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0 4px;
}
.frame {
  width: 100%;
  height: 70vh;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}
.muted-box {
  color: var(--muted);
  font-size: 13px;
}
.ok {
  color: var(--accent);
  font-size: 13px;
}
.muted {
  color: var(--muted);
}
</style>
