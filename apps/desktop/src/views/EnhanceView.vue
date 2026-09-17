<template>
  <div>
    <h1>图片增强</h1>
    <p class="hint">
      非破坏性管线：去偏（投影方差）→ median3 → Otsu / Sauvola 回退。W2 接入 Rust IPC 与前后对比滑块。
    </p>
    <div class="panel">
      <p>预留：拖入图片、三档预设（轻度 / 标准 / 强力）、参数保存与重算。</p>
    </div>
  </div>
</template>
