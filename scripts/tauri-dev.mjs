/**
 * 稳健启动 tauri dev：
 * 1. 校验工作目录
 * 2. 构建 jianpu-engine
 * 3. 若 1420 被占用则结束占用进程
 * 4. 启动 tauri dev
 */
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktop = join(root, "apps", "desktop");
const conf = join(desktop, "src-tauri", "tauri.conf.json");

if (!existsSync(conf)) {
  console.error(
    "[jianpubook] 未找到 tauri.conf.json，请在仓库根目录执行：npm run tauri:dev",
  );
  process.exit(1);
}

function log(msg) {
  console.log(`[jianpubook] ${msg}`);
}

function freePort(port) {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
      { encoding: "utf8" },
    )
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const pid of out) {
      if (!/^\d+$/.test(pid)) continue;
      log(`端口 ${port} 被 PID ${pid} 占用，正在结束…`);
      try {
        execSync(
          `powershell -NoProfile -Command "Stop-Process -Id ${pid} -Force"`,
          { stdio: "ignore" },
        );
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

log("构建 jianpu-engine…");
execSync("npm run build -w @jianpubook/jianpu-engine", {
  cwd: root,
  stdio: "inherit",
});

freePort(1420);

log("启动 tauri dev（Vite http://127.0.0.1:1420）…");
const isWin = process.platform === "win32";
const child = spawn(isWin ? "npx.cmd" : "npx", ["tauri", "dev"], {
  cwd: desktop,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
