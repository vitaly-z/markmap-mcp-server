import { describe, expect, it } from "vitest";
import {
    getToolbarLabels,
    TOOLBAR_LABELS,
    type ExportToolbarLabels
} from "../../src/markmap/i18n.js";

describe("TOOLBAR_LABELS", () => {
    const requiredKeys: (keyof ExportToolbarLabels)[] = [
        "exportPng",
        "exportJpg",
        "exportSvg",
        "copyMarkdown",
        "copied",
        "copyFailed",
        "copyError",
        "exportFailed",
        "pngTitle",
        "jpgTitle",
        "svgTitle",
        "copyTitle"
    ];

    it("contains all required label keys", () => {
        for (const key of requiredKeys) {
            expect(TOOLBAR_LABELS).toHaveProperty(key);
        }
    });

    it("has no extra keys beyond the defined interface", () => {
        const keys = Object.keys(TOOLBAR_LABELS);
        expect(keys.length).toBe(requiredKeys.length);
    });

    it("all labels are non-empty strings", () => {
        for (const [key, value] of Object.entries(TOOLBAR_LABELS)) {
            expect(typeof value).toBe("string");
            expect(value.length).toBeGreaterThan(0);
        }
    });

    it("uses English labels", () => {
        expect(TOOLBAR_LABELS.exportPng).toBe("Export PNG");
        expect(TOOLBAR_LABELS.exportJpg).toBe("Export JPG");
        expect(TOOLBAR_LABELS.exportSvg).toBe("Export SVG");
        expect(TOOLBAR_LABELS.copyMarkdown).toBe("Copy Markdown");
        expect(TOOLBAR_LABELS.copied).toBe("✓ Copied");
    });
});

describe("getToolbarLabels", () => {
    it("returns the same labels as TOOLBAR_LABELS", () => {
        expect(getToolbarLabels()).toEqual(TOOLBAR_LABELS);
    });

    it("returns a frozen or consistent object on each call", () => {
        const a = getToolbarLabels();
        const b = getToolbarLabels();
        expect(a).toEqual(b);
    });
});
