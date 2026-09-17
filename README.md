# JianpuBook

简谱收集 · 清晰化 · 排版打印一体桌面工具。

> 把散落在相册、聊天记录、简谱站里的简谱图片收集进来，去噪增强，和自编的文本简谱混排成一本带封面、目录、页码、可直接双面打印的专业简谱册子。

## 状态

| 阶段 | 状态 |
|---|---|
| W0 调研定标 | ✅ `docs/W0-排版与增强实测.md` |
| jianpu-engine（解析/SVG/移调） | ✅ 48 单测 |
| img-pipeline（增强/去重/IO） | ✅ 13+1 测试 |
| W1 曲库导入 | ✅ pHash 去重 + 缩略图墙 |
| W2 图片增强 | ✅ 三档预设 + 前后对比 |
| W4 册子排版 | ✅ 曲序 / 封面目录 / 混排预览 / book.json |
| W5 打印 | ✅ @page HTML / 系统打印 / 校准页 |
| 桌面壳 | ✅ Tauri 2 + Vue 3 五页 |

## 仓库结构

```
JianpuBook/
├── apps/desktop/            # Tauri 2 + Vue 3
│   ├── src/                 # 五页 UI + book 组装
│   └── src-tauri/           # IPC + SQLite + img-pipeline
├── packages/jianpu-engine/  # JianpuText 解析 / 布局 / SVG / 移调
├── crates/img-pipeline/     # 去偏 / 二值化 / 去噪 / pHash
├── docs/                    # W0 实测
└── w0/                      # 调研探针
```

## 开发

```bash
npm install
npm run test:all          # 引擎 + 桌面单测 + Rust 管线 + 曲库
npm run tauri:dev         # 桌面开发（Vite 127.0.0.1:1420）
```

纯前端（无 Rust IPC，曲库为 mock）：

```bash
npm run dev:desktop
```

## 产品路径

1. **曲库**：拖入图片 → pHash 去重 → 缩略图墙；或手敲文本谱存库  
2. **图片增强**：轻度/标准/强力，前后对比，参数非破坏保存  
3. **文本谱**：即时 SVG 预览、小节校验、一键音级移调  
4. **册子排版**：选曲、调序、主题/纸张、封面+目录  
5. **打印预览**：系统打印 / 下载 HTML / 校准测试页  

## 工程红线（来自 W0）

- 二值图极性全管线：**墨=0 / 背景=255**
- 去重哈希在归一化 + 照明归一化之后；裁白边不参与哈希  
- 默认去噪仅 median3；连通域阈值 ≤50px  
- 目录页码用组装时两遍计算，不依赖 `target-counter`  
- 打印校准系数默认约 **1.016**（抵消 Chromium ~1.56% 收缩）  
- 不做 OCR、不做五线谱、不内置曲库、不联网 AI 修图  

## 打印建议

1. 先打「校准测试页」，量边距后微调册子里的校准系数  
2. 导出 HTML 后用浏览器「打印 → 另存为 PDF」几何更稳  
3. 双面打印时开启镜像边距（装订侧加宽 4mm）  
