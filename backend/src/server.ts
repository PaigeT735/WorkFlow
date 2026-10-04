import process from "node:process";
import { connectToBronto } from "./bronto.js";

async function main(): Promise<void> {
  console.log("Connecting to Bronto MCP (EU)...");
  const { client, tools } = await connectToBronto();

  try {
    console.log("✅ Connection succeeded.");
    console.log(`Discovered ${tools.length} tool(s):\n`);
    for (const tool of tools) {
      console.log(`- ${tool.name}`);
      if (tool.description) {
        console.log(`    ${tool.description.trim().replace(/\s+/g, " ")}`);
      }
    }
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  console.error("❌ Connection failed.");
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
