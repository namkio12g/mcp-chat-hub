import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const server = new McpServer({
  name: "gemini-oracle",
  version: "1.0.0",
});

server.tool(
  "ask_gemini",
  "Consult Gemini 2.5 Pro as an oracle — ask any question and get a reasoned answer",
  { prompt: z.string().describe("The question or prompt to send to Gemini") },
  async ({ prompt }) => {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
    });

    const answer = response.text ?? "(no response)";
    return { content: [{ type: "text", text: answer }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
