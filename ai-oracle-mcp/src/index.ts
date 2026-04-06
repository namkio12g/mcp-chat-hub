import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

let _openai: OpenAI | null = null;
let _gemini: GoogleGenAI | null = null;

function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

function getGemini(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  if (!_gemini) _gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _gemini;
}

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "o3";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-pro";

const server = new McpServer({
  name: "ai-oracle",
  version: "1.0.0",
});

server.tool(
  "ask_ai",
  "Ask a question to OpenAI or Gemini. Choose the provider: 'openai' or 'gemini'.",
  {
    prompt: z.string().describe("The question or prompt to send"),
    provider: z
      .enum(["openai", "gemini"])
      .default("openai")
      .describe("Which AI to use: 'openai' (default) or 'gemini'"),
  },
  async ({ prompt, provider }) => {
    let answer: string;

    if (provider === "gemini") {
      const response = await getGemini().models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });
      answer = response.text ?? "(no response)";
    } else {
      const response = await getOpenAI().chat.completions.create({
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
      });
      answer = response.choices[0]?.message?.content ?? "(no response)";
    }

    return {
      content: [
        {
          type: "text",
          text: `[${provider.toUpperCase()} / ${provider === "gemini" ? GEMINI_MODEL : OPENAI_MODEL}]\n\n${answer}`,
        },
      ],
    };
  }
);

// In-memory conversation sessions for multi-turn chat
type Turn = { role: "user" | "model"; parts: [{ text: string }] };
const sessions = new Map<string, Turn[]>();

server.tool(
  "chat_gemini",
  "Have a multi-turn conversation with Gemini. Gemini may ask questions back — reply by calling this tool again with the same session_id.",
  {
    message: z.string().describe("Your message to Gemini"),
    session_id: z
      .string()
      .optional()
      .describe("Session ID to continue an existing conversation. Omit to start a new one."),
    reset: z
      .boolean()
      .optional()
      .default(false)
      .describe("Set true to clear the conversation history for this session_id"),
  },
  async ({ message, session_id, reset }) => {
    const sid = session_id ?? `session_${Date.now()}`;

    if (reset) sessions.delete(sid);

    const history: Turn[] = sessions.get(sid) ?? [];

    history.push({ role: "user", parts: [{ text: message }] });

    const chat = getGemini().chats.create({
      model: GEMINI_MODEL,
      history: history.slice(0, -1), // all turns except the latest user message
    });

    const response = await chat.sendMessage({ message });
    const reply = response.text ?? "(no response)";

    history.push({ role: "model", parts: [{ text: reply }] });
    sessions.set(sid, history);

    return {
      content: [
        {
          type: "text",
          text: `[GEMINI / ${GEMINI_MODEL} | session: ${sid}]\n\n${reply}\n\n---\nTo reply, call chat_gemini again with session_id: "${sid}"`,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
