export type FrameBounds = { x: number; y: number; width: number; height: number };
export type SpinAtlas = { src: string; width: number; height: number; columns: number; rows: number; firstFrame: number; count: number; inset?: number; frames?: FrameBounds[] };
export type PhotoSpin = { status: "ready"; verified: true; axis: "y"; frameCount: number; atlases: SpinAtlas[]; colorHex: string };

// Incomplete or duplicated image sets must never be advertised as 360°.
export function isPhotoSpin(value: any): value is PhotoSpin {
  if (value?.status !== "ready" || value.verified !== true || value.axis !== "y" || typeof value.colorHex !== "string" || !/^#[a-f0-9]{6}$/i.test(value.colorHex) || !Number.isInteger(value.frameCount) || value.frameCount < 24 || !Array.isArray(value.atlases)) return false;
  const frames = new Set<number>();
  for (const atlas of value.atlases) {
    if (!atlas || typeof atlas.src !== "string") return false;
    if (!/^\/collection-spin\/[a-z0-9/_-]+\.png(?:\?v=[a-f0-9]+)?$/.test(atlas.src) || ![atlas.width,atlas.height,atlas.columns,atlas.rows,atlas.firstFrame,atlas.count].every(Number.isInteger)) return false;
    if (atlas.columns < 1 || atlas.rows < 1 || atlas.count < 1 || atlas.count > atlas.columns * atlas.rows || atlas.width / atlas.columns < 450 || atlas.height / atlas.rows < 450) return false;
    if (atlas.inset != null && (!Number.isFinite(atlas.inset) || atlas.inset < 0 || atlas.inset >= Math.min(atlas.width/atlas.columns,atlas.height/atlas.rows)/2)) return false;
    if (atlas.frames != null && (!Array.isArray(atlas.frames) || atlas.frames.length !== atlas.count || atlas.frames.some((b:any)=>!b||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<=0||b.height<=0||b.x<0||b.y<0||b.x+b.width>atlas.width/atlas.columns+1||b.y+b.height>atlas.height/atlas.rows+1))) return false;
    for (let i = 0; i < atlas.count; i++) {
      const index = atlas.firstFrame + i;
      if (index < 0 || index >= value.frameCount || frames.has(index)) return false;
      frames.add(index);
    }
  }
  return frames.size === value.frameCount;
}
export function photoSpinFor(product: any, colorHex?: string): PhotoSpin | null {
  const selected = colorHex?.toLowerCase();
  const value = product.design?.photoSpins?.[selected || ""];
  return isPhotoSpin(value) && value.colorHex.toLowerCase() === selected ? value : null;
}
export const normalizedFrame = (frame: number, count: number) => ((frame % count) + count) % count;
export function spinFrame(spin: PhotoSpin, frame: number) {
  const index = normalizedFrame(frame, spin.frameCount);
  const atlas = spin.atlases.find(a=>index >= a.firstFrame && index < a.firstFrame + a.count)!;
  const local = index - atlas.firstFrame;
  return { atlas, column: local % atlas.columns, row: Math.floor(local / atlas.columns), bounds: atlas.frames?.[local] };
}
