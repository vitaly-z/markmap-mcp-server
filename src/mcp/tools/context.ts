export type ReturnMode = "path" | "content" | "both";

/**
 * Controls whether generated mind maps are opened in the default browser.
 * - "always": always open
 * - "never": never open
 * - "agent": the AI agent decides per call via the tool's `open` parameter
 */
export type OpenMode = "always" | "never" | "agent";

/**
 * Server-level preferences configured at process start (CLI / env).
 */
export interface MarkmapMcpContext {
    /** Directory for generated HTML / image files */
    output: string;
    /** Open generated files in the default browser */
    open: OpenMode;
    /** How tool results are returned to the MCP client */
    returnMode: ReturnMode;
    /** Inline JS/CSS so HTML works offline */
    offline: boolean;
}
