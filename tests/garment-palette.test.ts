import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CORE_GARMENT_COLORS, garmentPalette } from "../packages/shared/src/garment-palette.mjs";

test("logo ink contrasts with core colours, original designs and middle tones", () => {
  const designs = JSON.parse(readFileSync("apps/web/content/collection-designs.json", "utf8"));
  const colors = [...CORE_GARMENT_COLORS.map(c => c.hex), ...designs.map((s: any) => s.colorHex), "#8d6e56", "#8e715d", "#78846a"];
  for (const color of colors) assert(garmentPalette(color, undefined).contrast >= 4.5, color);
  assert.equal(garmentPalette("#151515", undefined).ink, "#ffffff");
  assert.equal(garmentPalette("#f8f7f2", undefined).ink, "#000000");
  assert.equal(garmentPalette("#722f37", undefined).ink, "#ffffff");
});
