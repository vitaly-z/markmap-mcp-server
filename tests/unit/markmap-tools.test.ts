import { describe, expect, it } from "vitest";
import {
    buildHtmlResult,
    buildImageResult,
    ensureExtension,
    ensureMarkmapBasename,
    resolveOpen,
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

describe("ensureMarkmapBasename", () => {
    it("keeps names that already start with markmap", () => {
        expect(ensureMarkmapBasename("markmap-notes")).toBe("markmap-notes");
        expect(ensureMarkmapBasename("markmap")).toBe("markmap");
    });

    it("prefixes custom names so list/cleanup can discover them", () => {
        expect(ensureMarkmapBasename("architecture")).toBe(
            "markmap-architecture"
        );
        expect(ensureMarkmapBasename("思维导图")).toBe("markmap-思维导图");
    });
});

describe("resolveOpen", () => {
    it('returns true when server mode is "always" (ignores tool param)', () => {
        expect(resolveOpen("always", undefined)).toBe(true);
        expect(resolveOpen("always", false)).toBe(true);
        expect(resolveOpen("always", true)).toBe(true);
    });

    it('returns false when server mode is "never" (ignores tool param)', () => {
        expect(resolveOpen("never", undefined)).toBe(false);
        expect(resolveOpen("never", false)).toBe(false);
        expect(resolveOpen("never", true)).toBe(false);
    });

    it('delegates to tool param when server mode is "agent"', () => {
        expect(resolveOpen("agent", true)).toBe(true);
        expect(resolveOpen("agent", false)).toBe(false);
    });

    it('defaults to false when tool param is undefined in "agent" mode', () => {
        expect(resolveOpen("agent", undefined)).toBe(false);
    });
});

describe("buildHtmlResult", () => {
    const filePath = "/tmp/markmap-demo.html";
    const html = "<html>mindmap</html>";

    it("path mode returns paths JSON only", () => {
        const blocks = buildHtmlResult(filePath, html, "path");
        expect(blocks).toEqual([
            {
                type: "text",
                text: JSON.stringify({
                    htmlFilePath: filePath,
                    filePath
                })
            }
        ]);
    });

    it("content mode returns raw HTML only", () => {
        const blocks = buildHtmlResult(filePath, html, "content");
        expect(blocks).toEqual([{ type: "text", text: html }]);
    });

    it("both mode returns paths JSON then HTML", () => {
        const blocks = buildHtmlResult(filePath, html, "both");
        expect(blocks).toEqual([
            {
                type: "text",
                text: JSON.stringify({
                    htmlFilePath: filePath,
                    filePath
                })
            },
            { type: "text", text: html }
        ]);
    });

    it("content mode falls back to paths when HTML is oversized", () => {
        const oversized = "x".repeat(200_000);
        const blocks = buildHtmlResult(filePath, oversized, "content");
        expect(blocks).toEqual([
            {
                type: "text",
                text: JSON.stringify({
                    htmlFilePath: filePath,
                    filePath
                })
            }
        ]);
    });

    it("both mode omits HTML when oversized but keeps paths", () => {
        const oversized = "x".repeat(200_000);
        const blocks = buildHtmlResult(filePath, oversized, "both");
        expect(blocks).toEqual([
            {
                type: "text",
                text: JSON.stringify({
                    htmlFilePath: filePath,
                    filePath
                })
            }
        ]);
    });
});

describe("buildImageResult", () => {
    const htmlFilePath = "/tmp/markmap-demo.html";
    const imagePath = "/tmp/markmap-demo.png";
    const exported = {
        buffer: Buffer.from("fake-png"),
        mimeType: "image/png"
    };
    const imageBlock = {
        type: "image" as const,
        data: exported.buffer.toString("base64"),
        mimeType: "image/png"
    };
    const pathBlock = {
        type: "text" as const,
        text: JSON.stringify({ htmlFilePath, filePath: imagePath })
    };

    it("path mode returns paths JSON only", () => {
        expect(
            buildImageResult(htmlFilePath, imagePath, exported, "path")
        ).toEqual([pathBlock]);
    });

    it("content mode returns image block only", () => {
        expect(
            buildImageResult(htmlFilePath, imagePath, exported, "content")
        ).toEqual([imageBlock]);
    });

    it("both mode returns paths JSON then image", () => {
        expect(
            buildImageResult(htmlFilePath, imagePath, exported, "both")
        ).toEqual([pathBlock, imageBlock]);
    });
});
