# JianpuBook — Agent Notes

本地简谱收集 / 增强 / 成册打印桌面应用。工作区 monorepo。

## 常用命令

```bash
npm install
npm run test:all          # 全部测试
npm run test:engine
npm run test:desktop
npm run test:img          # cargo test img-pipeline
npm run test:app          # cargo test src-tauri --lib
npm run tauri:dev         # 桌面开发（Vite 127.0.0.1:1420）
npm run dev:desktop       # 纯前端 mock
```

## 结构

- `packages/jianpu-engine` — JianpuText 解析、校验、连音、SVG、音级移调
- `crates/img-pipeline` — 去偏/二值化/去噪/pHash/缩略图（墨=0 背景=255）
- `apps/desktop` — Vue 五页 + Tauri IPC + SQLite
- `apps/desktop/src/services/book.ts` — 册子 HTML 组装（封面/目录/两遍页码）

## 红线

1. 二值图极性：**墨=0 / 背景=255**（含 imageproc 形态学出口）
2. 去重：median3 → deskew → 整页归一化 → 照明归一化 → dHash；阈值 ≤10 / 11–14 / ≥16
3. 默认去噪仅 median3；连通域 ≤50px
4. 不做 OCR / 五线谱 / 云曲库 / 联网 AI 修图
5. 原图永不修改；增强参数存 `enhance` 表可重算
6. Vite 端口与 `tauri.conf.json` 的 `devUrl` 必须一致（当前 1420）
7. 不要留下编译出的 `vite.config.js`（会遮住 `.ts`）

## 数据

- SQLite：`app_data/library.db`（schema 见 `src-tauri/migrations/001_init.sql`）
- 缩略图：`app_data/thumbs/{phash}.png`
- 增强预览：系统临时目录 `jianpubook-enhance/`

## 测试期望

提交前至少：`npm run test:all` 全绿。
