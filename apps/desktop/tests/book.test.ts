import { describe, expect, it } from "vitest";
import {
  assembleBookHtml,
  defaultPageSetup,
  type BookSongItem,
} from "../src/services/book";

function textItem(id: number, title: string, body: string): BookSongItem {
  return {
    songId: id,
    ord: id,
    type: "text",
    title,
    key: "1=C",
    meter: "4/4",
    jianpuText: body,
  };
}

describe("assembleBookHtml", () => {
  const songs: BookSongItem[] = [
    textItem(
      1,
      "小星星",
      "T: 小星星\nK: 1=C\nM: 4/4\n\n1 1 5 5 | 6 6 5 - ||\n词: 一 闪 一 闪 亮 晶 晶 ~\n",
    ),
    textItem(2, "练习曲", "M: 4/4\n\n1_ 2_ 3_ 4_ 5_ 6_ 7_ 1'_ |"),
  ];

  it("includes cover and toc", () => {
    const r = assembleBookHtml("测试册", songs, defaultPageSetup, "classic");
    expect(r.html).toContain("测试册");
    expect(r.html).toContain("目录");
    expect(r.html).toContain("小星星");
    expect(r.toc.length).toBe(2);
    expect(r.pageCount).toBeGreaterThanOrEqual(2);
  });

  it("can disable cover/toc", () => {
    const r = assembleBookHtml(
      "无封面",
      songs,
      { ...defaultPageSetup, showCover: false, showToc: false },
      "classic",
    );
    expect(r.html).not.toContain('class="cover"');
    expect(r.html).not.toContain("目录");
    expect(r.toc.length).toBe(2);
  });

  it("toc pages are increasing", () => {
    const r = assembleBookHtml("页码", songs, defaultPageSetup, "warm");
    expect(r.toc[0]!.page).toBeLessThanOrEqual(r.toc[1]!.page);
  });

  it("image songs render img tag", () => {
    const img: BookSongItem = {
      songId: 9,
      ord: 0,
      type: "image",
      title: "扫描谱",
      displayUrl: "asset://fake.png",
      originalPath: "D:/x.png",
    };
    const r = assembleBookHtml("图", [img], defaultPageSetup, "minimal");
    expect(r.html).toContain("<img");
    expect(r.html).toContain("asset://fake.png");
  });

  it("contains @page size for A4", () => {
    const r = assembleBookHtml("A4", songs, defaultPageSetup, "classic");
    expect(r.html).toContain("@page");
    expect(r.html).toContain("210mm");
    expect(r.html).toContain("297mm");
  });
});
