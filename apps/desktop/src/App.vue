<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
  <div class="shell">
    <aside class="nav">
      <div class="brand">
        <span class="logo">谱</span>
        <div>
          <div class="name">JianpuBook</div>
          <div class="ver">0.1.0</div>
        </div>
      </div>
      <nav>
        <RouterLink to="/">曲库</RouterLink>
        <RouterLink to="/enhance">图片增强</RouterLink>
        <RouterLink to="/editor">文本谱</RouterLink>
        <RouterLink to="/book">册子排版</RouterLink>
        <RouterLink to="/print">打印预览</RouterLink>
      </nav>
      <p class="foot">本地优先 · 原图不改</p>
    </aside>
    <main class="main">
      <RouterView />
    </main>
  </div>
</template>
