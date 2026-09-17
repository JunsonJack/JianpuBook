import { analyze } from "../packages/jianpu-engine/dist/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "..", "packages", "jianpu-engine", "__preview");
mkdirSync(outDir, { recursive: true });

const twinkle = `T: 小星星
K: 1=C
M: 4/4

1 1 5 5 | 6 6 5 - |
词: 一 闪 一 闪 亮 晶 晶 ~

4 4 3 3 | 2 2 1 - ||
词: 满 天 都 是 小 星 星 ~
`;

const beam = `T: 连音示例
K: 1=G
M: 6/8

1_ 2_ 3_ 4_ 5_ 6_ | 7_ 1'_ 2'_ 3' - - ||
词: 啦 啦 啦 啦 啦 啦 啦 啦 啦 啦 ~ ~ ~
`;

const r = analyze(twinkle);
writeFileSync(join(outDir, "twinkle.svg"), r.svg);
const e = analyze(beam);
writeFileSync(join(outDir, "beam.svg"), e.svg);
console.log("twinkle lines", r.layout.lines.length);
console.log("beam spans", e.layout.lines.flatMap((l) => l.beams).length);
console.log("wrote", outDir);
