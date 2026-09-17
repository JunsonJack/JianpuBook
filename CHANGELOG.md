# Changelog

## 0.1.0 — MVP（2026-09-17）

### 核心

- **jianpu-engine**（50 单测）
  - 解析 / 时值校验 / 连音 / 三连音括号 / 歌词分节与多段
  - SVG 谱面、音级移调（只改 K）
- **img-pipeline**（15+1 测试）
  - 去偏、median、Otsu+Sauvola、unsharp、裁白边
  - dHash 去重 + 缩略图
- **曲库 W1**
  - 并行 pHash 批量导入、重复/近重复、缩略图墙
  - 搜索/类型/星级筛选、多选批量加入册子、标签与星级
- **增强 W2**
  - 三档预设、前后对比、参数保存、批量增强写入 `enhanced/`
- **册子 W4 / 打印 W5**
  - CRUD、曲序、封面/目录、混排、导出 book.json / HTML
  - @page、系统打印、校准页；Chrome headless 量得 A4 ≈ 209.9×297.0 mm

### 工程

- monorepo：engine / img-pipeline / desktop
- `npm run test:all` 全绿
- tauri:dev 端口 1420 固定；修掉 vite.config.js 遮蔽问题

### 未做

- 打印几何 CI 门槛、超分、网络采集、OCR、多声部、拼页小册子
