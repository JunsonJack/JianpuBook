# JianpuBook

简谱收集 · 清晰化 · 排版打印一体桌面工具。

> 把散落在相册、聊天记录、简谱站里的简谱图片收集进来，去噪增强，和自编的文本简谱混排成一本带封面、目录、页码、可直接双面打印的专业简谱册子。

## 状态

| 阶段 | 状态 |
|---|---|
| W0 调研定标 | ✅ 完成（`docs/W0-排版与增强实测.md`） |
| jianpu-engine 解析器 + SVG 渲染 | ✅ 46 单测 |
| img-pipeline 增强/去重/文件 IO | ✅ 13+1 集成测试 |
| W1 曲库导入 | ✅ 批量图片 pHash 去重 + 缩略图墙 + IPC |
| W2 图片增强 UI | ✅ 三档预设 + 前后对比滑块 + 参数保存 |
| W4 册子排版 | ✅ CRUD / 曲序 / 封面目录 / 预览 / 导出 book.json |
| W5 打印预览 | ✅ @page HTML + 系统打印 + 下载 HTML |
| 桌面端 | 🚧 Vue 五页 + Tauri 2；浏览器 mock 可开发 |

## 仓库结构

```
JianpuBook/
├── apps/desktop/          # Tauri 2 + Vue 3 桌面端
├── packages/jianpu-engine/ # JianpuText 解析 / 校验 / 连音 / 移调（框架无关 TS）
├── crates/img-pipeline/   # 去偏 / 二值化 / 去噪 / pHash 去重（Rust）
├── docs/                  # W0 实测笔记
└── w0/                    # 调研探针（Python / Rust probe）
```

## 开发

```bash
npm install
npm run test:engine        # JianpuText 单测
npm run test:img           # 图片管线单测
npm run dev:desktop        # Vite 前端
npm run tauri:dev          # 桌面壳（需 Rust + WebView2）
```

## 已定工程红线

- 二值图极性全管线统一：**墨=0 / 背景=255**
- 去重哈希在归一化 + 照明归一化之后计算；裁白边不参与哈希
- 目录页码用**两遍渲染**，不依赖 `target-counter`
- 默认去噪仅 median3；开运算/连通域为高级可选（连通域阈值 ≤50px）
- 不做简谱 OCR、不做五线谱、不内置曲库、不联网 AI 修图
