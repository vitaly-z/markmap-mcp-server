import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RegistryBase } from "../../common/registry-base.js";
import { MarkmapMcpContext } from "./context.js";

export abstract class ToolRegistry extends RegistryBase {
    constructor(
        protected server: McpServer,
        protected context: MarkmapMcpContext
    ) {
        super(server, context);
    }

    /** Registers all tools for this registry. */
    public registerTools(): void {
        this.register();
    }
}
