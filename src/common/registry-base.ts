import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MarkmapMcpContext } from "../mcp/tools/context.js";

export abstract class RegistryBase {
    /**
     * Creates a new registry instance.
     *
     * @param server - The MCP server instance to register components with
     * @param context - The context object containing configuration and state information
     */
    constructor(
        protected server: McpServer,
        protected context: MarkmapMcpContext
    ) {}

    /** Registers MCP tools / prompts for this registry. */
    public abstract register(): void;
}
