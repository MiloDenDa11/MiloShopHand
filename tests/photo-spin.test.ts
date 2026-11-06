import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isPhotoSpin,photoSpinFor,spinFrame,normalizedFrame} from "../apps/web/lib/photo-spin";

const entries=JSON.parse(readFileSync("apps/web/content/photo-spins.json","utf8"));
const spin=entries[0].spin;

test("photo 360 requires at least 24 distinct, fully covered, usable viewpoints",()=>{
  for(const entry of entries)assert(isPhotoSpin(entry.spin),entry.slug);
  const invalid=(change:(s:any)=>void)=>{const s=structuredClone(spin);change(s);assert.equal(isPhotoSpin(s),false);};
  invalid(s=>s.frameCount=23);
  invalid(s=>s.atlases.pop());
  invalid(s=>s.atlases[1].firstFrame=0);
  invalid(s=>s.atlases[0].src="//example.test/spin.png");
  invalid(s=>s.atlases[0].width=100);
  invalid(s=>s.atlases[0].frames[0].width=10000);
  invalid(s=>s.axis="x");
  invalid(s=>s.verified=false);
  invalid(s=>delete s.colorHex);
  invalid(s=>s.atlases[0]=null);
  invalid(s=>s.atlases[0].frames={});
  invalid(s=>s.atlases[0].frames[0]=null);
  invalid(s=>s.atlases[0].inset=-1);
});

test("rotation wraps in both directions and maps front, sides, back to distinct cells",()=>{
  assert.equal(normalizedFrame(-1,24),23);
  assert.equal(normalizedFrame(24,24),0);
  const seen=new Set<string>();
  for(let frame=0;frame<24;frame++){
    const {atlas,column,row,bounds}=spinFrame(spin,frame);
    assert(bounds);
    assert(column>=0&&column<atlas.columns&&row>=0&&row<atlas.rows);
    seen.add(`${atlas.src}:${column}:${row}`);
  }
  assert.equal(seen.size,24);
  for(const frame of [0,6,12,18])assert.equal(spinFrame(spin,frame).atlas.firstFrame,frame);
  assert.deepEqual(spinFrame(spin,-1),spinFrame(spin,23));
});

test("a different selected colour never borrows the original colour's 360 images",()=>{
  const product={design:{photoSpins:{[spin.colorHex.toLowerCase()]:spin}}};
  assert.equal(photoSpinFor(product,spin.colorHex.toUpperCase()),spin);
  assert.equal(photoSpinFor(product,"#ff00ff"),null);
  assert.equal(photoSpinFor(product),null);
  assert.equal(photoSpinFor({design:{photoSpins:{"#ff00ff":spin}}},"#ff00ff"),null);
});
