import OpenAI from "openai";

export function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is missing. Add it to .env.local (server-only).",
    );
  }
  return new OpenAI({ apiKey: key });
}

export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1";
export const VISION_MODEL = process.env.OPENAI_VISION_MODEL ?? "gpt-4.1";
