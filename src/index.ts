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
    type ReturnMode
} from "./mcp/tools/context.js";
import { registerMarkmapTools } from "./mcp/tools/markmap-tools.js";
import logger from "./utils/logger.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

function parseBoolean(
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

function parseReturnMode(value: string | undefined): ReturnMode {
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
        string: ["output", "return-mode"],
        boolean: ["help", "open", "offline"],
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
    --open                     Open generated files in the default browser
    --return-mode <mode>       path | content | both (default: path)
    --offline                  Inline assets for offline HTML
    --help, -h                 Show this help message

  Environment (CLI flags override env):
    MARKMAP_DIR                Output directory
    MARKMAP_OPEN               Open in browser (true/false)
    MARKMAP_RETURN_MODE        path | content | both
    MARKMAP_OFFLINE            Inline assets (true/false)`);
        process.exit(0);
    }

    const open = hasFlag("--open")
        ? true
        : parseBoolean(process.env.MARKMAP_OPEN, false);

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
