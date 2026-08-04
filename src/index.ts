#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import minimist from "minimist";
import { createRequire } from "module";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
    type MarkmapMcpContext,
    type OpenMode,
    type ReturnMode
} from "./mcp/tools/context.js";
import { registerMarkmapTools } from "./mcp/tools/markmap-tools.js";
import logger from "./utils/logger.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export function parseBoolean(
    value: string | boolean | undefined,
    defaultValue: boolean
): boolean {
    if (value === undefined || value === "") {
        return defaultValue;
    }
    if (typeof value === "boolean") {
        return value;
    }
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
    }
    return defaultValue;
}

export function parseOpenMode(
    value: string | undefined,
    defaultValue: OpenMode
): OpenMode {
    if (value === undefined || value === "") {
        return defaultValue;
    }
    const normalized = value.trim().toLowerCase();
    if (
        normalized === "always" ||
        normalized === "never" ||
        normalized === "agent"
    ) {
        return normalized;
    }
    return defaultValue;
}

/**
 * Parse CLI `--open [mode]`:
 * - bare `--open` (empty / boolean) → "always"
 * - always | never | agent → that mode
 * - anything else → undefined (caller should exit with error)
 */
export function parseCliOpenMode(
    value: string | boolean | undefined
): OpenMode | undefined {
    if (value === undefined || value === "" || typeof value === "boolean") {
        return "always";
    }
    const normalized = value.trim().toLowerCase();
    if (
        normalized === "always" ||
        normalized === "never" ||
        normalized === "agent"
    ) {
        return normalized;
    }
    return undefined;
}

export function parseReturnMode(value: string | undefined): ReturnMode {
    if (value === "content" || value === "both" || value === "path") {
        return value;
    }
    return "path";
}

function hasFlag(name: string): boolean {
    return process.argv.includes(name);
}

function parseArgs(): Omit<MarkmapMcpContext, "output"> & {
    output?: string;
} {
    const args = minimist(process.argv.slice(2), {
        string: ["output", "return-mode", "open"],
        boolean: ["help", "offline"],
        alias: {
            o: "output",
            h: "help"
        }
    });

    if (args.help) {
        console.error(`Markmap MCP Server - Mind map generator for Markdown

  Usage: markmap-mcp-server [options]

  Options:
    --output, -o <dir>         Output directory for generated files
    --open [mode]              Open mode: always | never | agent (bare --open = always)
    --return-mode <mode>       path | content | both (default: path)
    --offline                  Inline assets for offline HTML
    --help, -h                 Show this help message

  Environment (CLI flags override env):
    MARKMAP_DIR                Output directory
    MARKMAP_OPEN               always | never | agent (default: never)
    MARKMAP_RETURN_MODE        path | content | both
    MARKMAP_OFFLINE            Inline assets (true/false)`);
        process.exit(0);
    }

    let open: OpenMode;
    if (hasFlag("--open")) {
        const mode = parseCliOpenMode(args.open as string | undefined);
        if (!mode) {
            console.error(
                "Error: invalid --open value. Expected: always | never | agent"
            );
            process.exit(1);
        }
        open = mode;
    } else {
        open = parseOpenMode(process.env.MARKMAP_OPEN, "never");
    }

    const offline = hasFlag("--offline")
        ? true
        : parseBoolean(process.env.MARKMAP_OFFLINE, false);

    const returnMode = parseReturnMode(
        (args["return-mode"] as string | undefined) ||
            process.env.MARKMAP_RETURN_MODE
    );

    return {
        output: (args.output as string | undefined) || process.env.MARKMAP_DIR,
        open,
        returnMode,
        offline
    };
}

async function main() {
    const options = parseArgs();

    const server = new McpServer({
        name: "Markmap MCP Server",
        version: pkg.version
    });

    let outputPath: string;
    if (options.output) {
        if (!existsSync(options.output)) {
            mkdirSync(options.output, { recursive: true });
        }
        outputPath = options.output;
    } else {
        const defaultDir = join(homedir(), ".markmap-mcp");
        if (!existsSync(defaultDir)) {
            mkdirSync(defaultDir, { recursive: true });
        }
        outputPath = defaultDir;
    }

    registerMarkmapTools(server, {
        output: outputPath,
        open: options.open,
        returnMode: options.returnMode,
        offline: options.offline
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    logger.error("Failed to start Markmap MCP Server: %s", error);
    process.exit(1);
});
