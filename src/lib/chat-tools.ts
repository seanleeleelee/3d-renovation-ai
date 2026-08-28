import { nanoid } from "nanoid";
import type OpenAI from "openai";
import { AI_CHAT_MODEL, getAiClient, hasAnyAi } from "@/lib/platform-ai";
import { CATALOG, matchCatalog, PRESET_MATERIALS } from "@/lib/catalog";
import { roomCentroid } from "@/lib/scene";
import type { Proposal, Scene } from "@/types/scene";

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatImage = {
  mimeType: string;
  /** Raw base64 without data: URL prefix */
  base64: string;
};

export type ChatResult = {
  reply: string;
  scene: Scene;
  proposals: Proposal[];
};

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "place_asset",
      description: "Place a catalog furniture item into a room",
      parameters: {
        type: "object",
        properties: {
          roomId: { type: "string" },
          catalogId: { type: "string" },
          labels: { type: "array", items: { type: "string" } },
          x: { type: "number" },
          z: { type: "number" },
          rotationY: { type: "number" },
        },
        required: ["roomId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_material",
      description: "Set wall or floor material for a room",
      parameters: {
        type: "object",
        properties: {
          roomId: { type: "string" },
          target: { type: "string", enum: ["walls", "floor"] },
          preset: {
            type: "string",
            enum: Object.keys(PRESET_MATERIALS),
          },
          color: { type: "string" },
        },
        required: ["roomId", "target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_remove_wall",
      description: "Propose removing a wall (requires user confirmation)",
      parameters: {
        type: "object",
        properties: {
          wallId: { type: "string" },
          reason: { type: "string" },
        },
        required: ["wallId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_asset",
      description: "Remove a placed asset by id",
      parameters: {
        type: "object",
        properties: { assetId: { type: "string" } },
        required: ["assetId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_scene",
      description: "Summarize rooms, walls, and assets",
      parameters: { type: "object", properties: {} },
    },
  },
];

function applyTool(
  scene: Scene,
  name: string,
  args: Record<string, unknown>,
): { scene: Scene; proposals: Proposal[]; observation: string } {
  const proposals: Proposal[] = [];
  let next = scene;

  if (name === "list_scene") {
    return {
      scene,
      proposals,
      observation: JSON.stringify({
        rooms: scene.rooms.map((r) => ({ id: r.id, name: r.name })),
        walls: scene.walls
          .filter((w) => !w.removed)
          .map((w) => ({ id: w.id, roomIds: w.roomIds })),
        assets: scene.assets.map((a) => ({
          id: a.id,
          catalogId: a.catalogId,
          roomId: a.roomId,
        })),
        catalog: CATALOG.map((c) => ({ id: c.id, name: c.name })),
      }),
    };
  }

  if (name === "place_asset") {
    const roomId = String(args.roomId);
    const room = scene.rooms.find((r) => r.id === roomId);
    if (!room) return { scene, proposals, observation: "Room not found" };
    const catalogId =
      (args.catalogId as string | undefined) ??
      matchCatalog((args.labels as string[]) ?? ["sofa"]).id;
    const [cx, cz] = roomCentroid(room);
    const asset = {
      id: nanoid(8),
      catalogId,
      roomId,
      position: [
        typeof args.x === "number" ? args.x : cx,
        0,
        typeof args.z === "number" ? args.z : cz,
      ] as [number, number, number],
      rotationY: typeof args.rotationY === "number" ? args.rotationY : 0,
      scale: 1,
      label: CATALOG.find((c) => c.id === catalogId)?.name,
    };
    next = { ...scene, assets: [...scene.assets, asset] };
    return { scene: next, proposals, observation: `Placed ${asset.label}` };
  }

  if (name === "set_material") {
    const roomId = String(args.roomId);
    const target = String(args.target);
    const mat =
      (args.preset ? PRESET_MATERIALS[String(args.preset)] : undefined) ??
      (typeof args.color === "string"
        ? { color: args.color, roughness: 0.9 }
        : PRESET_MATERIALS.warm_white);
    if (target === "floor") {
      next = {
        ...scene,
        rooms: scene.rooms.map((r) =>
          r.id === roomId ? { ...r, floorMaterial: mat } : r,
        ),
      };
    } else {
      next = {
        ...scene,
        walls: scene.walls.map((w) =>
          w.roomIds.includes(roomId) ? { ...w, material: mat } : w,
        ),
      };
    }
    return { scene: next, proposals, observation: `Updated ${target} material` };
  }

  if (name === "propose_remove_wall") {
    const wallId = String(args.wallId);
    if (!scene.walls.some((w) => w.id === wallId)) {
      return { scene, proposals, observation: "Wall not found" };
    }
    const proposal: Proposal = {
      id: nanoid(8),
      type: "remove_wall",
      wallId,
      reason: String(args.reason ?? "Requested via chat"),
      status: "pending",
      source: "chat",
      createdAt: new Date().toISOString(),
    };
    proposals.push(proposal);
    next = {
      ...scene,
      proposals: [...scene.proposals.filter((p) => p.status === "pending"), proposal],
    };
    return {
      scene: next,
      proposals,
      observation: `Proposed removing ${wallId} (awaiting confirmation)`,
    };
  }

  if (name === "remove_asset") {
    const assetId = String(args.assetId);
    next = {
      ...scene,
      assets: scene.assets.filter((a) => a.id !== assetId),
    };
    return { scene: next, proposals, observation: `Removed asset ${assetId}` };
  }

  return { scene, proposals, observation: `Unknown tool ${name}` };
}

function localChat(scene: Scene, message: string): ChatResult {
  const lower = message.toLowerCase();
  let next = scene;
  const proposals: Proposal[] = [];
  let reply =
    "Offline mode (no PlatformAI key). Try: “paint walls warm white”, “place sofa in Living Room”, or “remove wall”.";

  if (lower.includes("warm white") || lower.includes("paint")) {
    const room = scene.rooms[0];
    if (room) {
      const result = applyTool(scene, "set_material", {
        roomId: room.id,
        target: "walls",
        preset: "warm_white",
      });
      next = result.scene;
      reply = `Painted ${room.name} walls warm white.`;
    }
  } else if (lower.includes("sofa") || lower.includes("place")) {
    const room =
      scene.rooms.find((r) => lower.includes(r.name.toLowerCase())) ??
      scene.rooms[0];
    if (room) {
      const result = applyTool(scene, "place_asset", {
        roomId: room.id,
        labels: ["sofa"],
      });
      next = result.scene;
      reply = `Placed a sofa in ${room.name}.`;
    }
  } else if (lower.includes("remove wall") || lower.includes("knock")) {
    const wall = scene.walls.find((w) => !w.removed);
    if (wall) {
      const result = applyTool(scene, "propose_remove_wall", {
        wallId: wall.id,
        reason: "Requested in chat",
      });
      next = result.scene;
      proposals.push(...result.proposals);
      reply = `Proposed removing ${wall.id}. Confirm in the proposals panel.`;
    }
  }

  return { reply, scene: next, proposals };
}

export async function runChatEditor(opts: {
  scene: Scene;
  message: string;
  history?: ChatTurn[];
  images?: ChatImage[];
}): Promise<ChatResult> {
  if (!hasAnyAi()) {
    const note = opts.images?.length
      ? ` Received ${opts.images.length} image(s) (offline — not analyzed).`
      : "";
    const result = localChat(opts.scene, opts.message);
    return { ...result, reply: result.reply + note };
  }

  const { client, via } = getAiClient();
  const hasImages = Boolean(opts.images?.length);
  const model = hasImages
    ? process.env.AI_VISION_MODEL?.trim() ||
      process.env.AI_PHOTO_MODEL?.trim() ||
      AI_CHAT_MODEL
    : AI_CHAT_MODEL;
  console.info(`[ai] chat model=${model} via=${via} images=${opts.images?.length ?? 0}`);

  let scene = opts.scene;
  const allProposals: Proposal[] = [];

  const userText =
    opts.message.trim() ||
    (hasImages
      ? "Look at the attached image(s) and update the renovation scene accordingly. Use tools when you need to place furniture, change materials, or propose wall removal."
      : "");

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: userText },
    ...(opts.images ?? []).map(
      (img): OpenAI.Chat.Completions.ChatCompletionContentPart => ({
        type: "image_url",
        image_url: {
          url: `data:${img.mimeType};base64,${img.base64}`,
        },
      }),
    ),
  ];

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are a renovation scene editor. Mutate the 3D house via tools.
When the user attaches room photos or references, infer materials, furniture, and layout intent from the images.
Structural wall removal must use propose_remove_wall (never delete directly).
Catalog ids: ${CATALOG.map((c) => c.id).join(", ")}
Rooms: ${scene.rooms.map((r) => `${r.id}=${r.name}`).join("; ")}
Walls: ${scene.walls
        .filter((w) => !w.removed)
        .map((w) => w.id)
        .slice(0, 40)
        .join(", ")}`,
    },
    ...(opts.history ?? []).map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    })),
    { role: "user", content: userContent },
  ];

  for (let i = 0; i < 4; i++) {
    const completion = await client.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: "auto",
    });
    const choice = completion.choices[0];
    const msg = choice.message;
    messages.push(msg);

    if (!msg.tool_calls?.length) {
      return {
        reply: msg.content ?? "Done.",
        scene,
        proposals: allProposals,
      };
    }

    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      const args = JSON.parse(call.function.arguments || "{}") as Record<
        string,
        unknown
      >;
      const result = applyTool(scene, call.function.name, args);
      scene = result.scene;
      allProposals.push(...result.proposals);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.observation,
      });
    }
  }

  return {
    reply: "Updated the scene.",
    scene,
    proposals: allProposals,
  };
}
