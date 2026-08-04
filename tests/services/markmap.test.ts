import { mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkmap } from "../../src/markmap/createMarkmap.js";
import { escapeTextareaContent } from "../../src/markmap/escape.js";
import { cleanupMindmaps, listMindmaps } from "../../src/markmap/lifecycle.js";

const testMarkdown = `# Test Mindmap
- Topic 1
  - Subtopic 1.1
  - Subtopic 1.2
- Topic 2
  - Subtopic 2.1
    - Detail 2.1.1`;

describe("escapeTextareaContent", () => {
    it("escapes HTML special characters and closing textarea tags", () => {
        const input = `Hello <b>world</b> </textarea><script>alert(1)</script>`;
        const escaped = escapeTextareaContent(input);
        expect(escaped).not.toContain("</textarea");
        expect(escaped).toContain("&lt;b&gt;");
        expect(escaped).toContain("&lt;&#47;textarea");
    });
});

describe("createMarkmap", () => {
    const dirs: string[] = [];

    afterEach(async () => {
        dirs.length = 0;
    });

    it("writes interactive HTML with escaped markdown payload", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-test-"));
        dirs.push(dir);
        const output = join(dir, "out.html");
        const evil = `# Title\n- item </textarea><img src=x onerror=alert(1)>`;

        const result = await createMarkmap({
            content: evil,
            output
        });

        expect(result.filePath).toBe(output);
        const html = await readFile(output, "utf8");
        expect(html).toContain("</html>");
        expect(html).toContain("mm-export-toolbar");
        expect(html).not.toMatch(
            /<textarea id="original-markdown"[^>]*>[\s\S]*<\/textarea><img/
        );
        expect(html).toContain("&lt;&#47;textarea");
    });

    it("uses English labels and expands all nodes by default", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-test-"));
        const output = join(dir, "defaults.html");

        const result = await createMarkmap({
            content: testMarkdown,
            output
        });

        expect(result.content).toContain("Export PNG");
        expect(result.content).toContain("Copy Markdown");
        expect(result.content).toContain('"initialExpandLevel":-1');
    });

    it("can inline assets when offline=true", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-test-"));
        const output = join(dir, "offline.html");

        const result = await createMarkmap({
            content: testMarkdown,
            output,
            offline: true
        });

        expect(result.content.length).toBeGreaterThan(50_000);
        expect(result.content).toContain("original-markdown");
    }, 60_000);
});

describe("lifecycle", () => {
    it("lists and cleans markmap files", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-life-"));
        const keep = join(dir, "markmap-keep.html");
        const old = join(dir, "markmap-old.html");
        await writeFile(keep, "<html></html>");
        await writeFile(old, "<html></html>");

        const { utimes } = await import("fs/promises");
        const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        await utimes(old, past, past);

        const listed = await listMindmaps(dir);
        expect(listed.length).toBe(2);

        const cleaned = await cleanupMindmaps(dir, {
            maxAgeMs: 7 * 24 * 60 * 60 * 1000
        });
        expect(cleaned.deleted).toContain(old);
        expect(cleaned.kept).toBe(1);

        const after = await listMindmaps(dir);
        expect(after.map((f) => f.name)).toEqual(["markmap-keep.html"]);
    });
});
