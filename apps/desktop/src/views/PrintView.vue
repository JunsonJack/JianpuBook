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

/** 打印校准测试页：量取边距后填校准系数（默认约 1.016） */
const calibrationHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>JianpuBook 打印校准页</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; font-family: sans-serif; }
  .sheet {
    width: 210mm; height: 297mm;
    position: relative;
    box-sizing: border-box;
  }
  .mark { position: absolute; font-size: 9pt; color: #333; }
  .frame {
    position: absolute;
    left: 20mm; top: 20mm; right: 20mm; bottom: 20mm;
    border: 0.4pt solid #000;
  }
  .label { position: absolute; left: 20mm; top: 12mm; font-size: 10pt; }
  .hint { position: absolute; left: 20mm; bottom: 8mm; font-size: 8pt; color: #555; }
  .cross { position: absolute; width: 10mm; height: 10mm; }
  .cross:before, .cross:after {
    content: ""; position: absolute; background: #000;
  }
  .cross:before { left: 0; right: 0; top: 50%; height: 0.3pt; }
  .cross:after { top: 0; bottom: 0; left: 50%; width: 0.3pt; }
</style>
</head>
<body>
<div class="sheet">
  <div class="label">JianpuBook 打印校准页（A4）</div>
  <div class="frame"></div>
  <div class="cross" style="left:15mm;top:15mm"></div>
  <div class="cross" style="right:15mm;top:15mm"></div>
  <div class="cross" style="left:15mm;bottom:15mm"></div>
  <div class="cross" style="right:15mm;bottom:15mm"></div>
  <div class="mark" style="left:20mm;top:18mm">↑ 上边距 20mm</div>
  <div class="mark" style="left:18mm;top:50%">← 左 20mm</div>
  <div class="mark" style="right:18mm;top:50%">右 20mm →</div>
  <div class="mark" style="left:20mm;bottom:18mm">↓ 下 20mm</div>
  <div class="hint">
    打印后量取外框实宽。期望约 170mm（210−40）。实测/期望 = 校准系数倒数；
    设置里「打印校准系数」默认 1.016 可抵消 Chromium 约 1.56% 收缩。
  </div>
</div>
</body>
</html>`;

function showCalibration() {
  html.value = calibrationHtml;
  note.value = "已载入校准测试页，请用系统打印输出后量取边距。";
}
</script>

<template>
  <div>
    <h1>打印预览</h1>
    <p class="hint">
      HTML + CSS <code>@page</code> + 系统打印。目录页码已在组装时写好。
      建议先导出 HTML 再在浏览器打印为 PDF。
    </p>
    <div class="toolbar">
      <button class="btn" :disabled="!html" @click="doPrint">系统打印…</button>
      <button class="btn ghost" :disabled="!html" @click="downloadHtml">
        下载 HTML
      </button>
      <button class="btn ghost" @click="showCalibration">校准测试页</button>
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
  flex-wrap: wrap;
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
