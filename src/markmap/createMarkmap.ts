import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { join } from "path";

import { config as markmapCliConfig } from "markmap-cli";
import {
    buildCSSItem,
    buildJSItem,
    mergeAssets,
    type CSSItem,
    type JSItem
} from "markmap-common";
import { Transformer, builtInPlugins } from "markmap-lib";
import { baseJsPaths, fillTemplate } from "markmap-render";
import open from "open";

import { escapeTextareaContent } from "./escape.js";
import { getToolbarLabels } from "./i18n.js";

const require = createRequire(import.meta.url);

const TOOLBAR_VERSION = "0.18.10";
const TOOLBAR_CSS = `markmap-toolbar@${TOOLBAR_VERSION}/dist/style.css`;
const TOOLBAR_JS = `markmap-toolbar@${TOOLBAR_VERSION}/dist/index.js`;
const ASSETS_PREFIX = "/assets/";

export interface CreateMarkmapOptions {
    /** Markdown content to convert */
    content: string;
    /** Absolute output HTML path */
    output?: string;
    /** Open the HTML in the default browser */
    openIt?: boolean;
    /** Inline assets so the HTML works offline */
    offline?: boolean;
}

export interface CreateMarkmapResult {
    filePath: string;
    content: string;
}

function localProvider(path: string): string {
    return `${ASSETS_PREFIX}${path}`;
}

async function loadAssetText(path: string): Promise<string> {
    if (path.startsWith(ASSETS_PREFIX)) {
        const relpath = path.slice(ASSETS_PREFIX.length);
        const localPath = join(markmapCliConfig.assetsDir, relpath);
        try {
            return await fs.readFile(localPath, "utf8");
        } catch {
            // Fall back to jsDelivr when the CLI asset pack is missing a version
            const cdnUrl = `https://cdn.jsdelivr.net/npm/${relpath}`;
            const res = await fetch(cdnUrl);
            if (!res.ok) {
                throw new Error(
                    `Failed to load offline asset: ${relpath} (${res.status})`
                );
            }
            return res.text();
        }
    }
    if (path.startsWith("http://") || path.startsWith("https://")) {
        const res = await fetch(path);
        if (!res.ok) {
            throw new Error(`Failed to fetch asset: ${path} (${res.status})`);
        }
        return res.text();
    }
    return fs.readFile(path, "utf8");
}

async function inlineAssets(assets: {
    scripts?: JSItem[];
    styles?: CSSItem[];
}): Promise<{ scripts?: JSItem[]; styles?: CSSItem[] }> {
    const [scripts, styles] = await Promise.all([
        Promise.all(
            (assets.scripts || []).map(async (item) =>
                item.type === "script" &&
                item.data &&
                "src" in item.data &&
                item.data.src
                    ? {
                          type: "script" as const,
                          data: {
                              textContent: await loadAssetText(item.data.src)
                          }
                      }
                    : item
            )
        ),
        Promise.all(
            (assets.styles || []).map(async (item) =>
                item.type === "stylesheet" &&
                item.data &&
                "href" in item.data &&
                item.data.href
                    ? {
                          type: "style" as const,
                          data: await loadAssetText(item.data.href)
                      }
                    : item
            )
        )
    ]);
    return { scripts, styles };
}

function buildExportToolbarScript(
    labels: ReturnType<typeof getToolbarLabels>
): string {
    return `
    <script>
      (function() {
        const labels = ${JSON.stringify(labels)};
        const exportToolbar = document.createElement('div');
        exportToolbar.className = 'mm-export-toolbar';
        document.body.appendChild(exportToolbar);

        function addBtn(className, text, title, onClick) {
          const btn = document.createElement('button');
          btn.className = 'mm-export-btn ' + className;
          btn.textContent = text;
          btn.title = title;
          btn.onclick = onClick;
          exportToolbar.appendChild(btn);
          return btn;
        }

        addBtn('png-export', labels.exportPng, labels.pngTitle, () => exportToImage('png'));
        addBtn('jpg-export', labels.exportJpg, labels.jpgTitle, () => exportToImage('jpeg'));
        addBtn('svg-export', labels.exportSvg, labels.svgTitle, () => exportToImage('svg'));
        const copyBtn = addBtn('mm-copy-btn copy-markdown', labels.copyMarkdown, labels.copyTitle, copyOriginalMarkdown);

        function copyOriginalMarkdown() {
          try {
            const markdownElement = document.getElementById('original-markdown');
            if (!markdownElement) throw new Error('Original Markdown content not found');
            navigator.clipboard.writeText(markdownElement.value)
              .then(() => {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = labels.copied;
                copyBtn.style.backgroundColor = '#2ecc71';
                setTimeout(() => {
                  copyBtn.textContent = originalText;
                  copyBtn.style.backgroundColor = '';
                }, 2000);
              })
              .catch(() => alert(labels.copyFailed));
          } catch (e) {
            alert(labels.copyError + (e && e.message ? e.message : e));
          }
        }

        function exportToImage(format) {
          try {
            const node = window.mm.svg._groups[0][0];
            if (!node) throw new Error('Cannot find mind map SVG element');
            window.mm.fit().then(() => {
              const options = {
                backgroundColor: '#ffffff',
                quality: 1.0,
                width: node.getBoundingClientRect().width,
                height: node.getBoundingClientRect().height
              };
              const exportPromise = format === 'svg'
                ? htmlToImage.toSvg(node, options)
                : format === 'jpeg'
                  ? htmlToImage.toJpeg(node, options)
                  : htmlToImage.toPng(node, options);
              exportPromise.then((dataUrl) => {
                const link = document.createElement('a');
                const timestamp = new Date().toISOString().slice(0, 10);
                const ext = format === 'jpeg' ? 'jpg' : format;
                link.download = 'markmap-' + timestamp + '.' + ext;
                link.href = dataUrl;
                link.click();
              }).catch((err) => console.error('Export failed:', err));
            });
          } catch (e) {
            alert(labels.exportFailed + (e && e.message ? e.message : e));
          }
        }
      })();
    </script>
  `;
}

function buildExportToolbarStyles(): string {
    return `
    <style>
      .mm-export-toolbar {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1000;
        background: rgba(255, 255, 255, 0.9);
        border-radius: 8px;
        padding: 8px 16px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        display: flex;
        gap: 10px;
      }
      .mm-export-btn {
        padding: 6px 12px;
        border: none;
        border-radius: 4px;
        background-color: #3498db;
        color: white;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.3s;
      }
      .mm-export-btn:hover { background-color: #2980b9; }
      .mm-copy-btn { background-color: #27ae60; }
      .mm-copy-btn:hover { background-color: #219653; }
      @media print {
        .mm-export-toolbar, .mm-toolbar { display: none !important; }
        svg.markmap, svg#mindmap, #mindmap svg {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          height: 100vh !important;
          width: 100% !important;
          max-width: 100% !important;
          max-height: 100vh !important;
          overflow: visible !important;
          page-break-inside: avoid !important;
        }
        body, html {
          height: 100% !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
        }
      }
    </style>
  `;
}

async function resolveHtmlToImageTag(offline: boolean): Promise<string> {
    if (!offline) {
        return `<script src="https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js"></script>`;
    }
    try {
        const pkgPath = require.resolve("html-to-image/dist/html-to-image.js");
        const source = await fs.readFile(pkgPath, "utf8");
        return `<script>${source}</script>`;
    } catch {
        return `<script src="https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js"></script>`;
    }
}

/**
 * Creates an interactive mind map HTML file from Markdown.
 */
export async function createMarkmap(
    options: CreateMarkmapOptions
): Promise<CreateMarkmapResult> {
    const { content, output, openIt = false, offline = false } = options;

    const filePath = output || join(tmpdir(), `markmap-${randomUUID()}.html`);
    const transformer = new Transformer([...builtInPlugins]);

    if (offline) {
        transformer.urlBuilder.setProvider("local", localProvider);
        transformer.urlBuilder.provider = "local";
    } else {
        try {
            await transformer.urlBuilder.findFastestProvider();
        } catch {
            // keep default CDN provider
        }
    }

    const { root, features, frontmatter } = transformer.transform(content);

    const renderToolbar = () => {
        // Serialized into HTML by fillTemplate; runs in the browser.
         
        const { markmap, mm } = window as any;
        const tb = new markmap.Toolbar();
        tb.attach(mm);
        const el = tb.render();
        el.setAttribute("style", "position:absolute;bottom:20px;right:20px");
        document.body.append(el);
        setTimeout(() => {
            if (mm && typeof mm.fit === "function") {
                mm.fit();
            }
        }, 1200);
    };

    const toolbarAssets = {
        styles: [buildCSSItem(TOOLBAR_CSS)],
        scripts: [
            buildJSItem(TOOLBAR_JS),
            {
                type: "iife" as const,
                data: {
                    fn: (...args: unknown[]) => {
                        const r = args[0] as () => void;
                        setTimeout(r);
                    },
                    getParams: () => [renderToolbar] as unknown[]
                }
            }
        ]
    };

    const otherAssets = mergeAssets(
        { scripts: baseJsPaths.map((p) => buildJSItem(p)) },
        toolbarAssets
    );

    let assets = mergeAssets(
        {
            scripts: otherAssets.scripts?.map((item) =>
                transformer.resolveJS(item)
            ),
            styles: otherAssets.styles?.map((item) =>
                transformer.resolveCSS(item)
            )
        },
        transformer.getUsedAssets(features)
    );

    if (offline) {
        assets = await inlineAssets(assets);
    }

    const frontmatterOptions =
        (frontmatter as { markmap?: Record<string, unknown> } | undefined)
            ?.markmap ?? {};

    const jsonOptions: Record<string, unknown> = {
        ...frontmatterOptions,
        initialExpandLevel: -1
    };

    const html = fillTemplate(root, assets, {
        baseJs: [],
        jsonOptions,
        urlBuilder: transformer.urlBuilder
    });

    const labels = getToolbarLabels();
    const htmlToImageTag = await resolveHtmlToImageTag(offline);
    const additionalCode = `
    ${htmlToImageTag}
    <textarea id="original-markdown" style="display:none;">${escapeTextareaContent(content)}</textarea>
    ${buildExportToolbarStyles()}
    ${buildExportToolbarScript(labels)}
  `;

    const updatedContent = html.includes("</body>")
        ? html.replace("</body>", `${additionalCode}\n</body>`)
        : `${html}\n${additionalCode}`;

    await fs.writeFile(filePath, updatedContent, "utf8");

    if (openIt) {
        await open(filePath);
    }

    return {
        filePath,
        content: updatedContent
    };
}
