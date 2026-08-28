import Anthropic from "@anthropic-ai/sdk";

/** Prefer Tech.gov.sg Anthropic gateway when configured; else fall back to OpenAI. */
export function hasAnthropic(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY?.trim() ||
      process.env.ANTHROPIC_AUTH_TOKEN?.trim(),
  );
}

export function hasOpenAI(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function hasAnyAi(): boolean {
  return hasAnthropic() || hasOpenAI();
}

export function getAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || undefined;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim() || undefined;
  if (!apiKey && !authToken) {
    throw new Error(
      "ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN is missing in .env.local",
    );
  }

  // Official SDK appends /v1/messages to baseURL.
  // Tech.gov.sg: https://api.ai.tech.gov.sg/platform/models
  const baseURL =
    process.env.ANTHROPIC_BASE_URL?.trim() ||
    "https://api.ai.tech.gov.sg/platform/models";

  return new Anthropic({
    apiKey: apiKey ?? null,
    authToken: authToken ?? null,
    baseURL,
  });
}

export const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514";

export function mediaType(mime: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (mime.includes("png")) return "image/png";
  if (mime.includes("webp")) return "image/webp";
  if (mime.includes("gif")) return "image/gif";
  return "image/jpeg";
}

/** Pull text + strip optional markdown fences from a Claude response. */
export function textFromMessage(message: Anthropic.Message): string {
  const parts = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text);
  let text = parts.join("\n").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();
  return text;
}

export async function anthropicJsonFromVision(opts: {
  prompt: string;
  imageBase64: string;
  mimeType: string;
}): Promise<unknown> {
  const client = getAnthropic();
  const message = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType(opts.mimeType),
              data: opts.imageBase64,
            },
          },
          {
            type: "text",
            text: `${opts.prompt}\n\nRespond with ONLY valid JSON. No markdown.`,
          },
        ],
      },
    ],
  });
  const text = textFromMessage(message);
  return JSON.parse(text) as unknown;
}
