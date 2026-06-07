import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SpecParser } from "./spec-parser.js";
import { TestGenerator } from "./test-generator.js";
import { TestExecutor } from "./executor.js";

const server = new Server(
  { name: "agent-api-validator", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "validate_api",
      description:
        "Reads an OpenAPI/WSDL spec, generates test cases, executes HTTP calls, and reports pass/fail results",
      inputSchema: {
        type: "object" as const,
        properties: {
          specUrl: {
            type: "string",
            description: "URL or file path to the OpenAPI/WSDL specification",
          },
          baseUrl: {
            type: "string",
            description: "Base URL of the API to test against",
          },
          maxTests: {
            type: "number",
            description: "Maximum number of test cases to generate (default: 20)",
          },
        },
        required: ["specUrl", "baseUrl"],
      },
    },
    {
      name: "parse_spec",
      description: "Parse an OpenAPI 3.0 specification and return endpoint summary",
      inputSchema: {
        type: "object" as const,
        properties: {
          specUrl: {
            type: "string",
            description: "URL or file path to the OpenAPI specification",
          },
        },
        required: ["specUrl"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "validate_api": {
      const specUrl = args?.specUrl as string;
      const baseUrl = args?.baseUrl as string;
      const maxTests = (args?.maxTests as number) ?? 20;

      const parser = new SpecParser();
      const spec = await parser.parse(specUrl);

      const generator = new TestGenerator();
      const testCases = await generator.generate(spec, maxTests);

      const executor = new TestExecutor(baseUrl);
      const results = await executor.run(testCases);

      const passed = results.filter((r) => r.passed).length;
      const failed = results.filter((r) => !r.passed).length;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { summary: { total: results.length, passed, failed }, results },
              null,
              2
            ),
          },
        ],
      };
    }

    case "parse_spec": {
      const specUrl = args?.specUrl as string;
      const parser = new SpecParser();
      const spec = await parser.parse(specUrl);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(spec, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Agent API Validator MCP server running on stdio");
}

main().catch(console.error);
