import OpenAI from "openai";

/**
 * PlatformAI / LLMaaS (Tech.gov.sg) — OpenAI-compatible chat completions.
 * Docs: https://platform.ai.tech.gov.sg/models#llmaas-api-reference
 *
 * Base host (no trailing slash): https://api.ai.tech.gov.sg/platform/models
 * OpenAI SDK calls: {base}/v1/chat/completions
 */

function normalizeOpenAiBaseUrl(raw: string): string {
  const trimmed = raw.replace(/\/+$/, "");
  // Anthropic-style env often omits /v1; OpenAI SDK expects .../v1
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed}/v1`;
}

export function platformBaseUrl(): string {
  const raw =
    process.env.PLATFORM_AI_BASE_URL?.trim() ||
    process.env.ANTHROPIC_BASE_URL?.trim() ||
    "https://api.ai.tech.gov.sg/platform/models";
  return normalizeOpenAiBaseUrl(raw);
}

export function platformApiKey(): string | null {
  return (
    process.env.PLATFORM_AI_API_KEY?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.ANTHROPIC_AUTH_TOKEN?.trim() ||
    null
  );
}

export function hasPlatformAI(): boolean {
  return Boolean(platformApiKey());
}

export function hasDirectOpenAI(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function hasAnyAi(): boolean {
  return hasPlatformAI() || hasDirectOpenAI();
}

/** Defaults match OC/NS Claude Fable; override after enabling more models on the key. */
export const AI_VISION_MODEL =
  process.env.AI_VISION_MODEL?.trim() || "ocns.claude-fable-5";
export const AI_PHOTO_MODEL =
  process.env.AI_PHOTO_MODEL?.trim() || "ocns.claude-fable-5";
export const AI_CHAT_MODEL =
  process.env.AI_CHAT_MODEL?.trim() || "ocns.claude-fable-5";

export function getPlatformAI(): OpenAI {
  const apiKey = platformApiKey();
  if (!apiKey) {
    throw new Error(
      "PLATFORM_AI_API_KEY (or ANTHROPIC_API_KEY) missing in .env.local",
    );
  }
  return new OpenAI({
    apiKey,
    baseURL: platformBaseUrl(),
    defaultHeaders: {
      // Some PlatformAI deployments also accept x-api-key
      "x-api-key": apiKey,
    },
  });
}

export function getDirectOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY missing");
  }
  return new OpenAI({ apiKey: key });
}

/** Prefer PlatformAI gateway; fall back to public OpenAI. */
export function getAiClient(): { client: OpenAI; via: "platform" | "openai" } {
  if (hasPlatformAI()) {
    return { client: getPlatformAI(), via: "platform" };
  }
  return { client: getDirectOpenAI(), via: "openai" };
}

function stripJsonFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

export async function visionJson(opts: {
  model: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
}): Promise<unknown> {
  const { client, via } = getAiClient();
  console.info(`[ai] visionJson model=${opts.model} via=${via}`);

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `${opts.prompt}\n\nRespond with ONLY valid JSON. No markdown.`,
    },
    {
      type: "image_url",
      image_url: {
        url: `data:${opts.mimeType};base64,${opts.imageBase64}`,
      },
    },
  ];

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "user", content: userContent },
  ];

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: opts.model,
      max_tokens: 8192,
      response_format: { type: "json_object" },
      messages,
    });
  } catch (err) {
    // Gemini / some gateway models reject response_format
    console.warn("[ai] retrying vision without response_format", err);
    completion = await client.chat.completions.create({
      model: opts.model,
      max_tokens: 8192,
      messages,
    });
  }

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("Empty vision response");
  return JSON.parse(stripJsonFence(text)) as unknown;
}
