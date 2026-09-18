/** Presentation only: scoring and payment rules remain owned by the engine. */
export function winTheme(
  label: string,
): "sea" | "jade" | "bloom" | "celestial" | "gold" {
  if (["自摸", "胡"].includes(label)) return "gold";
  if (label === "海底捞月") return "sea";
  if (["杠上开花", "补花胡"].includes(label)) return "bloom";
  if (
    ["全球独钓", "清一色", "混一色", "门清", "无花果", "对对胡"].includes(label)
  )
    return "jade";
  return "celestial";
}
