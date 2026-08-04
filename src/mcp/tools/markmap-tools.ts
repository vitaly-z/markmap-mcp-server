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
import { MarkmapMcpContext, type ReturnMode } from "./context.js";
import { ToolRegistry } from "./tool-registry.js";

export type { MarkmapMcpContext, ReturnMode } from "./context.js";

function sanitizeFilename(name: string): string {
    const base = basename(name).replace(/\.[^.]+$/, "");
    const cleaned = base
        .replace(/[^\w.\-\u4e00-\u9fff]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
    return (cleaned || "markmap").slice(0, 80);
}

function ensureExtension(filename: string, ext: string): string {
    const normalized = ext.startsWith(".") ? ext : `.${ext}`;
    if (extname(filename).toLowerCase() === normalized) {
        return filename;
    }
    return `${filename.replace(/\.[^.]+$/, "")}${normalized}`;
}

type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string };

function buildHtmlResult(
    filePath: string,
    html: string,
    returnMode: ReturnMode
): ContentBlock[] {
    const blocks: ContentBlock[] = [
        {
            type: "text",
            text: JSON.stringify({ htmlFilePath: filePath, filePath })
        }
    ];

    if (
        (returnMode === "content" || returnMode === "both") &&
        html.length < 200_000
    ) {
        blocks.push({ type: "text", text: html });
    }

    return blocks;
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
        return `Convert Markdown into an interactive mind map (markmap HTML), with optional server-side PNG/JPG/SVG export.

When to use:
- User wants a visual mind map / outline from structured Markdown (headings # and nested lists -)
- User asks to visualize notes, architecture, plans, or hierarchies

Input tips:
- Prefer headings and nested lists for a clear tree
- Pass inputPath instead of markdown when the source is already a local .md file (saves tokens)
- Either markdown or inputPath is required (but not both)
- Set format to png/svg/jpg for Agent-consumable images (requires Playwright/Chromium)

Server configuration (set at startup, not tool arguments):
- Return mode: ${returnMode}
- Open in browser: ${open}
- Offline: ${offline}

Privacy: generation is local; no third-party API keys required.`;
    }

    private registerMarkdownToMindmap(): void {
        this.server.tool(
            "markdown_to_mindmap",
            this.buildToolDescription(),
            {
                markdown: z
                    .string()
                    .optional()
                    .describe(
                        "Markdown content to convert. Required unless inputPath is set."
                    ),
                inputPath: z
                    .string()
                    .optional()
                    .describe(
                        "Absolute path to a local Markdown file. Used when markdown is omitted."
                    ),
                format: z
                    .enum(["html", "png", "svg", "jpg"])
                    .optional()
                    .describe(
                        "Output format (default: html). png/svg/jpg use Playwright server-side export."
                    ),
                filename: z
                    .string()
                    .optional()
                    .describe(
                        "Optional output base filename (without path). Reusing the same name overwrites."
                    )
            },
            async ({ markdown, inputPath, format, filename }) => {
                const outputFormat = format ?? "html";
                const { open, returnMode, offline } = this.context;

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
                        ? sanitizeFilename(filename)
                        : `markmap-${Date.now()}`;
                    const htmlPath = join(
                        this.context.output,
                        ensureExtension(baseName, ".html")
                    );

                    const result = await createMarkmap({
                        content,
                        output: htmlPath,
                        openIt: open && outputFormat === "html",
                        offline
                    });

                    if (outputFormat === "html") {
                        // Unified shape: always include htmlFilePath + filePath
                        if (returnMode === "path") {
                            return {
                                content: [
                                    {
                                        type: "text",
                                        text: JSON.stringify({
                                            htmlFilePath: result.filePath,
                                            filePath: result.filePath
                                        })
                                    }
                                ]
                            };
                        }
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

                    if (open) {
                        const { default: openFile } = await import("open");
                        await openFile(imagePath);
                    }

                    // Unified shape: always include both paths
                    const payload: Record<string, string> = {
                        htmlFilePath: result.filePath,
                        filePath: imagePath
                    };

                    const blocks: ContentBlock[] = [
                        { type: "text", text: JSON.stringify(payload) }
                    ];

                    if (returnMode === "content" || returnMode === "both") {
                        blocks.push({
                            type: "image",
                            data: exported.buffer.toString("base64"),
                            mimeType: exported.mimeType
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
            "List recently generated mind map files in the configured output directory.",
            {
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(200)
                    .optional()
                    .describe("Maximum number of files to return (default: 20)")
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
            "Retrieve a generated mind map file by its absolute path. Use this to read back a file listed by list_mindmaps.",
            {
                filePath: z
                    .string()
                    .describe(
                        "Absolute path to the mind map file (HTML or image) to retrieve"
                    )
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
            "Delete generated mind map files from the output directory by age, or delete all of them. Use dryRun to preview without deleting.",
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
                        "If true, delete all markmap files in the output directory"
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true, preview what would be deleted without actually deleting"
                    )
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
            "Turn the provided content into a structured Markdown mind map, then call markdown_to_mindmap.",
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
