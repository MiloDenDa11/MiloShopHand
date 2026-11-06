import * as THREE from "three";
import { garmentPalette } from "../packages/shared/src/garment-palette.mjs";

// Native 3D geometry, not a rotating photograph. The same deterministic spec
// drives mesh construction, product metadata and the AI reference prompt.
export function createGarment(spec) {
  const group = new THREE.Group();
  group.name = spec.slug;
  const g = spec.geometry;
  const short = spec.kind === "tee" && g.sleeve !== "long";
  const oversized = spec.fit === "Oversized";
  const cropped = /cropped/.test(g.hem) || /Cropped/.test(spec.fit);
  const bottom = cropped ? -.57 : /longline/.test(g.hem) ? -1.0 : -.83;
  const width = oversized ? .63 : .55;
  const ribbed = spec.kind === "hoodie" || spec.kind === "bomber" || /rib/.test(g.hem);
  const metal = new THREE.MeshStandardMaterial({ name: "Hardware", color: "#b6af9d", metalness: .72, roughness: .3 });
  const body = new THREE.MeshStandardMaterial({ name: "Fabric", color: spec.colorHex, roughness: /satin|shell|technical/.test(g.panel) ? .5 : .91, side: THREE.DoubleSide });
  const accent = new THREE.MeshStandardMaterial({ name: "Trim", color: spec.accentHex, roughness: .85, side: THREE.DoubleSide });
  const subtle = new THREE.MeshStandardMaterial({ name: "Seams", color: new THREE.Color(spec.colorHex).multiplyScalar(.76), roughness: .95 });
  const add = (name, geometry, material = body) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };
  function geometry(positions, indices, uvs) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    if (uvs) geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }
  function surface(rows, columns, point) {
    const positions = [], indices = [], uvs = [];
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        positions.push(...point(column / columns, row / rows));
        // glTF image coordinates start at the upper left (GLTFLoader flipY=false).
        uvs.push(column / columns, row / rows);
        if (row < rows && column < columns) {
          const a = row * (columns + 1) + column;
          indices.push(a, a + columns + 1, a + 1, a + 1, a + columns + 1, a + columns + 2);
        }
      }
    }
    const result = geometry(positions, indices, uvs);
    const normals = result.getAttribute("normal");
    // Coincident UV seam vertices need matching normals, or a smooth sleeve/
    // hood acquires a sharp longitudinal crease even with enough segments.
    for (let row = 0; row <= rows; row++) {
      const first = row * (columns + 1), last = first + columns;
      const a = new THREE.Vector3().fromArray(positions, first * 3), b = new THREE.Vector3().fromArray(positions, last * 3);
      if (a.distanceToSquared(b) < 1e-12) {
        const normal = new THREE.Vector3().fromBufferAttribute(normals, first).add(new THREE.Vector3().fromBufferAttribute(normals, last)).normalize();
        normals.setXYZ(first, normal.x, normal.y, normal.z); normals.setXYZ(last, normal.x, normal.y, normal.z);
      }
    }
    return result;
  }
  const bodyWidth = (y) => {
    const t = THREE.MathUtils.clamp((y - bottom) / (.63 - bottom), 0, 1);
    return width * (1 - .035 * Math.sin(t * Math.PI) - (ribbed ? .025 * (1 - t) ** 5 : 0));
  };
  const depth = (y) => .205 + .027 * Math.sin((y - bottom) / (.63 - bottom) * Math.PI);
  const frontZ = (x, y) => depth(y) * Math.sqrt(Math.max(.02, 1 - (x / bodyWidth(y)) ** 2));
  const shoulderBase = (angle) => .555 + .105 * Math.abs(Math.sin(angle)) ** .75;
  const torso = add("Sewn torso", surface(36, 96, (u, v) => {
    const angle = u * Math.PI * 2;
    const y = bottom + (shoulderBase(angle) - bottom) * v;
    const fold = .005 * Math.sin(angle * 13 + v * 9) * Math.sin(v * Math.PI);
    return [(bodyWidth(y) + fold) * Math.cos(angle), y + (!cropped ? .012 * Math.cos(angle * 5) * (1 - v) ** 6 : 0), (depth(y) + fold) * Math.sin(angle)];
  }));
  const neckWidth = /wide/.test(g.collar) ? .245 : .185;
  const neckDepth = .135;
  const shoulders = add("Rounded shoulder yoke", surface(20, 96, (u, v) => {
    const angle = u * Math.PI * 2;
    const neckY = .77 - Math.max(0, Math.sin(angle)) * (short ? .075 : .025);
    const base = shoulderBase(angle), radial = v;
    const x = THREE.MathUtils.lerp(bodyWidth(base), neckWidth, radial) * Math.cos(angle);
    const z = THREE.MathUtils.lerp(depth(base), neckDepth, radial) * Math.sin(angle);
    return [x, THREE.MathUtils.lerp(base, neckY, v) + .008 * Math.sin(v * Math.PI), z];
  }));
  const torsoNormals = torso.geometry.getAttribute("normal"), shoulderNormals = shoulders.geometry.getAttribute("normal");
  for (let i = 0; i <= 96; i++) {
    const last = 36 * 97 + i;
    const normal = new THREE.Vector3().fromBufferAttribute(torsoNormals, last).add(new THREE.Vector3().fromBufferAttribute(shoulderNormals, i)).normalize();
    torsoNormals.setXYZ(last, normal.x, normal.y, normal.z); shoulderNormals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  function seam(name, points, radius = .0035, material = subtle) {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    return add(name, new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), radius, 6, false), material);
  }
  function band(name, y, height, material = body, bandWidth = width, bandDepth = .21) {
    return add(name, surface(5, 64, (u, v) => {
      const a = u * Math.PI * 2;
      const rib = .002 * Math.cos(a * 52);
      return [(bandWidth + rib) * Math.cos(a), y + v * height, (bandDepth + rib) * Math.sin(a)];
    }), material);
  }
  band("Hem finishing", bottom + .005, ribbed ? .105 : .025, g.stripe ? accent : body, bodyWidth(bottom + .04), depth(bottom + .04) + .003);
  if (g.hem === "layered") band("Layered cotton hem", bottom - .045, .05, accent, width * .98, .21);

  for (const side of [-1, 1]) {
    const length = short ? .39 : .88;
    // Bury the sleeve root below the rounded shoulder instead of placing a
    // full tube above it, which previously produced pointed shoulder spikes.
    const start = new THREE.Vector3(side * (width - .23), short ? .44 : .48, -.005);
    const end = new THREE.Vector3(side * (width + length * (short ? .75 : .50)), .57 - length * (short ? .82 : .96), .015);
    const axis = end.clone().sub(start).normalize();
    const normal = new THREE.Vector3(-axis.y, axis.x, 0).normalize();
    const binormal = new THREE.Vector3(0, 0, 1);
    const sleeveMaterial = /contrast-sleeve|varsity/.test(g.panel) ? accent : body;
    const sleeve = surface(32, 48, (u, v) => {
      const a = u * Math.PI * 2;
      const center = start.clone().lerp(end, v);
      center.z += .028 * Math.sin(v * Math.PI);
      const radius = THREE.MathUtils.lerp(.18, short ? .16 : .105, v) + .004 * Math.sin(v * Math.PI * 5) * Math.sin(v * Math.PI);
      const vertex = center.addScaledVector(normal, Math.cos(a) * radius).addScaledVector(binormal, Math.sin(a) * radius * .86);
      return vertex.toArray();
    });
    add(`${side < 0 ? "Right" : "Left"} sleeve`, sleeve, sleeveMaterial);
    if (!short) {
      add("Ribbed wrist cuff", surface(5, 36, (u, v) => {
        const a = u * Math.PI * 2;
        const center = end.clone().addScaledVector(axis, v * .095);
        const radius = .105 + .0015 * Math.cos(a * 30);
        return center.addScaledVector(normal, Math.cos(a) * radius).addScaledVector(binormal, Math.sin(a) * radius * .86).toArray();
      }), g.stripe ? accent : sleeveMaterial);
    }
    seam("Sleeve stitching", [start.clone().addScaledVector(binormal, .18).toArray(), start.clone().lerp(end, .5).addScaledVector(binormal, .145).toArray(), end.clone().addScaledVector(binormal, short ? .15 : .095).toArray()], .0025);
    if (g.stripe || /sleeve-stripe/.test(g.panel)) {
      seam("Contrast sleeve tape", [start.clone().addScaledVector(normal, .21).toArray(), start.clone().lerp(end, .55).addScaledVector(normal, .16).toArray(), end.clone().addScaledVector(normal, .115).toArray()], .012, accent);
    }
  }
  const hasHood = /hood/.test(g.collar);
  if (hasHood) {
    // The old sphere had a narrow longitudinal slit facing the camera. A hood
    // is a rear dome with a broad oval face opening, not a slit in a full head.
    const hoodPoint = (u, v, inner = false) => {
      const angle = u * Math.PI * 2 * (inner ? 1 : -1);
      const arc = v * Math.PI / 2, radius = Math.cos(arc);
      const opening = (inner ? .245 : .262) * radius;
      const height = (inner ? .267 : .285) * radius;
      const lip = .165 - .055 * Math.cos(angle);
      return [opening * Math.sin(angle) * (.82 + .18 * Math.cos(angle)), .985 + height * Math.cos(angle), lip * (1 - Math.sin(arc)) - (inner ? .278 : .296) * Math.sin(arc)];
    };
    add("Open hood outer shell", surface(32, 72, (u, v) => hoodPoint(u, v)));
    const lining = body.clone(); lining.name = "FabricLining"; lining.color.multiplyScalar(.48);
    const interior = surface(32, 72, (u, v) => hoodPoint(u, v, true));
    const shade = [];
    for (let row = 0; row <= 32; row++) for (let column = 0; column <= 72; column++) {
      // Baked cavity shading follows shell depth, not a stripe down the face.
      const value = .9 * Math.exp(-row / 32 * 3);
      shade.push(value, value, value);
    }
    interior.setAttribute("color", new THREE.Float32BufferAttribute(shade, 3));
    lining.vertexColors = true;
    const innerMaterial = g.collar === "double-hood" ? accent.clone() : lining;
    innerMaterial.vertexColors = true;
    add("Hood interior lining", interior, innerMaterial);
    // Roll the edge from the outer shell into its lining, with no panel across
    // the face. This also gives the opening visible cloth thickness at 360°.
    add("Rolled hood opening", surface(6, 72, (u, v) => {
      const a = hoodPoint(u, 0), b = hoodPoint(1 - u, 0, true);
      return [THREE.MathUtils.lerp(a[0], b[0], v), THREE.MathUtils.lerp(a[1], b[1], v), THREE.MathUtils.lerp(a[2], b[2], v) + .008 * Math.sin(v * Math.PI)];
    }));
    for (const side of [-1, 1]) {
      seam("Hood drawcord", [[side * .105, .742, .231], [side * .126, .53, .249], [side * .118, .32, .244]], .0055, accent);
      const tip = add("Drawcord aglet", new THREE.CylinderGeometry(.007, .007, .028, 10), metal);
      tip.position.set(side * .118, .306, .244);
    }
  } else if (g.collar !== "collarless") {
    const height = /stand|mock/.test(g.collar) ? .12 : .035;
    add("Finished neck opening", surface(5, 64, (u, v) => {
      const a = u * Math.PI * 2;
      const y = .77 - Math.max(0, Math.sin(a)) * (short ? .075 : .025);
      return [(neckWidth + .005 + .003 * Math.cos(a * 44)) * Math.cos(a), y + v * height, (neckDepth + .008) * Math.sin(a)];
    }), /ringer|striped/.test(g.collar) ? accent : body);
    if (g.collar === "point") {
      for (const side of [-1, 1]) {
        const p = [side * .035, .755, .155, side * .24, .72, .10, side * .27, .52, .20];
        add("Point collar", geometry(p, side < 0 ? [0, 2, 1] : [0, 1, 2]), body);
      }
    }
  }

  function patch(name, x, y, w, h, material, back = false, offset = .009) {
    const side = back ? -1 : 1;
    return add(name, surface(8, 12, (u, v) => {
      const xx = (x + (u - .5) * w) * side;
      const yy = y + (.5 - v) * h;
      return [xx, yy, side * (frontZ(xx, yy) + offset)];
    }), material);
  }
  const pocket = (x, y, w = .2, h = .23, flap = false) => {
    patch("Fabric pocket", x, y, w, h, body);
    for (const edge of [-1, 1]) seam("Pocket topstitch", [[x + edge * w / 2, y + h / 2, frontZ(x + edge * w / 2, y) + .012], [x + edge * w / 2, y - h / 2, frontZ(x + edge * w / 2, y) + .012]], .003);
    if (flap) patch("Pocket flap", x, y + h / 2, w + .012, .06, accent, false, .016);
  };
  if (/chest/.test(g.pockets)) {
    pocket(-.26, .3, .2, .21, false);
    if (g.pockets === "two-chest") pocket(.26, .3, .2, .21);
  }
  if (/four|flap|patch|cargo/.test(g.pockets) && g.pockets !== "chest") {
    for (const side of [-1, 1]) {
      pocket(side * .28, -.42, .24, .26, /flap|cargo/.test(g.pockets));
      if (/four/.test(g.pockets)) pocket(side * .27, .23, .20, .21, /flap/.test(g.pockets));
    }
    if (g.pockets === "three-patch") pocket(-.27, .25);
  }
  if (/kangaroo/.test(g.pockets)) {
    if (g.zipper) for (const side of [-1, 1]) patch("Split kangaroo pocket", side * .2, -.42, .32, .30, body);
    else {
      add("Kangaroo pocket", surface(16, 24, (u, v) => {
        const pocketWidth = .44 + .24 * Math.sin(Math.min(1, v / .65) * Math.PI / 2);
        const x = (u - .5) * pocketWidth, y = -.27 - v * .31;
        return [x, y, frontZ(x, y) + .012 + .012 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI)];
      }));
      const outline = [[-.34,-.47],[-.34,-.55],[-.28,-.58],[0,-.58],[.28,-.58],[.34,-.55],[.34,-.47]];
      seam("Kangaroo pocket lower stitching", outline.map(([x,y])=>[x,y,frontZ(x,y)+.016]), .0028);
    }
    for (const side of [-1, 1]) seam("Kangaroo pocket opening", [[side * .22, -.27, frontZ(side * .22, -.27) + .018], [side * .34, -.47, frontZ(side * .34, -.47) + .018]], .0045, subtle);
  }
  if (/welt|zip/.test(g.pockets) && !/kangaroo/.test(g.pockets)) {
    for (const side of [-1, 1]) seam("Welt pocket", [[side * .21, -.39, .23], [side * .37, -.19, .195]], .009, /zip/.test(g.pockets) ? metal : subtle);
  }
  const zFront = (y) => frontZ(0, y) + .014;
  if (g.zipper || /half-zip|henley/.test(g.panel) || g.collar === "henley") {
    const start = g.zipper ? bottom + .06 : .24;
    seam("Center zipper", [[0, start, zFront(start)], [0, .2, zFront(.2)], [0, .7, .16]], .007, metal);
    const tab = add("Zipper pull", new THREE.BoxGeometry(.022, .05, .012), metal);
    tab.position.set(0, .58, .19);
  }
  if (/coach|snap-baseball|placket|overshirt|chore/.test(g.panel)) {
    patch("Button placket", 0, -.02, .045, 1.2, body);
    for (let y = bottom + .18; y < .66; y += .22) {
      const button = add("Snap button", new THREE.SphereGeometry(.012, 10, 8), metal);
      button.position.set(0, y, frontZ(0, y) + .023);
      button.scale.z = .4;
    }
  }
  if (/contrast-yoke|chevron/.test(g.panel)) {
    for (const back of [false, true]) {
      const side = back ? -1 : 1;
      for (const x of [-.32, .32]) seam("Contrast yoke", [[x * side, .53, side * (frontZ(x, .53) + .008)], [0, .32, side * (frontZ(0, .32) + .008)]], .027, accent);
    }
  }
  if (/rib-side|vertical/.test(g.panel)) {
    for (const side of [-1, 1]) seam("Side panel", [[side * .48, bottom + .10, .10], [side * .50, -.02, .10], [side * .49, .52, .13]], .018, accent);
  }
  if (g.panel === "belted") band("Waist belt", -.35, .055, accent, width + .01, .24);
  if (/fine-horizontal/.test(g.panel)) {
    for (let y = bottom + .12; y < .64; y += .10) for (const back of [false, true]) patch("Fine stripe", 0, y, width * 1.78, .012, accent, back);
  }
  if (/diamond-quilt|waffle|corduroy/.test(g.panel)) {
    for (const back of [false, true]) {
      const side = back ? -1 : 1;
      for (let x = -.4; x <= .4; x += .1) seam("Textile construction", [[x, bottom + .13, side * (frontZ(x, bottom + .13) + .007)], [x, .55, side * (frontZ(x, .55) + .007)]], .0025);
      if (g.panel !== "corduroy") for (let y = bottom + .18; y < .60; y += .13) patch("Quilt cross seam", 0, y, .94, .003, subtle, back);
    }
  }
  if (g.sleeve === "raglan" || g.panel === "raglan") for (const side of [-1, 1]) seam("Raglan seam", [[side * .18, .74, .145], [side * .34, .5, .194], [side * .48, .22, .13]], .0045);

  const branded = spec.brandVersion === "floral-v2";
  const palette = garmentPalette(spec.colorHex, spec.accentHex);
  const logo = new THREE.MeshStandardMaterial({ name: "BrandML", color: branded ? palette.ink : spec.accentHex, roughness: .95, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const word = logo.clone(); word.name = branded ? "BrandBack" : "BrandWord";
  const chestY = g.pockets === "two-chest" ? .535 : .32;
  const chestSize = g.pockets === "two-chest" ? .13 : .17;
  if (branded) {
    // A cloth-coloured underbase keeps stripes/panels from obscuring fine ink.
    patch("Chest print underbase", .245, chestY, chestSize + .035, chestSize + .035, body, false, .016);
    patch("Back floral print underbase", 0, .10, 1.015, .70, body, true, .016);
  }
  patch("ML interwoven chest embroidery", .245, chestY, chestSize, chestSize, logo, false, .024);
  if (branded) patch("MiloShopHand floral back logo", 0, .10, .96, .64, word, true, .028);
  else patch("MiloShopHand flowing back signature", 0, .29, .86, .22, word, true, .024);
  group.userData = { name: spec.name, kind: spec.kind, geometry: g, meshVersion: "rounded-shell-v3", colorHex: spec.colorHex, source: "AI design reference with native 3D garment construction", brand: "ML / MiloShopHand", ...(branded ? { brandVersion: "floral-v2", logoContrast: palette.contrast } : {}) };
  return group;
}

// Small glTF 2.0/GLB packer: positions/normals/UVs/indexed triangles and embedded
// PNG brand artwork. No browser, remote converter or runtime generation needed.
export function packGlb(group, artwork) {
  const chunks = [], nodes = [], meshes = [], materials = [], accessors = [], bufferViews = [];
  const materialMap = new Map();
  let byteLength = 0;
  const append = (bytes, target) => {
    const view = { buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, ...(target ? { target } : {}) };
    bufferViews.push(view);
    chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    const padding = (4 - bytes.byteLength % 4) % 4;
    if (padding) chunks.push(Buffer.alloc(padding));
    byteLength += bytes.byteLength + padding;
    return bufferViews.length - 1;
  };
  group.updateMatrixWorld(true);
  group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const attributes = {};
    for (const [name, semantic, type] of [["position", "POSITION", "VEC3"], ["normal", "NORMAL", "VEC3"], ["uv", "TEXCOORD_0", "VEC2"], ["color", "COLOR_0", "VEC3"]]) {
      const attribute = geometry.getAttribute(name);
      if (!attribute) continue;
      const array = new Float32Array(attribute.array);
      const accessor = { bufferView: append(new Uint8Array(array.buffer), 34962), componentType: 5126, count: attribute.count, type };
      if (name === "position") {
        geometry.computeBoundingBox();
        accessor.min = geometry.boundingBox.min.toArray();
        accessor.max = geometry.boundingBox.max.toArray();
      }
      attributes[semantic] = accessors.push(accessor) - 1;
    }
    const index = geometry.getIndex();
    const indices = new Uint32Array(index ? index.array : Array.from({ length: geometry.getAttribute("position").count }, (_, i) => i));
    const indexAccessor = accessors.push({ bufferView: append(new Uint8Array(indices.buffer), 34963), componentType: 5125, count: indices.length, type: "SCALAR" }) - 1;
    const material = mesh.material;
    if (!materialMap.has(material.uuid)) {
      const entry = { name: material.name, pbrMetallicRoughness: { baseColorFactor: [...material.color.toArray(), 1], roughnessFactor: material.roughness, metallicFactor: material.metalness }, doubleSided: material.side === THREE.DoubleSide };
      if (material.name.startsWith("Brand")) {
        entry.alphaMode = "BLEND";
        entry.pbrMetallicRoughness.baseColorTexture = { index: material.name === "BrandML" ? 0 : 1 };
      }
      materialMap.set(material.uuid, materials.push(entry) - 1);
    }
    const meshIndex = meshes.push({ name: mesh.name, primitives: [{ attributes, indices: indexAccessor, material: materialMap.get(material.uuid), mode: 4 }] }) - 1;
    nodes.push({ name: mesh.name, mesh: meshIndex, matrix: mesh.matrixWorld.toArray() });
  });
  const images = artwork.map((bytes) => ({ bufferView: append(bytes), mimeType: "image/png" }));
  const json = { asset: { version: "2.0", generator: "MiloShopHand garment builder", copyright: "MiloShopHand original geometry and brand artwork" }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i), extras: group.userData }], nodes, meshes, materials, accessors, bufferViews, buffers: [{ byteLength }], images, textures: images.map((_, source) => ({ source, sampler: 0 })), samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }] };
  let jsonBuffer = Buffer.from(JSON.stringify(json));
  jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc((4 - jsonBuffer.length % 4) % 4, 0x20)]);
  const binary = Buffer.concat(chunks);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonBuffer.length + 8 + binary.length, 8);
  const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonBuffer.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binary.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, binary]);
}
