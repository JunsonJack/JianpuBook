<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { Song } from "@/domain/library";
import {
  batchEnhanceImages,
  convertFileSrc,
  enhancePreview,
  hasTauri,
  listSongs,
  loadEnhanceParams,
  saveEnhanceParams,
  type EnhancePresetId,
} from "@/services/ipc";

const tauri = hasTauri();
const imageSongs = ref<Song[]>([]);
const selectedId = ref<number | null>(null);
const preset = ref<EnhancePresetId>("standard");
const split = ref(50);
const busy = ref(false);
const error = ref("");
const savedNote = ref("");

const originalUrl = ref<string | null>(null);
const enhancedUrl = ref<string | null>(null);
const filePath = ref<string | null>(null);
const meta = ref<{
  elapsedMs: number;
  inkRatio: number;
  usedSauvola: boolean;
  width: number;
  height: number;
} | null>(null);

const presets: { id: EnhancePresetId; label: string; desc: string }[] = [
  { id: "light", label: "轻度", desc: "去偏 + median3 + Otsu" },
  { id: "standard", label: "标准", desc: "默认；墨量>15% 回退 Sauvola" },
  { id: "strong", label: "强力", desc: "median5 + 更严墨量阈 + 裁白边" },
];

const selected = computed(
  () => imageSongs.value.find((s) => s.id === selectedId.value) ?? null,
);

const enhClip = computed(() => `inset(0 ${100 - split.value}% 0 0)`);

async function refreshLibrary() {
  if (!tauri) return;
  try {
    const all = await listSongs();
    imageSongs.value = all.filter((s) => s.type === "image" && s.originalPath);
    if (imageSongs.value.length > 0 && selectedId.value === null) {
      selectedId.value = imageSongs.value[0]!.id;
    }
  } catch (e) {
    error.value = String(e);
  }
}

async function runEnhance() {
  error.value = "";
  savedNote.value = "";
  if (!filePath.value || !tauri) return;
  busy.value = true;
  try {
    const out = await enhancePreview(filePath.value, preset.value);
    enhancedUrl.value = convertFileSrc(out.path);
    meta.value = {
      elapsedMs: out.elapsedMs,
      inkRatio: out.inkRatio,
      usedSauvola: out.usedSauvola,
      width: out.width,
      height: out.height,
    };
    if (selectedId.value != null) {
      await saveEnhanceParams(selectedId.value, {
        preset: preset.value,
        note: "non-destructive",
      });
      savedNote.value = "增强参数已保存（原图未修改）";
    }
  } catch (e) {
    error.value = String(e);
    enhancedUrl.value = null;
  } finally {
    busy.value = false;
  }
}

function loadSelected() {
  const s = selected.value;
  if (!s?.originalPath) {
    originalUrl.value = null;
    enhancedUrl.value = null;
    filePath.value = null;
    return;
  }
  filePath.value = s.originalPath;
  originalUrl.value = convertFileSrc(s.originalPath);
  enhancedUrl.value = null;
  void runEnhance();
}

async function onPickFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;
  const anyF = f as File & { path?: string };
  filePath.value = anyF.path || f.name;
  originalUrl.value = URL.createObjectURL(f);
  enhancedUrl.value = null;
  selectedId.value = null;
  if (tauri) await runEnhance();
}

watch(selectedId, () => {
  void loadSelected();
});

watch(preset, () => {
  if (filePath.value) void runEnhance();
});

const statusMsg = ref("");

async function runBatch() {
  if (!tauri) return;
  busy.value = true;
  error.value = "";
  statusMsg.value = "";
  try {
    const results = await batchEnhanceImages(preset.value);
    statusMsg.value = `已批量增强 ${results.length} 张，输出在应用数据目录 enhanced/`;
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await refreshLibrary();
  const pick = sessionStorage.getItem("jianpubook-enhance-pick");
  if (pick) {
    try {
      const o = JSON.parse(pick) as { id?: number };
      if (o.id != null) selectedId.value = o.id;
    } catch {
      /* ignore */
    }
    sessionStorage.removeItem("jianpubook-enhance-pick");
  }
  loadSelected();
  if (selectedId.value != null) {
    const p = await loadEnhanceParams(selectedId.value);
    if (p && typeof p.preset === "string") {
      preset.value = p.preset as EnhancePresetId;
    }
  }
});
</script>

<template>
  <div>
    <h1>图片增强</h1>
    <p class="hint">
      非破坏性：去偏（投影方差）→ median3 → Otsu / Sauvola 回退。原图永不修改。
      <span v-if="!tauri" class="badge">需 Tauri 才能跑增强管线</span>
    </p>

    <div class="toolbar panel">
      <label>
        曲库图片
        <select v-model="selectedId" :disabled="!tauri || imageSongs.length === 0">
          <option :value="null" disabled>
            {{ imageSongs.length ? "请选择" : "曲库暂无图片谱" }}
          </option>
          <option v-for="s in imageSongs" :key="s.id" :value="s.id">
            #{{ s.id }} {{ s.title }}
          </option>
        </select>
      </label>
      <label>
        或选择文件
        <input type="file" accept="image/*" @change="onPickFile" />
      </label>
      <div class="presets">
        <button
          v-for="p in presets"
          :key="p.id"
          type="button"
          class="preset-btn"
          :class="{ active: preset === p.id }"
          :title="p.desc"
          @click="preset = p.id"
        >
          {{ p.label }}
        </button>
      </div>
      <button class="btn" :disabled="busy || !filePath || !tauri" @click="runEnhance">
        {{ busy ? "处理中…" : "重新增强" }}
      </button>
      <button class="btn ghost" :disabled="busy || !tauri" @click="runBatch">
        批量增强曲库图片
      </button>
    </div>

    <p v-if="statusMsg" class="ok-note">{{ statusMsg }}</p>

    <p v-if="error" class="error-list">{{ error }}</p>
    <p v-if="savedNote" class="ok-note">{{ savedNote }}</p>

    <div v-if="originalUrl" class="panel">
      <div class="compare">
        <img class="base" :src="originalUrl" alt="原图" draggable="false" />
        <img
          v-if="enhancedUrl"
          class="over"
          :src="enhancedUrl"
          alt="增强后"
          :style="{ clipPath: enhClip }"
          draggable="false"
        />
        <div class="divider" :style="{ left: split + '%' }" />
        <input
          v-model.number="split"
          class="slider"
          type="range"
          min="0"
          max="100"
          aria-label="左右对比"
        />
      </div>
      <div class="labels">
        <span>← 增强后</span>
        <span>原图 →</span>
      </div>
      <p class="hint">
        预设：<strong>{{ presets.find((p) => p.id === preset)?.label }}</strong>
        — {{ presets.find((p) => p.id === preset)?.desc }}
      </p>
      <p v-if="meta" class="hint">
        {{ meta.width }}×{{ meta.height }} ·
        墨量 {{ (meta.inkRatio * 100).toFixed(1) }}% ·
        {{ meta.usedSauvola ? "Sauvola 回退" : "Otsu" }} ·
        {{ meta.elapsedMs }}ms
      </p>
    </div>
    <div v-else class="panel empty">
      <p>从曲库选择图片谱，或点「选择文件」。导入图片请先到「曲库」页拖入。</p>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  margin-bottom: 16px;
}
.toolbar label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}
.toolbar select {
  min-width: 180px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}
.presets {
  display: flex;
  gap: 6px;
}
.preset-btn {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
}
.preset-btn.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.btn {
  background: var(--accent);
  color: #fff;
  border: 0;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ok-note {
  color: var(--accent);
  font-size: 13px;
}
.compare {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  background: #eceae4;
  max-height: 68vh;
  line-height: 0;
}
.compare img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 68vh;
  object-fit: contain;
  margin: 0 auto;
}
.compare .over {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: transparent;
}
.divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  transform: translateX(-1px);
}
.slider {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 10px;
  width: calc(100% - 24px);
  z-index: 3;
  cursor: ew-resize;
}
.labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted);
  margin-top: 8px;
  line-height: 1.4;
}
.empty {
  color: var(--muted);
}
</style>
