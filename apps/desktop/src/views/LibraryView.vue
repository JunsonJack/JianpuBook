<script setup lang="ts">
import { ref } from "vue";

const songs = ref([
  { id: 1, title: "小星星", type: "text" as const, key: "1=C", meter: "4/4" },
  { id: 2, title: "（示例）扫描谱", type: "image" as const, key: "—", meter: "—" },
]);
</script>

<template>
  <div>
    <h1>曲库</h1>
    <p class="hint">本地曲目单一事实来源。W1 将接入导入 / pHash 去重 / 标签筛选。</p>
    <div class="panel">
      <table class="song-table">
        <thead>
          <tr>
            <th>标题</th>
            <th>类型</th>
            <th>调号</th>
            <th>拍号</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in songs" :key="s.id">
            <td>{{ s.title }}</td>
            <td>{{ s.type === "text" ? "文本谱" : "图片谱" }}</td>
            <td>{{ s.key }}</td>
            <td>{{ s.meter }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.song-table {
  width: 100%;
  border-collapse: collapse;
}
.song-table th,
.song-table td {
  text-align: left;
  padding: 10px 8px;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
}
.song-table th {
  color: var(--muted);
  font-weight: 600;
}
</style>
