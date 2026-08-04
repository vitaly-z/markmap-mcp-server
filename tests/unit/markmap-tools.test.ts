import { describe, expect, it } from "vitest";
import {
    ensureExtension,
    sanitizeFilename
} from "../../src/mcp/tools/markmap-tools.js";

describe("sanitizeFilename", () => {
    it("removes file extension", () => {
        const result = sanitizeFilename("my-file.md");
        expect(result).toBe("my-file");
    });

    it("strips directory path and keeps only basename", () => {
        const result = sanitizeFilename("/path/to/notes.md");
        expect(result).toBe("notes");
    });

    it("replaces special characters with underscores", () => {
        const result = sanitizeFilename("hello world!@#");
        expect(result).toBe("hello_world");
    });

    it("replaces whitespace with underscores", () => {
        const result = sanitizeFilename("my mind map");
        expect(result).toBe("my_mind_map");
    });

    it("preserves hyphens and dots (treats last dot-segment as extension)", () => {
        const result = sanitizeFilename("v1.2.3-beta");
        // The last dot-segment ".3-beta" is treated as an extension and removed
        expect(result).toBe("v1.2");
    });

    it("preserves Chinese characters", () => {
        const result = sanitizeFilename("思维导图");
        expect(result).toBe("思维导图");
    });

    it("returns 'markmap' for empty after cleaning", () => {
        const result = sanitizeFilename("!!!");
        expect(result).toBe("markmap");
    });

    it("truncates to 80 characters", () => {
        const longName = "a".repeat(100);
        const result = sanitizeFilename(longName);
        expect(result.length).toBe(80);
    });

    it("trims leading and trailing underscores", () => {
        const result = sanitizeFilename("__test__");
        expect(result).toBe("test");
    });

    it("collapses consecutive underscores", () => {
        const result = sanitizeFilename("a   b");
        expect(result).toBe("a_b");
    });
});

describe("ensureExtension", () => {
    it("adds extension when missing", () => {
        expect(ensureExtension("myfile", ".html")).toBe("myfile.html");
    });

    it("adds extension without leading dot", () => {
        expect(ensureExtension("myfile", "html")).toBe("myfile.html");
    });

    it("keeps existing correct extension", () => {
        expect(ensureExtension("myfile.html", ".html")).toBe("myfile.html");
    });

    it("replaces wrong extension", () => {
        expect(ensureExtension("myfile.md", ".html")).toBe("myfile.html");
    });

    it("replaces last extension in dotted filenames", () => {
        // The last dot-segment ".name" is treated as the extension and replaced
        expect(ensureExtension("my.file.name", ".png")).toBe("my.file.png");
    });

    it("is case-insensitive for existing extension check", () => {
        expect(ensureExtension("myfile.HTML", ".html")).toBe("myfile.HTML");
    });

    it("handles png extension", () => {
        expect(ensureExtension("chart", "png")).toBe("chart.png");
    });

    it("handles jpg extension", () => {
        expect(ensureExtension("photo", ".jpg")).toBe("photo.jpg");
    });
});
