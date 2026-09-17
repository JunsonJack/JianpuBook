<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { Song } from "@/domain/library";
import { hasTauri, importTextSong, listSongs } from "@/services/ipc";

const songs = ref<Song[]>([]);
const loading = ref(false);
const error = ref("");
const tauri = hasTauri();

const draftTitle = ref("未命名");
const draftText = ref("T: 未命名\nK: 1=C\nM: 4/4\n\n1 2 3 4 | 5 - - - ||\n");

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

onMounted(refresh);
</script>

<template>
  <div>
    <h1>曲库</h1>
    <p class="hint">
      本地曲目单一事实来源。
      <span v-if="!tauri" class="badge">浏览器 mock 模式（启动 Tauri 后读 SQLite）</span>
      <span v-else class="badge">Tauri IPC · SQLite</span>
    </p>

    <div class="library-grid">
      <div class="panel">
        <h2>曲目</h2>
        <p v-if="loading">加载中…</p>
        <p v-else-if="error" class="error-list">{{ error }}</p>
        <table v-else class="song-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>标题</th>
              <th>类型</th>
              <th>调号</th>
              <th>拍号</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in songs" :key="s.id">
              <td>{{ s.id }}</td>
              <td>{{ s.title }}</td>
              <td>{{ s.type === "text" ? "文本谱" : "图片谱" }}</td>
              <td>{{ s.key ?? "—" }}</td>
              <td>{{ s.meter ?? "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel">
        <h2>快速录入文本谱</h2>
        <label>
          标题
          <input v-model="draftTitle" class="title-input" />
        </label>
        <textarea v-model="draftText" class="jianpu" spellcheck="false" />
        <button class="btn" @click="importDraft">写入曲库</button>
        <p class="hint">图片拖拽导入 / pHash 去重将在 W1 完整接入（Rust 管线已就绪）。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.library-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 16px;
}
.song-table {
  width: 100%;
  border-collapse: collapse;
}
.song-table th,
.song-table td {
  text-align: left;
  padding: 8px;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
}
.song-table th {
  color: var(--muted);
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
.btn:hover {
  filter: brightness(1.05);
}
</style>
