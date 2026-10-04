import process from "node:process";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// Load backend/.env first (if present), then the WorkFlow root .env.
// dotenv never overrides a variable that's already set.
loadEnv({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const BRONTO_MCP_URL = "https://mcp.eu.bronto.io/mcp";

export interface BrontoConnection {
  client: Client;
  tools: Tool[];
}

/** Replace any occurrence of the API key in a string so it can't leak into logs. */
function redact(text: string, secret: string): string {
  return secret ? text.split(secret).join("[REDACTED]") : text;
}

export async function connectToBronto(): Promise<BrontoConnection> {
  const apiKey = process.env.BRONTO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("BRONTO_API_KEY is not set. Add it to your .env file.");
  }

  const client = new Client({ name: "workflow-backend", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(BRONTO_MCP_URL), {
    requestInit: {
      headers: { "X-BRONTO-API-KEY": apiKey },
    },
  });

  try {
    // Cast works around an SDK typing mismatch under "exactOptionalPropertyTypes".
    await client.connect(transport as Transport);
    const { tools } = await client.listTools();
    return { client, tools };
  } catch (err) {
    await client.close().catch(() => {});
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to connect to Bronto MCP: ${redact(reason, apiKey)}`);
  }
}
