import { promises as fs } from "fs";
import { extname, join, resolve } from "path";

export interface MindmapFileInfo {
    name: string;
    filePath: string;
    size: number;
    mtimeMs: number;
    /** ISO 8601 formatted modification time */
    mtime: string;
}

/**
 * Lists markmap HTML/image files in the output directory, newest first.
 */
export async function listMindmaps(
    outputDir: string,
    options: { limit?: number } = {}
): Promise<MindmapFileInfo[]> {
    const limit = options.limit ?? 50;
    let entries;
    try {
        entries = await fs.readdir(outputDir, { withFileTypes: true });
    } catch {
        return [];
    }

    const files = await Promise.all(
        entries
            .filter(
                (e) =>
                    e.isFile() &&
                    /\.(html|png|jpg|jpeg|svg)$/i.test(e.name) &&
                    e.name.startsWith("markmap")
            )
            .map(async (e) => {
                const filePath = join(outputDir, e.name);
                const stat = await fs.stat(filePath);
                return {
                    name: e.name,
                    filePath,
                    size: stat.size,
                    mtimeMs: stat.mtimeMs,
                    mtime: new Date(stat.mtimeMs).toISOString()
                };
            })
    );

    return files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
}

/**
 * Deletes markmap files older than maxAgeMs (and optionally all of them).
 * Set dryRun to true to preview without deleting.
 */
export async function cleanupMindmaps(
    outputDir: string,
    options: { maxAgeMs?: number; all?: boolean; dryRun?: boolean } = {}
): Promise<{ deleted: string[]; kept: number; dryRun?: boolean }> {
    const files = await listMindmaps(outputDir, { limit: 1000 });
    const now = Date.now();
    const maxAgeMs = options.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
    const deleted: string[] = [];
    const dryRun = options.dryRun ?? false;

    for (const file of files) {
        const shouldDelete =
            options.all === true || now - file.mtimeMs > maxAgeMs;
        if (shouldDelete) {
            if (!dryRun) {
                await fs.unlink(file.filePath);
            }
            deleted.push(file.filePath);
        }
    }

    return {
        deleted,
        kept: files.length - deleted.length,
        ...(dryRun ? { dryRun: true } : {})
    };
}

/**
 * Retrieves a single mind map file from the output directory.
 * Only allows reading files within the output directory for security.
 */
export async function getMindmap(
    outputDir: string,
    filePath: string
): Promise<{
    filePath: string;
    content: string;
    mimeType: string;
    size: number;
}> {
    const resolvedOutput = resolve(outputDir);
    const resolvedPath = resolve(filePath);

    if (
        !resolvedPath.startsWith(resolvedOutput + "/") &&
        resolvedPath !== resolvedOutput
    ) {
        throw new Error(
            `Access denied: ${filePath} is outside the output directory`
        );
    }

    const stat = await fs.stat(resolvedPath);
    const ext = extname(resolvedPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
        ".html": "text/html",
        ".htm": "text/html",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml"
    };
    const mimeType = mimeTypes[ext] ?? "application/octet-stream";

    const content = await fs.readFile(resolvedPath, "utf8");

    return {
        filePath: resolvedPath,
        content,
        mimeType,
        size: stat.size
    };
}
