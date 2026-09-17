<script setup lang="ts">
import { onMounted, ref } from "vue";

const html = ref("");
const note = ref("");

onMounted(() => {
  const stored = sessionStorage.getItem("jianpubook-book-html");
  if (stored) {
    html.value = stored;
  } else {
    note.value = "请先在「册子排版」生成预览，再打开本页。";
  }
});

function doPrint() {
  const frame = document.querySelector<HTMLIFrameElement>("iframe.frame");
  if (frame?.contentWindow) {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    return;
  }
  window.print();
}

function downloadHtml() {
  if (!html.value) return;
  const blob = new Blob([html.value], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "jianpubook-book.html";
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<template>
  <div>
    <h1>打印预览</h1>
    <p class="hint">
      HTML + CSS <code>@page</code> + 系统打印。目录页码已在组装时用两遍渲染写好。
      建议先导出 HTML 再在浏览器打印为 PDF（几何更稳）。
    </p>
    <div class="toolbar">
      <button class="btn" :disabled="!html" @click="doPrint">系统打印…</button>
      <button class="btn ghost" :disabled="!html" @click="downloadHtml">
        下载 HTML
      </button>
    </div>
    <p v-if="note" class="hint">{{ note }}</p>
    <iframe v-if="html" class="frame" :srcdoc="html" title="打印预览" />
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.btn {
  background: var(--accent);
  color: #fff;
  border: 0;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
}
.btn.ghost {
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--accent);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.frame {
  width: 100%;
  height: 75vh;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}
code {
  font-size: 12px;
  background: #eee;
  padding: 1px 4px;
  border-radius: 3px;
}
</style>
