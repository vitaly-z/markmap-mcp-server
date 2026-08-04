import { promises as fs } from "fs";
import { pathToFileURL } from "url";

export type ImageFormat = "png" | "jpeg" | "svg";

export interface ExportImageResult {
    buffer: Buffer;
    mimeType: string;
    extension: string;
}

const MIME: Record<ImageFormat, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    svg: "image/svg+xml"
};

const EXT: Record<ImageFormat, string> = {
    png: "png",
    jpeg: "jpg",
    svg: "svg"
};

/**
 * Renders a markmap HTML file to an image using Playwright.
 * Prefers an installed Chrome/Edge channel; falls back to bundled Chromium.
 */
export async function exportMarkmapImage(
    htmlFilePath: string,
    format: ImageFormat
): Promise<ExportImageResult> {
    let chromium;
    try {
        ({ chromium } = await import("playwright"));
    } catch {
        throw new Error(
            "Server-side image export requires the optional 'playwright' package. Install it with: npm install playwright && npx playwright install chromium"
        );
    }

    const launch = async () => {
        for (const channel of ["chrome", "msedge", undefined] as const) {
            try {
                return await chromium.launch({
                    headless: true,
                    ...(channel ? { channel } : {})
                });
            } catch {
                // try next channel
            }
        }
        throw new Error(
            "Unable to launch a browser for image export. Run: npx playwright install chromium"
        );
    };

    const browser = await launch();
    try {
        const page = await browser.newPage({
            viewport: { width: 1280, height: 800 },
            deviceScaleFactor: 2
        });

        await page.goto(pathToFileURL(htmlFilePath).href, {
            waitUntil: "networkidle",
            timeout: 60_000
        });

        // Wait for markmap instance
        await page.waitForFunction(
            () =>
                typeof (
                    window as unknown as { mm?: { fit: () => Promise<void> } }
                ).mm?.fit === "function",
            { timeout: 30_000 }
        );

        await page.evaluate(async () => {
            const mm = (
                window as unknown as { mm: { fit: () => Promise<void> } }
            ).mm;
            await mm.fit();
        });

        // Hide toolbars for clean export
        await page.addStyleTag({
            content: `
              .mm-export-toolbar, .mm-toolbar { display: none !important; }
              body, html { margin: 0; padding: 0; background: #fff; }
            `
        });

        const svgLocator = page.locator("svg.markmap").first();
        await svgLocator.waitFor({ state: "visible", timeout: 15_000 });

        if (format === "svg") {
            const svg = await svgLocator.evaluate((el) => {
                const clone = el.cloneNode(true) as SVGElement;
                if (!clone.getAttribute("xmlns")) {
                    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
                }
                return new XMLSerializer().serializeToString(clone);
            });
            return {
                buffer: Buffer.from(svg, "utf8"),
                mimeType: MIME.svg,
                extension: EXT.svg
            };
        }

        const box = await svgLocator.boundingBox();
        if (!box) {
            throw new Error("Cannot measure mind map SVG for screenshot");
        }

        const screenshot = await page.screenshot({
            type: format === "jpeg" ? "jpeg" : "png",
            quality: format === "jpeg" ? 92 : undefined,
            clip: {
                x: Math.max(0, box.x - 16),
                y: Math.max(0, box.y - 16),
                width: box.width + 32,
                height: box.height + 32
            }
        });

        return {
            buffer: Buffer.from(screenshot),
            mimeType: MIME[format],
            extension: EXT[format]
        };
    } finally {
        await browser.close();
    }
}

export async function writeImageFile(
    filePath: string,
    result: ExportImageResult
): Promise<void> {
    await fs.writeFile(filePath, result.buffer);
}
