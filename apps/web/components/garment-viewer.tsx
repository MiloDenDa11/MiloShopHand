"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RotateCcw, RotateCw, ZoomIn, ZoomOut, RefreshCw } from "lucide-react";
import { applyGarmentPalette } from "../../../packages/shared/src/garment-palette.mjs";

type Actions = { turn: (angle: number) => void; face: (angle: number) => void; zoom: (scale: number) => void; reset: () => void };
function dispose(object: THREE.Object3D) {
  object.traverse((item) => {
    if (!(item instanceof THREE.Mesh)) return;
    item.geometry.dispose();
    for (const material of Array.isArray(item.material) ? item.material : [item.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}
export default function GarmentViewer({ modelUrl, name, colorHex, accentHex, brandVersion, initialView = "front" }: { modelUrl: string; name: string; colorHex?: string; accentHex?: string; brandVersion?: string; initialView?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const invalidate = useRef<(() => void) | null>(null);
  const paletteRef = useRef({ colorHex, accentHex, brandVersion });
  paletteRef.current = { colorHex, accentHex, brandVersion };
  const actions = useRef<Actions | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [angle, setAngle] = useState(0);
  const paint = () => {
    const { colorHex: color, accentHex: accent, brandVersion: version } = paletteRef.current;
    if (!modelRef.current || !color || version !== "floral-v2") return;
    const palette = applyGarmentPalette(modelRef.current, color, accent);
    if (host.current) { host.current.dataset.modelColor = color; host.current.dataset.logoContrast = String(palette.contrast); }
    invalidate.current?.();
  };
  useEffect(() => { paint(); }, [colorHex, accentHex, brandVersion]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    setStatus("loading"); setError("");
    let disposed = false, visible = true, frame = 0;
    let model: THREE.Group | undefined;
    let renderer: THREE.WebGLRenderer;
    const canvas = document.createElement("canvas");
    let context: WebGL2RenderingContext | null = null;
    try { context = canvas.getContext("webgl2", { antialias: true, alpha: true, powerPreference: "low-power" }); } catch {}
    if (!context) {
      setStatus("error"); setError("Thiết bị chưa hỗ trợ WebGL. Bạn vẫn có thể xem ảnh mặt trước và mặt sau trong thư viện."); return;
    }
    try { renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true, powerPreference: "low-power" }); }
    catch { setStatus("error"); setError("Thiết bị chưa hỗ trợ WebGL. Bạn vẫn có thể xem ảnh mặt trước và mặt sau trong thư viện."); return; }
    const abort = new AbortController();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.setClearColor(0xf0ece4, 1);
    renderer.domElement.setAttribute("aria-label", `Mô hình 360 độ ${name}`);
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.dataset.garmentCanvas = "true";
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, .1, 30);
    camera.position.set(0, .10, 4.65);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, .03, 0);
    controls.enablePan = false; controls.enableDamping = false;
    controls.minDistance = 2.3; controls.maxDistance = 9;
    controls.minPolarAngle = Math.PI * .03; controls.maxPolarAngle = Math.PI * .97;
    controls.rotateSpeed = .65; controls.zoomSpeed = .7;
    scene.add(new THREE.HemisphereLight(0xfffaf0, 0x51493c, 3));
    const key = new THREE.DirectionalLight(0xfff6df, 3.3); key.position.set(2, 4, 4); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 2); fill.position.set(-3, 1, -3); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(1, 2, -4); scene.add(rim);
    const render = () => {
      if (disposed || !visible || document.hidden || frame) return;
      frame = requestAnimationFrame(() => { frame = 0; if (!disposed && visible && !document.hidden) renderer.render(scene, camera); });
    };
    invalidate.current = render;
    let fitDistance = 4.65;
    const fit = (reset = false) => {
      if (!model) return;
      const bounds = new THREE.Box3().setFromObject(model), dimensions = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      const previousDistance = fitDistance;
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      fitDistance = Math.max(dimensions.y / (2 * tangent), dimensions.x / (2 * tangent * camera.aspect)) * 1.15;
      const direction = reset ? new THREE.Vector3(0, .02, initialView === "back" ? -1 : 1).normalize() : camera.position.clone().sub(controls.target).normalize();
      const distance = reset ? fitDistance : camera.position.distanceTo(controls.target) * fitDistance / previousDistance;
      controls.target.copy(center);
      controls.minDistance = fitDistance * .42; controls.maxDistance = fitDistance * 2;
      camera.position.copy(center).addScaledVector(direction, distance); controls.update(); render();
    };
    const updateAngle = () => {
      const normalized = ((Math.round(THREE.MathUtils.radToDeg(controls.getAzimuthalAngle())) % 360) + 360) % 360;
      setAngle(normalized); element.dataset.angle = String(normalized); render();
    };
    const face = (theta: number) => {
      const distance = camera.position.distanceTo(controls.target);
      camera.position.copy(controls.target).add(new THREE.Vector3(Math.sin(theta) * distance, .02, Math.cos(theta) * distance));
      controls.update(); render();
    };
    actions.current = {
      turn: (delta) => face(controls.getAzimuthalAngle() + delta), face,
      zoom: (scale) => {
        const offset = camera.position.clone().sub(controls.target);
        offset.setLength(THREE.MathUtils.clamp(offset.length() * scale, controls.minDistance, controls.maxDistance));
        camera.position.copy(controls.target).add(offset); controls.update(); render();
      },
      reset: () => { fit(true); },
    };
    controls.addEventListener("change", updateAngle);
    const size = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); fit(); render();
    };
    const resize = new ResizeObserver(size); resize.observe(element);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) render(); });
    intersection.observe(element);
    const visibility = () => render(); document.addEventListener("visibilitychange", visibility);
    const contextLost = (event: Event) => { event.preventDefault(); setStatus("error"); setError("Kết nối đồ họa bị gián đoạn. Thử tải lại mô hình hoặc xem thư viện ảnh bên trên."); };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    size();
    (async () => {
      try {
        const response = await fetch(modelUrl, { signal: abort.signal });
        if (!response.ok) throw new Error("model-unavailable");
        const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), "");
        if (disposed) { dispose(gltf.scene); return; }
        let branded = 0;
        gltf.scene.traverse((item) => {
          if (!(item instanceof THREE.Mesh)) return;
          for (const material of Array.isArray(item.material) ? item.material : [item.material]) {
            if (material.name.startsWith("Brand") && (material as THREE.MeshStandardMaterial).map) branded++;
          }
        });
        if (branded !== 2) { dispose(gltf.scene); throw new Error("brand-textures-unavailable"); }
        model = gltf.scene; modelRef.current = model; scene.add(model); paint(); fit(true); setStatus("ready"); updateAngle(); render();
      } catch {
        if (disposed || abort.signal.aborted) return;
        setStatus("error"); setError("Chưa tải được mô hình 360°. Hãy thử lại; ảnh mặt trước và mặt sau vẫn có sẵn.");
      }
    })();
    return () => {
      disposed = true; abort.abort(); actions.current = null; modelRef.current = null; invalidate.current = null;
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", visibility);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      controls.removeEventListener("change", updateAngle); controls.dispose();
      if (model) dispose(model);
      scene.clear(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [modelUrl, name, retry]);
  return (
    <div className="garment-viewer" data-viewer-status={status}>
      <div className="garment-viewer-stage" ref={host} tabIndex={0} aria-label="Điều khiển góc nhìn 360 độ" onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "+", "-", "Home"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "ArrowLeft") actions.current?.turn(-Math.PI / 12);
        if (event.key === "ArrowRight") actions.current?.turn(Math.PI / 12);
        if (event.key === "+") actions.current?.zoom(.85);
        if (event.key === "-") actions.current?.zoom(1.15);
        if (event.key === "Home") actions.current?.reset();
      }} />
      {status === "loading" && <p className="garment-viewer-message" role="status">Đang tải mô hình 360°…</p>}
      {status === "error" && <div className="garment-viewer-message" role="status"><p>{error}</p><button className="text-link" onClick={() => setRetry((n) => n + 1)}>Thử lại</button></div>}
      <div className="garment-viewer-controls" role="group" aria-label="Điều khiển mô hình">
        <button disabled={status !== "ready"} onClick={() => actions.current?.turn(-Math.PI / 8)} aria-label="Xoay sang trái"><RotateCcw size={18} /></button>
        <button disabled={status !== "ready"} onClick={() => actions.current?.face(0)}>Mặt trước</button>
        <button disabled={status !== "ready"} onClick={() => actions.current?.face(Math.PI)}>Mặt sau</button>
        <button disabled={status !== "ready"} onClick={() => actions.current?.turn(Math.PI / 8)} aria-label="Xoay sang phải"><RotateCw size={18} /></button>
        <button disabled={status !== "ready"} onClick={() => actions.current?.zoom(.85)} aria-label="Phóng to mô hình"><ZoomIn size={18} /></button>
        <button disabled={status !== "ready"} onClick={() => actions.current?.zoom(1.15)} aria-label="Thu nhỏ mô hình"><ZoomOut size={18} /></button>
        <button disabled={status !== "ready"} onClick={() => actions.current?.reset()} aria-label="Đặt lại góc nhìn"><RefreshCw size={18} /></button>
      </div>
      <p className="garment-viewer-hint">Kéo hoặc vuốt để xoay · Cuộn/chụm để phóng to · Góc {angle}°</p>
      <p className="garment-viewer-disclosure">Mô phỏng thiết kế 3D. Nếp vải và độ rủ mang tính minh họa.</p>
    </div>
  );
}
