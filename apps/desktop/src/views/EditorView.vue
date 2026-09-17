<script setup lang="ts">
import { computed, ref } from "vue";
import { analyze } from "@jianpubook/jianpu-engine";

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
</script>

<template>
  <div>
    <h1>文本谱编辑</h1>
    <p class="hint">
      JianpuText 即时解析 → 校验 → SVG 谱面预览。数字 / 八度点 / 减时线 / 连音 / 歌词均已绘制。
    </p>
    <div class="editor-layout">
      <div class="panel">
        <textarea v-model="text" class="jianpu" spellcheck="false" />
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
      </div>
    </div>
  </div>
</template>

<style scoped>
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
