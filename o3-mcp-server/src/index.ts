import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import OpenAI from "openai";
import { z } from "zod";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const server = new McpServer({
  name: "o3-oracle",
  version: "1.0.0",
});

server.tool(
  "ask_o3",
  "Consult O3 as an oracle — ask any question and get a reasoned answer",
  { prompt: z.string().describe("The question or prompt to send to O3") },
  async ({ prompt }) => {
    const response = await openai.chat.completions.create({
      model: "o3",
      messages: [{ role: "user", content: prompt }],
    });

    const answer = response.choices[0]?.message?.content ?? "(no response)";
    return { content: [{ type: "text", text: answer }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
