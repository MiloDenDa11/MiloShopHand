type CollectionTheme = "everyday" | "autumn" | "rain" | "studio";

const illustrations = {
  everyday: {
    src: "/collection-illustrations/everyday-sun.svg",
    alt: "Mặt trời, nhiệt kế và lá xanh gợi những ngày nắng nóng ẩm.",
  },
  autumn: {
    src: "/collection-illustrations/autumn-layers.svg",
    alt: "Lá thu, khăn len và làn gió nhẹ gợi tiết trời thu đông se lạnh.",
  },
  rain: {
    src: "/collection-illustrations/rain-and-wind.svg",
    alt: "Chiếc ô xanh olive giữa những giọt mưa và đường gió chuyển động.",
  },
  studio: {
    src: "/collection-illustrations/milo-design-studio.svg",
    alt: "Bản phác thảo áo, bảng màu, cuộn chỉ và kéo trong góc thiết kế Milo.",
  },
} satisfies Record<CollectionTheme, { src: string; alt: string }>;

const collectionThemes: Record<string, CollectionTheme> = {
  "everyday-your-way": "everyday",
  "layers-of-you": "autumn",
  "move-freely": "rain",
  "ml-atelier-ai-2026": "studio",
};

export function collectionIllustration(collection: {
  slug: string;
  season?: string;
  climate?: string;
}) {
  const knownTheme = Object.hasOwn(collectionThemes, collection.slug)
    ? collectionThemes[collection.slug]
    : undefined;
  if (knownTheme) return illustrations[knownTheme];

  // New collections inherit a relevant visual from their weather description.
  const weather = `${collection.season || ""} ${collection.climate || ""}`.toLowerCase();
  if (/mưa|gió|\brain\b|\bwind\b/u.test(weather)) return illustrations.rain;
  if (/thu|đông|lạnh|autumn|winter|cold/u.test(weather)) return illustrations.autumn;
  if (/nóng|ẩm|hè|summer|hot/u.test(weather)) return illustrations.everyday;
  return illustrations.studio;
}
