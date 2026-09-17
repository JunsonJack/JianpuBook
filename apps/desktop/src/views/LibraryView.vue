<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { Song } from "@/domain/library";
import {
  convertFileSrc,
  getSongText,
  hasTauri,
  importImages,
  importTextSong,
  listSongs,
  setSongStars,
  type ImportImageResult,
} from "@/services/ipc";
import { addBookItem, listBooks, type BookSummary } from "@/services/bookIpc";

const router = useRouter();

const songs = ref<Song[]>([]);
const loading = ref(false);
const error = ref("");
const importing = ref(false);
const importLog = ref<ImportImageResult[]>([]);
const tauri = hasTauri();

const draftTitle = ref("未命名");
const draftText = ref("T: 未命名\nK: 1=C\nM: 4/4\n\n1 2 3 4 | 5 - - - ||\n");

const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const filterText = ref("");
const filterType = ref<"all" | "image" | "text">("all");
const filterMinStars = ref(0);
const selectedIds = ref<Set<number>>(new Set());
const books = ref<BookSummary[]>([]);
const targetBookId = ref<number | null>(null);
const bulkNote = ref("");

const imageCount = computed(
  () => songs.value.filter((s) => s.type === "image").length,
);

const filteredSongs = computed(() => {
  const q = filterText.value.trim().toLowerCase();
  return songs.value.filter((s) => {
    if (filterType.value !== "all" && s.type !== filterType.value) return false;
    if (s.stars < filterMinStars.value) return false;
    if (!q) return true;
    return (
      s.title.toLowerCase().includes(q) ||
      (s.tags || []).some((t) => t.toLowerCase().includes(q)) ||
      (s.key ?? "").toLowerCase().includes(q)
    );
  });
});

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    songs.value = await listSongs();
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

async function importDraft() {
  try {
    await importTextSong({
      title: draftTitle.value || "未命名",
      jianpuText: draftText.value,
      key: "1=C",
      meter: "4/4",
    });
    await refresh();
  } catch (e) {
    error.value = String(e);
  }
}

/** HTML File 在 Tauri 下 path 可能是 web fake path；优先 webkitRelativePath / path */
function filePathOf(f: File): string {
  const anyF = f as File & { path?: string };
  return anyF.path || (f as unknown as { webkitRelativePath?: string }).webkitRelativePath || f.name;
}

async function handleFiles(list: FileList | File[] | null) {
  if (!list || list.length === 0) return;
  const files = Array.from(list);
  const paths = files.map(filePathOf).filter(Boolean);
  if (paths.length === 0) return;
  importing.value = true;
  error.value = "";
  try {
    const results = await importImages(paths);
    importLog.value = results;
    await refresh();
  } catch (e) {
    error.value = String(e);
  } finally {
    importing.value = false;
  }
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  void handleFiles(e.dataTransfer?.files ?? null);
}

function pickFiles() {
  fileInput.value?.click();
}

function thumbSrc(s: Song): string | null {
  if (s.thumbPath) return convertFileSrc(s.thumbPath);
  return null;
}

onMounted(async () => {
  await refresh();
  if (tauri) {
    try {
      books.value = await listBooks();
      if (books.value.length) targetBookId.value = books.value[0]!.id;
    } catch {
      /* ignore */
    }
  }
});

function toggleSelect(id: number, ev: MouseEvent) {
  ev.stopPropagation();
  if (selectedIds.value.has(id)) selectedIds.value.delete(id);
  else selectedIds.value.add(id);
  // 触发更新
  selectedIds.value = new Set(selectedIds.value);
}

async function addSelectedToBook() {
  if (targetBookId.value == null || selectedIds.value.size === 0) return;
  let n = 0;
  for (const id of selectedIds.value) {
    try {
      await addBookItem(targetBookId.value, id);
      n += 1;
    } catch (e) {
      error.value = String(e);
    }
  }
  selectedIds.value = new Set();
  bulkNote.value = `已加入册子 #${targetBookId.value}：${n} 首`;
}


async function openInEditor(s: Song) {
  if (s.type === "text") {
    const body = await getSongText(s.id);
    if (body) {
      sessionStorage.setItem(
        "jianpubook-edit-song",
        JSON.stringify({ id: s.id, title: s.title, text: body }),
      );
    } else {
      sessionStorage.setItem(
        "jianpubook-edit-song",
        JSON.stringify({
          id: s.id,
          title: s.title,
          text: `T: ${s.title}\nK: ${s.key ?? "1=C"}\nM: ${s.meter ?? "4/4"}\n\n`,
        }),
      );
    }
    void router.push("/editor");
    return;
  }
  // 图片谱 → 增强页
  if (s.originalPath) {
    sessionStorage.setItem(
      "jianpubook-enhance-pick",
      JSON.stringify({ id: s.id, path: s.originalPath }),
    );
  }
  void router.push("/enhance");
}

async function bumpStars(s: Song) {
  const next = (s.stars + 1) % 6;
  s.stars = next;
  try {
    await setSongStars(s.id, next);
  } catch (e) {
    error.value = String(e);
  }
}

</script>

<template>
  <div>
    <h1>曲库</h1>
    <p class="hint">
      本地曲目 ·
      <span class="badge">{{ tauri ? "Tauri · SQLite" : "浏览器 mock" }}</span>
      · 图片 {{ imageCount }} · pHash 去重（≤10 重复 / 11–14 近重复）
    </p>

    <div
      class="drop-zone"
      :class="{ over: dragOver }"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <p>拖入简谱图片（jpg/png/webp…）或文件夹内文件</p>
      <button class="btn" :disabled="importing" @click="pickFiles">
        {{ importing ? "导入中…" : "选择图片" }}
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        class="hidden-input"
        @change="handleFiles(($event.target as HTMLInputElement).files)"
      />
    </div>

    <div v-if="importLog.length" class="panel import-log">
      <h2>本次导入</h2>
      <ul>
        <li v-for="(r, i) in importLog" :key="i">
          <span class="status" :class="r.status">{{ r.status }}</span>
          {{ r.title }}
          <span v-if="r.message" class="msg">{{ r.message }}</span>
        </li>
      </ul>
    </div>

    <div class="filters panel">
      <input v-model="filterText" placeholder="搜索标题 / 标签 / 调号" />
      <select v-model="filterType">
        <option value="all">全部</option>
        <option value="text">文本谱</option>
        <option value="image">图片谱</option>
      </select>
      <select v-model.number="filterMinStars">
        <option :value="0">星级不限</option>
        <option :value="1">≥1 星</option>
        <option :value="3">≥3 星</option>
        <option :value="5">5 星</option>
      </select>
      <span class="count">{{ filteredSongs.length }} / {{ songs.length }}</span>
      <template v-if="selectedIds.size">
        <span class="bulk">已选 {{ selectedIds.size }}</span>
        <select v-model="targetBookId">
          <option v-for="b in books" :key="b.id" :value="b.id">
            {{ b.title }}（{{ b.itemCount }}）
          </option>
        </select>
        <button class="btn" :disabled="!targetBookId" @click="addSelectedToBook">
          加入册子
        </button>
      </template>
      <span v-if="bulkNote" class="bulk-note">{{ bulkNote }}</span>
    </div>

    <div class="library-grid">
      <div class="panel">
        <h2>曲目（{{ songs.length }}）</h2>
        <p v-if="loading">加载中…</p>
        <p v-else-if="error" class="error-list">{{ error }}</p>
        <div v-else class="song-wall">
          <article
            v-for="s in filteredSongs"
            :key="s.id"
            class="song-card"
            :class="{ clickable: true, selected: selectedIds.has(s.id) }"
            :title="s.type === 'text' ? '打开编辑' : '打开增强'"
            @click="openInEditor(s)"
          >
            <label class="pick" @click.stop>
              <input
                type="checkbox"
                :checked="selectedIds.has(s.id)"
                @click="toggleSelect(s.id, $event)"
              />
            </label>
            <div class="thumb">
              <img v-if="thumbSrc(s)" :src="thumbSrc(s)!" :alt="s.title" />
              <div v-else class="thumb-placeholder">
                {{ s.type === "text" ? "谱" : "图" }}
              </div>
            </div>
            <div class="song-meta">
              <strong>{{ s.title }}</strong>
              <span>{{ s.key ?? "—" }} · {{ s.meter ?? "—" }}</span>
              <span
                class="stars"
                @click.stop="bumpStars(s)"
                :title="'点击加星（当前 ' + s.stars + '）'"
              >
                {{ "★".repeat(s.stars) }}{{ "☆".repeat(5 - s.stars) }}
              </span>
            </div>
          </article>
        </div>
      </div>

      <div class="panel">
        <h2>快速录入文本谱</h2>
        <label>
          标题
          <input v-model="draftTitle" class="title-input" />
        </label>
        <textarea v-model="draftText" class="jianpu" spellcheck="false" />
        <button class="btn" @click="importDraft">写入曲库</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drop-zone {
  border: 2px dashed var(--line);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  margin-bottom: 16px;
  background: var(--panel);
  transition: border-color 0.15s, background 0.15s;
}
.drop-zone.over {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.hidden-input {
  display: none;
}
.import-log {
  margin-bottom: 16px;
}
.import-log ul {
  margin: 0;
  padding-left: 0;
  list-style: none;
}
.import-log li {
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.status {
  display: inline-block;
  min-width: 56px;
  margin-right: 8px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: #eee;
}
.status.new {
  background: #dcefe4;
  color: #1d6b45;
}
.status.near {
  background: #f5ecd0;
  color: #8a6a12;
}
.status.duplicate {
  background: #f0e0e0;
  color: #8a2e2e;
}
.status.error {
  background: #f0e0e0;
  color: #8a2e2e;
}
.msg {
  color: var(--muted);
  margin-left: 8px;
}
.library-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
}
.song-wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}
.song-card {
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  background: #faf9f6;
}
.song-card.clickable {
  cursor: pointer;
}
.song-card.clickable:hover {
  border-color: var(--accent);
}
.thumb {
  aspect-ratio: 3/4;
  background: #eee;
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.thumb-placeholder {
  color: var(--muted);
  font-size: 28px;
  font-weight: 700;
}
.song-meta {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}
.song-meta span {
  color: var(--muted);
}
.stars {
  cursor: pointer;
  color: #c9a227 !important;
  letter-spacing: 1px;
  user-select: none;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
  padding: 10px 12px;
}
.filters input,
.filters select {
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
}
.filters input {
  min-width: 180px;
}
.filters .count {
  margin-left: auto;
  color: var(--muted);
  font-size: 12px;
}
.bulk {
  font-size: 12px;
  color: var(--accent);
  font-weight: 600;
}
.bulk-note {
  font-size: 12px;
  color: var(--accent);
}
.song-card.selected {
  outline: 2px solid var(--accent);
}
.pick {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 2;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 4px;
  padding: 2px;
}
.song-card {
  position: relative;
}
h2 {
  margin: 0 0 12px;
  font-size: 16px;
}
.title-input {
  display: block;
  width: 100%;
  margin: 4px 0 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 14px;
}
.btn {
  margin-top: 10px;
  background: var(--accent);
  color: #fff;
  border: 0;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 14px;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
