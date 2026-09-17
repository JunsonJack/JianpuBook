<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { analyze, transposeJianpuText } from "@jianpubook/jianpu-engine";
import {
  hasTauri,
  listSongs,
  importTextSong,
  updateSongText,
} from "@/services/ipc";

const KEYS = [
  "1=C",
  "1=G",
  "1=D",
  "1=A",
  "1=E",
  "1=F",
  "1=bB",
  "1=bE",
  "1=bA",
  "1=bD",
];

const sample = `T: 小星星
K: 1=C
M: 4/4
Q: ♩=100
S: 儿歌

1 1 5 5 | 6 6 5 - |
词: 一 闪 一 闪 亮 晶 晶 ~

4 4 3 3 | 2 2 1 - ||
词: 满 天 都 是 小 星 星 ~
`;

const text = ref(sample);
const title = ref("小星星");
const status = ref("");
const error = ref("");
const tauri = hasTauri();
const libraryTextSongs = ref<{ id: number; title: string }[]>([]);
const editSongId = ref<number | null>(null);

const result = computed(() => {
  try {
    return analyze(text.value);
  } catch {
    return null;
  }
});

const measureSummary = computed(() => {
  if (!result.value) return "";
  return result.value.validation.measures
    .map((m) => `#${m.number}:${m.beats.toFixed(2)}拍`)
    .join("  ");
});

const beamSummary = computed(() => {
  if (!result.value) return "";
  return result.value.beams
    .slice(0, 8)
    .map((b) => `m${b.measure}[${b.indices.join(",")}]`)
    .join("  ");
});

async function refreshTextSongs() {
  if (!tauri) return;
  try {
    const all = await listSongs();
    libraryTextSongs.value = all
      .filter((s) => s.type === "text")
      .map((s) => ({ id: s.id, title: s.title }));
  } catch {
    /* ignore */
  }
}

async function saveToLibrary() {
  status.value = "";
  error.value = "";
  try {
    if (editSongId.value != null && tauri) {
      await updateSongText(editSongId.value, text.value);
      status.value = `已更新曲库 #${editSongId.value}`;
      return;
    }
    const id = await importTextSong({
      title: title.value || result.value?.song.headers.T || "未命名",
      key: result.value?.song.headers.K,
      meter: result.value?.song.headers.M,
      jianpuText: text.value,
    });
    editSongId.value = id;
    status.value = tauri
      ? `已写入曲库 #${id}`
      : `mock 写入 #${id}（启动 Tauri 后落库）`;
    await refreshTextSongs();
  } catch (e) {
    error.value = String(e);
  }
}

function copyText() {
  void navigator.clipboard.writeText(text.value);
  status.value = "源码已复制";
}

function applyTranspose(toKey: string) {
  text.value = transposeJianpuText(text.value, toKey);
  status.value = `已移调到 ${toKey}（数字不变）`;
}

onMounted(async () => {
  const raw = sessionStorage.getItem("jianpubook-edit-song");
  if (raw) {
    try {
      const o = JSON.parse(raw) as { id?: number; title?: string; text?: string };
      if (o.text) {
        text.value = o.text;
        if (o.title) title.value = o.title;
        if (o.id != null) editSongId.value = o.id;
        status.value = o.id != null ? `正在编辑曲库 #${o.id}` : "已载入草稿";
      }
    } catch {
      /* ignore */
    }
    sessionStorage.removeItem("jianpubook-edit-song");
  }
  await refreshTextSongs();
});
</script>

<template>
  <div>
    <h1>文本谱编辑</h1>
    <p class="hint">
      JianpuText 即时解析 → 校验 → SVG 谱面。可保存进曲库后加入册子。
    </p>
    <div class="editor-layout">
      <div class="panel">
        <div class="row">
          <input v-model="title" class="title-input" placeholder="曲名" />
          <label class="key-pick">
            移调
            <select @change="applyTranspose(($event.target as HTMLSelectElement).value)">
              <option value="">—</option>
              <option v-for="k in KEYS" :key="k" :value="k">{{ k }}</option>
            </select>
          </label>
          <button class="btn" @click="saveToLibrary">存入曲库</button>
          <button class="btn ghost" @click="copyText">复制源码</button>
        </div>
        <textarea v-model="text" class="jianpu" spellcheck="false" />
        <p v-if="status" class="ok">{{ status }}</p>
        <div v-if="result?.parseErrors.length" class="error-list">
          无法解析：{{ result.parseErrors.join(", ") }}
        </div>
        <div v-if="result?.validation.errors.length" class="error-list">
          <div v-for="(e, i) in result.validation.errors" :key="i">{{ e.message }}</div>
        </div>
      </div>
      <div class="panel">
        <div class="meta">
          <span class="badge">{{ result?.song.headers.M ?? "—" }}</span>
          <span class="badge">{{ result?.song.headers.K ?? "—" }}</span>
          <span>小节 {{ result?.validation.measures.length ?? 0 }}</span>
          <span>歌词段 {{ result?.song.lyrics.length ?? 0 }}</span>
          <span class="badge">
            {{ result?.validation.errors.length ? "校验有问题" : "校验通过" }}
          </span>
        </div>
        <div class="score-preview" v-html="result?.svg ?? ''" />
        <p class="hint">时值：{{ measureSummary || "—" }}</p>
        <p class="hint">连音组：{{ beamSummary || "无" }}</p>
        <p v-if="libraryTextSongs.length" class="hint">
          曲库文本谱：{{ libraryTextSongs.map((s) => s.title).join("、") }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.key-pick {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
.key-pick select {
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
}
.title-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 14px;
}
.btn {
  background: var(--accent);
  color: #fff;
  border: 0;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
}
.btn.ghost {
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--accent);
}
.ok {
  color: var(--accent);
  font-size: 13px;
  margin: 6px 0;
}
.score-preview {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  padding: 8px;
  margin-bottom: 12px;
}
.score-preview :deep(svg) {
  display: block;
  max-width: 100%;
  height: auto;
}
</style>
