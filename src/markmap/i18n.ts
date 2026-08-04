export interface ExportToolbarLabels {
    exportPng: string;
    exportJpg: string;
    exportSvg: string;
    copyMarkdown: string;
    copied: string;
    copyFailed: string;
    copyError: string;
    exportFailed: string;
    pngTitle: string;
    jpgTitle: string;
    svgTitle: string;
    copyTitle: string;
}

export const TOOLBAR_LABELS: ExportToolbarLabels = {
    exportPng: "Export PNG",
    exportJpg: "Export JPG",
    exportSvg: "Export SVG",
    copyMarkdown: "Copy Markdown",
    copied: "✓ Copied",
    copyFailed: "Failed to copy to clipboard, please check browser permissions",
    copyError: "Unable to copy Markdown: ",
    exportFailed: "Image export failed: ",
    pngTitle: "Export as PNG image",
    jpgTitle: "Export as JPG image",
    svgTitle: "Export as SVG image",
    copyTitle: "Copy original Markdown content"
};

export function getToolbarLabels(): ExportToolbarLabels {
    return TOOLBAR_LABELS;
}
