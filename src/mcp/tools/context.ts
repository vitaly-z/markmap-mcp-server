export type ReturnMode = "path" | "content" | "both";

/**
 * Server-level preferences configured at process start (CLI / env).
 */
export interface MarkmapMcpContext {
    /** Directory for generated HTML / image files */
    output: string;
    /** Open generated files in the default browser */
    open: boolean;
    /** How tool results are returned to the MCP client */
    returnMode: ReturnMode;
    /** Inline JS/CSS so HTML works offline */
    offline: boolean;
}
