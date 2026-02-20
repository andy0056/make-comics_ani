export type ModelProvider = "together";

export type ModelAdapterProfile = {
  id: string;
  provider: ModelProvider;
  model: string;
  capabilities: Array<"image_generation" | "reference_images">;
  costTier: "free" | "standard" | "premium";
  fallbackOrder: number;
  dimensions: { width: number; height: number };
};

const DEFAULT_PRIMARY_TOGETHER_IMAGE_MODEL = "google/gemini-3-pro-image";

const MODEL_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "google/gemini-3-pro-image": { width: 896, height: 1152 },
  "google/flash-image-2.5": { width: 864, height: 1184 },
};

const FALLBACK_DIMENSIONS = { width: 864, height: 1184 };

function normalizeModel(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getDimensions(model: string): { width: number; height: number } {
  return MODEL_DIMENSIONS[model] ?? FALLBACK_DIMENSIONS;
}

export function getImageModelAdapterProfiles(): ModelAdapterProfile[] {
  const primaryModel =
    normalizeModel(process.env.TOGETHER_IMAGE_MODEL) ??
    DEFAULT_PRIMARY_TOGETHER_IMAGE_MODEL;
  const fallbackModel = normalizeModel(process.env.TOGETHER_IMAGE_FALLBACK_MODEL);

  const adapters: ModelAdapterProfile[] = [
    {
      id: "together-primary",
      provider: "together",
      model: primaryModel,
      capabilities: ["image_generation", "reference_images"],
      costTier: "standard",
      fallbackOrder: 1,
      dimensions: getDimensions(primaryModel),
    },
  ];

  if (fallbackModel && fallbackModel !== primaryModel) {
    adapters.push({
      id: "together-fallback",
      provider: "together",
      model: fallbackModel,
      capabilities: ["image_generation", "reference_images"],
      costTier: "standard",
      fallbackOrder: 2,
      dimensions: getDimensions(fallbackModel),
    });
  }

  return adapters.sort((left, right) => left.fallbackOrder - right.fallbackOrder);
}

