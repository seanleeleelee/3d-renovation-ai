import type { MaterialRef } from "@/types/scene";

export type CatalogItem = {
  id: string;
  name: string;
  category: "sofa" | "table" | "chair" | "storage" | "lighting" | "door" | "rug";
  labels: string[];
  size: [number, number, number];
  color: string;
  accent?: string;
};

export const CATALOG: CatalogItem[] = [
  {
    id: "sofa-olive",
    name: "Olive tufted sofa",
    category: "sofa",
    labels: ["sofa", "couch", "olive", "green", "tufted"],
    size: [2.2, 0.75, 0.9],
    color: "#556b2f",
    accent: "#3f2f1e",
  },
  {
    id: "sofa-grey",
    name: "Grey lounge sofa",
    category: "sofa",
    labels: ["sofa", "couch", "grey", "gray"],
    size: [2.4, 0.7, 0.95],
    color: "#6b7280",
  },
  {
    id: "armchair-burgundy",
    name: "Burgundy armchair",
    category: "chair",
    labels: ["armchair", "chair", "burgundy", "red"],
    size: [0.85, 0.85, 0.85],
    color: "#7a2e3a",
    accent: "#3f2f1e",
  },
  {
    id: "coffee-table",
    name: "Dark wood coffee table",
    category: "table",
    labels: ["coffee table", "table", "wood"],
    size: [1.1, 0.4, 0.55],
    color: "#3f2f1e",
  },
  {
    id: "sideboard",
    name: "Media sideboard",
    category: "storage",
    labels: ["sideboard", "credenza", "cabinet", "tv stand"],
    size: [2.0, 0.65, 0.45],
    color: "#2c2118",
    accent: "#556b2f",
  },
  {
    id: "door-wood",
    name: "Wood panel door",
    category: "door",
    labels: ["door", "wooden door"],
    size: [0.9, 2.1, 0.08],
    color: "#4a3424",
  },
  {
    id: "lamp-orange",
    name: "Orange mushroom lamp",
    category: "lighting",
    labels: ["lamp", "orange", "mushroom"],
    size: [0.35, 0.45, 0.35],
    color: "#e85d04",
  },
  {
    id: "rug-rose",
    name: "Dusty rose rug",
    category: "rug",
    labels: ["rug", "carpet", "rose", "pink"],
    size: [2.8, 0.02, 2.0],
    color: "#c48b8b",
  },
  {
    id: "wardrobe-dark",
    name: "Dark wardrobe",
    category: "storage",
    labels: ["wardrobe", "closet", "cabinet"],
    size: [1.2, 2.2, 0.6],
    color: "#1f1612",
  },
  {
    id: "stool-black",
    name: "Hourglass stool",
    category: "chair",
    labels: ["stool", "seat"],
    size: [0.35, 0.45, 0.35],
    color: "#111111",
  },
  {
    id: "dining-table",
    name: "Dining table",
    category: "table",
    labels: ["dining table", "table"],
    size: [1.6, 0.75, 0.9],
    color: "#6b5344",
  },
  {
    id: "dining-chair",
    name: "Dining chair",
    category: "chair",
    labels: ["dining chair", "chair"],
    size: [0.45, 0.9, 0.5],
    color: "#5c4033",
  },
];

// fix rug color - I made a typo above. Let me fix in a strreplace
export function getCatalogItem(id: string): CatalogItem | undefined {
  return CATALOG.find((c) => c.id === id);
}

export function matchCatalog(labels: string[]): CatalogItem {
  const lowered = labels.map((l) => l.toLowerCase());
  let best = CATALOG[0];
  let bestScore = -1;
  for (const item of CATALOG) {
    const score = item.labels.reduce(
      (acc, label) =>
        acc + (lowered.some((l) => l.includes(label) || label.includes(l)) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

export const PRESET_MATERIALS: Record<string, MaterialRef> = {
  warm_white: { color: "#f5f1e8", roughness: 0.92 },
  soft_grey: { color: "#d7d7d2", roughness: 0.9 },
  olive_wall: { color: "#6b705c", roughness: 0.88 },
  wood_floor: { color: "#8b7355", roughness: 0.7 },
  tile_terracotta: { color: "#c47a5a", roughness: 0.65 },
  dark_wood: { color: "#3f2f1e", roughness: 0.55 },
};
