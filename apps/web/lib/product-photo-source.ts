export type ProductPhotoSource = { src: string; view: string | null; atlas?: { columns: number; rows: number; frame: number; aspect: number } };

export function productPhotoSource(source: string): ProductPhotoSource {
  const url = new URL(source, "https://milo.local");
  // Retire legacy tint recipes without modifying stored order snapshots.
  if (/^\/(?:collection-(?:ai|spin)\/|products\/)/.test(url.pathname)) {
    url.searchParams.delete("miloColor"); url.searchParams.delete("baseColor");
  }
  if (url.pathname.startsWith("/collection-spin/")) {
    const columns = Number(url.searchParams.get("cols")), rows = Number(url.searchParams.get("rows")), frame = Number(url.searchParams.get("frame")), aspect = Number(url.searchParams.get("ar"));
    if (Number.isInteger(columns) && Number.isInteger(rows) && Number.isInteger(frame) && columns > 0 && columns <= 24 && rows > 0 && rows <= 24 && frame >= 0 && frame < columns * rows && Number.isFinite(aspect) && aspect > .2 && aspect < 4) {
      for (const key of ["cols", "rows", "frame", "ar"]) url.searchParams.delete(key);
      return { src: url.pathname + url.search, view: null, atlas: { columns, rows, frame, aspect } };
    }
  }
  const requested = url.searchParams.get("view");
  const plate = url.pathname.startsWith("/collection-ai/");
  const view = plate && (!requested || ["front", "back"].includes(requested)) ? requested || "front" : null;
  if (view) url.searchParams.delete("view");
  return { src: source.startsWith("/") ? url.pathname + url.search : url.toString(), view };
}
