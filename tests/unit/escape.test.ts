import { describe, expect, it } from "vitest";
import { escapeHtml, escapeTextareaContent } from "../../src/markmap/escape.js";

describe("escapeHtml", () => {
    it("returns plain text unchanged", () => {
        expect(escapeHtml("hello world")).toBe("hello world");
    });

    it("escapes ampersand", () => {
        expect(escapeHtml("a & b")).toBe("a &amp; b");
    });

    it("escapes angle brackets", () => {
        expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
    });

    it("escapes double quotes", () => {
        expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
    });

    it("escapes single quotes", () => {
        expect(escapeHtml("it's")).toBe("it&#39;s");
    });

    it("escapes all special characters in combination", () => {
        const input = `<a href="x" title='y'> & </a>`;
        const escaped = escapeHtml(input);
        expect(escaped).toBe(
            "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt; &amp; &lt;/a&gt;"
        );
    });

    it("does not double-escape already escaped text", () => {
        const alreadyEscaped = "&lt;div&gt;";
        // Re-escaping will turn & into &amp; again
        const result = escapeHtml(alreadyEscaped);
        expect(result).toBe("&amp;lt;div&amp;gt;");
    });

    it("handles empty string", () => {
        expect(escapeHtml("")).toBe("");
    });

    it("handles unicode text", () => {
        expect(escapeHtml("中文测试")).toBe("中文测试");
    });
});

describe("escapeTextareaContent", () => {
    it("escapes HTML and neutralizes closing textarea tag", () => {
        const input = `Hello <b>world</b> </textarea><script>alert(1)</script>`;
        const escaped = escapeTextareaContent(input);
        expect(escaped).not.toContain("</textarea");
        expect(escaped).toContain("&lt;b&gt;");
        expect(escaped).toContain("&lt;&#47;textarea");
    });

    it("neutralizes uppercase closing textarea tag", () => {
        const input = `</TEXTAREA>`;
        const escaped = escapeTextareaContent(input);
        expect(escaped).not.toMatch(/<\/textarea/i);
        expect(escaped).toContain("&lt;&#47;textarea");
    });

    it("neutralizes mixed-case closing textarea tag", () => {
        const input = `</TextArea>`;
        const escaped = escapeTextareaContent(input);
        expect(escaped).not.toMatch(/<\/textarea/i);
    });

    it("handles plain text without special chars", () => {
        const input = "hello world";
        expect(escapeTextareaContent(input)).toBe("hello world");
    });

    it("handles empty string", () => {
        expect(escapeTextareaContent("")).toBe("");
    });

    it("escapes unicode text with special chars", () => {
        const input = `中文</textarea>测试`;
        const escaped = escapeTextareaContent(input);
        expect(escaped).not.toMatch(/<\/textarea/i);
        expect(escaped).toContain("中文");
        expect(escaped).toContain("测试");
    });
});
