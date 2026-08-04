import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { promises as fs } from "fs";
import { basename, extname, join } from "path";
import { z } from "zod";
import { createMarkmap } from "../../markmap/createMarkmap.js";
import {
    exportMarkmapImage,
    writeImageFile,
    type ImageFormat
} from "../../markmap/exportImage.js";
import {
    cleanupMindmaps,
    getMindmap,
    listMindmaps
} from "../../markmap/lifecycle.js";
import {
    MarkmapMcpContext,
    type OpenMode,
    type ReturnMode
} from "./context.js";
import { ToolRegistry } from "./tool-registry.js";

export type { MarkmapMcpContext, OpenMode, ReturnMode } from "./context.js";

export function sanitizeFilename(name: string): string {
    const base = basename(name).replace(/\.[^.]+$/, "");
    const cleaned = base
        .replace(/[^\w.\-\u4e00-\u9fff]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
    return (cleaned || "markmap").slice(0, 80);
}

export function ensureExtension(filename: string, ext: string): string {
    const normalized = ext.startsWith(".") ? ext : `.${ext}`;
    if (extname(filename).toLowerCase() === normalized) {
        return filename;
    }
    return `${filename.replace(/\.[^.]+$/, "")}${normalized}`;
}

/** Ensures output basename is discoverable by list_mindmaps / cleanup_mindmaps. */
export function ensureMarkmapBasename(name: string): string {
    return name.startsWith("markmap") ? name : `markmap-${name}`;
}

/**
 * Resolves whether to open the generated file based on server mode and
 * the agent's per-call preference.
 */
export function resolveOpen(
    serverMode: OpenMode,
    toolParam: boolean | undefined
): boolean {
    if (serverMode === "always") return true;
    if (serverMode === "never") return false;
    return toolParam ?? false; // "agent" mode, default to not open
}

type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string };

function pathPayload(htmlFilePath: string, filePath: string): ContentBlock {
    return {
        type: "text",
        text: JSON.stringify({ htmlFilePath, filePath })
    };
}

/**
 * Builds the MCP content blocks for an HTML result according to returnMode:
 * - path: paths JSON only
 * - content: raw HTML only (falls back to paths if HTML ≥ 200KB)
 * - both: paths JSON + raw HTML when eligible
 */
export function buildHtmlResult(
    filePath: string,
    html: string,
    returnMode: ReturnMode
): ContentBlock[] {
    const paths = pathPayload(filePath, filePath);
    const canInline = html.length < 200_000;

    if (returnMode === "path") {
        return [paths];
    }

    if (returnMode === "content") {
        return canInline ? [{ type: "text", text: html }] : [paths];
    }

    // both
    const blocks: ContentBlock[] = [paths];
    if (canInline) {
        blocks.push({ type: "text", text: html });
    }
    return blocks;
}

/**
 * Builds the MCP content blocks for an image/SVG export according to returnMode:
 * - path: paths JSON only
 * - content: image block only
 * - both: paths JSON + image block
 */
export function buildImageResult(
    htmlFilePath: string,
    imagePath: string,
    exported: { buffer: Buffer; mimeType: string },
    returnMode: ReturnMode
): ContentBlock[] {
    const paths = pathPayload(htmlFilePath, imagePath);
    const imageBlock: ContentBlock = {
        type: "image",
        data: exported.buffer.toString("base64"),
        mimeType: exported.mimeType
    };

    if (returnMode === "path") {
        return [paths];
    }
    if (returnMode === "content") {
        return [imageBlock];
    }
    return [paths, imageBlock];
}

export class MarkmapToolRegistry extends ToolRegistry {
    public register(): void {
        this.registerMarkdownToMindmap();
        this.registerListMindmaps();
        this.registerGetMindmap();
        this.registerCleanupMindmaps();
        this.registerPrompts();
    }

    private buildToolDescription(): string {
        const { returnMode, open, offline } = this.context;
        const modeHint =
            returnMode === "path"
                ? "Paths JSON only — no inline content."
                : returnMode === "content"
                  ? "Inline content only (raw HTML text <200KB, or base64 image block). No paths JSON; oversized HTML falls back to paths."
                  : "Paths JSON plus inline content when eligible (HTML text <200KB, or base64 image block).";
        const openHint =
            open === "always"
                ? "The server always opens the result in the default browser."
                : open === "never"
                  ? "The server never opens the browser."
                  : "The server delegates to the agent — set the `open` parameter to control whether the browser opens.";
        const responseHint =
            returnMode === "content"
                ? "Inline content only (no paths JSON unless HTML is oversized)."
                : 'JSON {"htmlFilePath":"<path>","filePath":"<path>"} — htmlFilePath is always the HTML source; filePath is the primary artifact (HTML or image).';
        return `Convert structured Markdown (headings # and nested lists -) into an interactive mind map HTML file, with optional server-side PNG/JPG/SVG export.

Use when the user wants a visual mind map/outline of structured content (architecture, plans, notes, hierarchies), or asks to visualize / mindmap / diagram. Do not use for flat unstructured text (restructure first), or to list/read existing outputs (use list_mindmaps / get_mindmap).

Behavior:
- WRITES files under the configured output dir. HTML is always written; image formats write an extra file. Reusing filename overwrites.
- html is fast (<1s). png/svg/jpg launch headless Chromium via Playwright (5–15s; requires: npm install playwright && npx playwright install chromium).
- Local only — no external APIs or third-party keys. Open mode=${open}: ${openHint}
- Offline=${offline} (server config).

Response:
- ${responseHint}
- Return mode=${returnMode}: ${modeHint}
- Errors: isError:true with {"error","message"}.`;
    }

    private registerMarkdownToMindmap(): void {
        const inputSchema: Record<string, z.ZodTypeAny> = {
            markdown: z
                .string()
                .optional()
                .describe(
                    "Full Markdown document string (not a file path). Prefer ATX headings (# ## ###) and nested lists. Provide this or inputPath (at least one required). If both are set, markdown wins."
                ),
            inputPath: z
                .string()
                .optional()
                .describe(
                    "Absolute path to a local .md file. Prefer over markdown when content is >1KB already on disk (saves tokens). Ignored when markdown is also provided."
                ),
            format: z
                .enum(["html", "png", "svg", "jpg"])
                .optional()
                .describe(
                    "Output format (default: html). Use html for interactive viewing; png/jpg/svg when the agent or user needs an image (Playwright required)."
                ),
            filename: z
                .string()
                .optional()
                .describe(
                    "Output base name only (no directories). Omit for markmap-<timestamp>. Custom names are prefixed with markmap- if needed so list/cleanup can find them. Same name overwrites."
                )
        };

        // `open` is only exposed when server open mode is `agent`
        if (this.context.open === "agent") {
            inputSchema.open = z
                .boolean()
                .optional()
                .describe(
                    "Whether to open the result in the default browser. Defaults to false."
                );
        }

        this.server.tool(
            "markdown_to_mindmap",
            this.buildToolDescription(),
            inputSchema,
            {
                title: "Markdown to Mind Map",
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false
            },
            async (args) => {
                const markdown = args.markdown as string | undefined;
                const inputPath = args.inputPath as string | undefined;
                const format = args.format as
                    | "html"
                    | "png"
                    | "svg"
                    | "jpg"
                    | undefined;
                const filename = args.filename as string | undefined;
                const openParam = args.open as boolean | undefined;
                const outputFormat = format ?? "html";
                const { open: serverOpen, returnMode, offline } = this.context;
                const shouldOpen = resolveOpen(serverOpen, openParam);

                try {
                    if (!markdown && !inputPath) {
                        return {
                            isError: true,
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify({
                                        error: "Either markdown or inputPath is required"
                                    })
                                }
                            ]
                        };
                    }

                    const content =
                        markdown ??
                        (await fs.readFile(inputPath as string, "utf8"));

                    const baseName = filename
                        ? ensureMarkmapBasename(sanitizeFilename(filename))
                        : `markmap-${Date.now()}`;
                    const htmlPath = join(
                        this.context.output,
                        ensureExtension(baseName, ".html")
                    );

                    const result = await createMarkmap({
                        content,
                        output: htmlPath,
                        openIt: shouldOpen && outputFormat === "html",
                        offline
                    });

                    if (outputFormat === "html") {
                        return {
                            content: buildHtmlResult(
                                result.filePath,
                                result.content,
                                returnMode
                            )
                        };
                    }

                    const imageFormat: ImageFormat =
                        outputFormat === "jpg" ? "jpeg" : outputFormat;
                    const exported = await exportMarkmapImage(
                        result.filePath,
                        imageFormat
                    );
                    const imagePath = join(
                        this.context.output,
                        ensureExtension(baseName, `.${exported.extension}`)
                    );
                    await writeImageFile(imagePath, exported);

                    if (shouldOpen) {
                        const { default: openFile } = await import("open");
                        await openFile(imagePath);
                    }

                    return {
                        content: buildImageResult(
                            result.filePath,
                            imagePath,
                            exported,
                            returnMode
                        )
                    };
                } catch (error: unknown) {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    return {
                        isError: true,
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    error: "Failed to generate markmap",
                                    message
                                })
                            }
                        ]
                    };
                }
            }
        );
    }

    private registerListMindmaps(): void {
        this.server.tool(
            "list_mindmaps",
            'List markmap* files (html/png/jpg/jpeg/svg) in the output directory, newest first. Read-only — no side effects. Missing/empty dirs return {"files":[]}.\n\nReturns: {"outputDir","files":[{"name","filePath","size","mtimeMs","mtime"}]} (mtime is ISO 8601).\n\nUse before get_mindmap to discover paths, or before cleanup_mindmaps to preview targets. Not for generating new mind maps (use markdown_to_mindmap).',
            {
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(200)
                    .optional()
                    .describe(
                        "Max files to return (default: 20, max: 200). Newest files are kept when truncating."
                    )
            },
            {
                title: "List Mind Maps",
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false
            },
            async ({ limit }) => {
                const files = await listMindmaps(this.context.output, {
                    limit: limit ?? 20
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                outputDir: this.context.output,
                                files
                            })
                        }
                    ]
                };
            }
        );
    }

    private registerGetMindmap(): void {
        this.server.tool(
            "get_mindmap",
            'Retrieve a generated mind map file by absolute path. Read-only — no side effects. Only paths inside the configured output directory are allowed (path traversal denied).\n\nReturns JSON {"filePath","mimeType","size"}. For text/html or image/svg+xml under 200KB, also appends a text content block. PNG/JPG return metadata only (no image block) — re-export via markdown_to_mindmap with format=png|jpg if the agent needs pixels.\n\nOn error: isError:true with {"error":"Failed to retrieve mind map","message"}.\n\nUse list_mindmaps first to obtain a valid filePath. Prefer this over regenerating when the file already exists.',
            {
                filePath: z
                    .string()
                    .describe(
                        "Absolute path from list_mindmaps (must stay inside the server output directory)."
                    )
            },
            {
                title: "Get Mind Map",
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false
            },
            async ({ filePath }) => {
                try {
                    const result = await getMindmap(
                        this.context.output,
                        filePath
                    );
                    const blocks: ContentBlock[] = [
                        {
                            type: "text",
                            text: JSON.stringify({
                                filePath: result.filePath,
                                mimeType: result.mimeType,
                                size: result.size
                            })
                        }
                    ];
                    // Include content if it's text-based and reasonably sized
                    if (
                        result.content.length < 200_000 &&
                        (result.mimeType.startsWith("text/") ||
                            result.mimeType === "image/svg+xml")
                    ) {
                        blocks.push({
                            type: "text",
                            text: result.content
                        });
                    }
                    return { content: blocks };
                } catch (error: unknown) {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    return {
                        isError: true,
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    error: "Failed to retrieve mind map",
                                    message
                                })
                            }
                        ]
                    };
                }
            }
        );
    }

    private registerCleanupMindmaps(): void {
        this.server.tool(
            "cleanup_mindmaps",
            'Permanently delete markmap* files from the output directory. DESTRUCTIVE and irreversible when dryRun is false.\n\ndryRun defaults to false — omitting it WILL delete. Always call once with dryRun=true to preview, then again with dryRun=false to commit. Prefer list_mindmaps beforehand.\n\nReturns {"deleted":["<path>",...],"kept":<n>}; dryRun responses also include dryRun:true and do not delete.\n\nUse instead of manual file deletion when pruning old generated mind maps.',
            {
                maxAgeDays: z
                    .number()
                    .min(0)
                    .optional()
                    .describe(
                        "Delete files older than this many days (default: 7). Ignored when all=true."
                    ),
                all: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true, delete every markmap* file in the output directory (ignores maxAgeDays). Default false."
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true, preview deletions without removing files. Default false (actually deletes). Prefer true on the first call."
                    )
            },
            {
                title: "Cleanup Mind Maps",
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: false
            },
            async ({ maxAgeDays, all, dryRun }) => {
                const result = await cleanupMindmaps(this.context.output, {
                    maxAgeMs: (maxAgeDays ?? 7) * 24 * 60 * 60 * 1000,
                    all: all ?? false,
                    dryRun: dryRun ?? false
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result)
                        }
                    ]
                };
            }
        );
    }

    private registerPrompts(): void {
        this.server.prompt(
            "mindmap_from_content",
            "Organize unstructured content into hierarchical Markdown (headings # and nested lists -), then call markdown_to_mindmap to generate a mind map. Use this when the user provides raw notes, outlines, or ideas that need structuring before visualization.",
            {
                topic: z
                    .string()
                    .describe("Topic or raw notes to organize as a mind map")
            },
            async ({ topic }) => ({
                messages: [
                    {
                        role: "user",
                        content: {
                            type: "text",
                            text: `Organize the following into clean hierarchical Markdown (headings and nested lists) suitable for a mind map. Then call the markdown_to_mindmap tool with that Markdown.

Content:
${topic}`
                        }
                    }
                ]
            })
        );
    }
}

export function registerMarkmapTools(
    server: McpServer,
    context: MarkmapMcpContext
): void {
    const registry = new MarkmapToolRegistry(server, context);
    registry.register();
}
