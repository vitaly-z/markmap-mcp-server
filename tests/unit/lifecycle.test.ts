import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
    cleanupMindmaps,
    getMindmap,
    listMindmaps,
    type MindmapFileInfo
} from "../../src/markmap/lifecycle.js";

describe("listMindmaps", () => {
    const dirs: string[] = [];

    afterEach(async () => {
        await Promise.all(
            dirs.map((d) => rm(d, { recursive: true, force: true }))
        );
        dirs.length = 0;
    });

    it("returns empty array for non-existent directory", async () => {
        const files = await listMindmaps("/nonexistent/path");
        expect(files).toEqual([]);
    });

    it("returns empty array for empty directory", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-list-"));
        dirs.push(dir);
        const files = await listMindmaps(dir);
        expect(files).toEqual([]);
    });

    it("lists only markmap-prefixed files", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-list-"));
        dirs.push(dir);
        await writeFile(join(dir, "markmap-a.html"), "<html></html>");
        await writeFile(join(dir, "markmap-b.png"), "fake-png");
        await writeFile(join(dir, "other.txt"), "not a markmap file");

        const files = await listMindmaps(dir);
        expect(files.length).toBe(2);
        const names = files.map((f) => f.name).sort();
        expect(names).toEqual(["markmap-a.html", "markmap-b.png"]);
    });

    it("returns files sorted newest first", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-list-"));
        dirs.push(dir);
        await writeFile(join(dir, "markmap-old.html"), "old");
        // Wait a small amount to ensure different mtime
        await new Promise((r) => setTimeout(r, 50));
        await writeFile(join(dir, "markmap-new.html"), "new");

        const files = await listMindmaps(dir);
        expect(files.length).toBe(2);
        expect(files[0].name).toBe("markmap-new.html");
        expect(files[1].name).toBe("markmap-old.html");
    });

    it("respects limit option", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-list-"));
        dirs.push(dir);
        for (let i = 0; i < 5; i++) {
            await writeFile(join(dir, `markmap-${i}.html`), "x");
            await new Promise((r) => setTimeout(r, 10));
        }

        const files = await listMindmaps(dir, { limit: 2 });
        expect(files.length).toBe(2);
    });

    it("each file has required fields including mtime ISO string", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-list-"));
        dirs.push(dir);
        await writeFile(join(dir, "markmap-test.html"), "<html></html>");

        const files = await listMindmaps(dir);
        expect(files.length).toBe(1);
        const file: MindmapFileInfo = files[0];
        expect(file.name).toBe("markmap-test.html");
        expect(file.filePath).toBe(join(dir, "markmap-test.html"));
        expect(typeof file.size).toBe("number");
        expect(typeof file.mtimeMs).toBe("number");
        expect(typeof file.mtime).toBe("string");
        // ISO 8601 format
        expect(file.mtime).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        );
    });

    it("filters files by supported extensions", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-list-"));
        dirs.push(dir);
        await writeFile(join(dir, "markmap-a.html"), "x");
        await writeFile(join(dir, "markmap-b.png"), "x");
        await writeFile(join(dir, "markmap-c.jpg"), "x");
        await writeFile(join(dir, "markmap-d.jpeg"), "x");
        await writeFile(join(dir, "markmap-e.svg"), "x");
        await writeFile(join(dir, "markmap-f.pdf"), "x"); // unsupported

        const files = await listMindmaps(dir);
        expect(files.length).toBe(5);
    });
});

describe("cleanupMindmaps", () => {
    const dirs: string[] = [];

    afterEach(async () => {
        await Promise.all(
            dirs.map((d) => rm(d, { recursive: true, force: true }))
        );
        dirs.length = 0;
    });

    it("deletes files older than maxAgeMs", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-clean-"));
        dirs.push(dir);
        const keep = join(dir, "markmap-keep.html");
        const old = join(dir, "markmap-old.html");
        await writeFile(keep, "keep");
        await writeFile(old, "old");

        const { utimes } = await import("fs/promises");
        const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        await utimes(old, past, past);

        const result = await cleanupMindmaps(dir, {
            maxAgeMs: 7 * 24 * 60 * 60 * 1000
        });
        expect(result.deleted).toContain(old);
        expect(result.kept).toBe(1);

        const after = await listMindmaps(dir);
        expect(after.map((f) => f.name)).toEqual(["markmap-keep.html"]);
    });

    it("deletes all files when all=true", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-clean-"));
        dirs.push(dir);
        await writeFile(join(dir, "markmap-1.html"), "x");
        await writeFile(join(dir, "markmap-2.html"), "x");

        const result = await cleanupMindmaps(dir, { all: true });
        expect(result.deleted.length).toBe(2);
        expect(result.kept).toBe(0);

        const after = await listMindmaps(dir);
        expect(after).toEqual([]);
    });

    it("dryRun=true does not delete files", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-clean-"));
        dirs.push(dir);
        const filePath = join(dir, "markmap-test.html");
        await writeFile(filePath, "test");

        const result = await cleanupMindmaps(dir, {
            all: true,
            dryRun: true
        });
        expect(result.dryRun).toBe(true);
        expect(result.deleted).toContain(filePath);
        expect(result.kept).toBe(0);

        // File should still exist
        const after = await listMindmaps(dir);
        expect(after.length).toBe(1);
        expect(after[0].name).toBe("markmap-test.html");
    });

    it("dryRun=false actually deletes files", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-clean-"));
        dirs.push(dir);
        await writeFile(join(dir, "markmap-test.html"), "test");

        const result = await cleanupMindmaps(dir, {
            all: true,
            dryRun: false
        });
        expect(result.dryRun).toBeUndefined();
        expect(result.deleted.length).toBe(1);

        const after = await listMindmaps(dir);
        expect(after).toEqual([]);
    });

    it("defaults to maxAgeMs of 7 days", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-clean-"));
        dirs.push(dir);
        const fresh = join(dir, "markmap-fresh.html");
        await writeFile(fresh, "fresh");

        const result = await cleanupMindmaps(dir);
        expect(result.deleted).toEqual([]);
        expect(result.kept).toBe(1);
    });
});

describe("getMindmap", () => {
    const dirs: string[] = [];

    afterEach(async () => {
        await Promise.all(
            dirs.map((d) => rm(d, { recursive: true, force: true }))
        );
        dirs.length = 0;
    });

    it("reads an HTML file in the output directory", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-get-"));
        dirs.push(dir);
        const filePath = join(dir, "markmap-test.html");
        await writeFile(filePath, "<html><body>Hello</body></html>");

        const result = await getMindmap(dir, filePath);
        expect(result.filePath).toBe(filePath);
        expect(result.content).toBe("<html><body>Hello</body></html>");
        expect(result.mimeType).toBe("text/html");
        expect(result.size).toBeGreaterThan(0);
    });

    it("reads a PNG file and returns correct mime type", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-get-"));
        dirs.push(dir);
        const filePath = join(dir, "markmap-chart.png");
        await writeFile(filePath, "fake-png-data");

        const result = await getMindmap(dir, filePath);
        expect(result.mimeType).toBe("image/png");
    });

    it("detects JPEG mime type", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-get-"));
        dirs.push(dir);
        const filePath = join(dir, "markmap-photo.jpg");
        await writeFile(filePath, "fake-jpg-data");

        const result = await getMindmap(dir, filePath);
        expect(result.mimeType).toBe("image/jpeg");
    });

    it("detects SVG mime type", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-get-"));
        dirs.push(dir);
        const filePath = join(dir, "markmap-diagram.svg");
        await writeFile(filePath, "<svg></svg>");

        const result = await getMindmap(dir, filePath);
        expect(result.mimeType).toBe("image/svg+xml");
    });

    it("throws for files outside the output directory", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-get-"));
        dirs.push(dir);
        const outsideFile = join(tmpdir(), "outside.txt");
        await writeFile(outsideFile, "secret");

        await expect(getMindmap(dir, outsideFile)).rejects.toThrow(
            "Access denied"
        );
    });

    it("throws for non-existent files", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-get-"));
        dirs.push(dir);

        await expect(
            getMindmap(dir, join(dir, "nonexistent.html"))
        ).rejects.toThrow();
    });

    it("returns application/octet-stream for unknown extension", async () => {
        const dir = await mkdtemp(join(tmpdir(), "markmap-get-"));
        dirs.push(dir);
        const filePath = join(dir, "markmap-data.bin");
        await writeFile(filePath, "binary");

        const result = await getMindmap(dir, filePath);
        expect(result.mimeType).toBe("application/octet-stream");
    });
});
