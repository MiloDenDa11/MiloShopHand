"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, ContactShadows } from "@react-three/drei";
import {
  useMemo,
  useRef,
  useEffect,
  useState,
  Component,
  ReactNode,
} from "react";
import * as THREE from "three";
function Shirt() {
  const ref = useRef<THREE.Group>(null);
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.38, 0.8);
    s.lineTo(-0.85, 0.54);
    s.lineTo(-1.12, 0.05);
    s.lineTo(-0.7, -0.18);
    s.lineTo(-0.48, 0.13);
    s.lineTo(-0.5, -0.95);
    s.quadraticCurveTo(0, -1.07, 0.5, -0.95);
    s.lineTo(0.48, 0.13);
    s.lineTo(0.7, -0.18);
    s.lineTo(1.12, 0.05);
    s.lineTo(0.85, 0.54);
    s.lineTo(0.38, 0.8);
    s.quadraticCurveTo(0, 0.46, -0.38, 0.8);
    return s;
  }, []);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = THREE.MathUtils.lerp(
        ref.current.rotation.y,
        state.pointer.x * 0.3 - 0.2,
        0.035,
      );
      ref.current.rotation.x = state.pointer.y * 0.1;
    }
  });
  return (
    <Float speed={1.8} rotationIntensity={0.08} floatIntensity={0.25}>
      <group ref={ref} rotation={[0.06, -0.2, -0.12]}>
        <mesh castShadow>
          <extrudeGeometry
            args={[
              shape,
              {
                depth: 0.18,
                bevelEnabled: true,
                bevelSize: 0.09,
                bevelThickness: 0.09,
                bevelSegments: 5,
                steps: 1,
              },
            ]}
          />
          <meshStandardMaterial color="#b7abd5" roughness={0.72} />
        </mesh>
        <mesh position={[0.15, 0.19, 0.29]}>
          <boxGeometry args={[0.31, 0.08, 0.02]} />
          <meshStandardMaterial color="#d5ed8e" />
        </mesh>
        <mesh position={[-0.04, -0.04, 0.29]}>
          <boxGeometry args={[0.65, 0.04, 0.02]} />
          <meshStandardMaterial color="#3c3940" />
        </mesh>
      </group>
    </Float>
  );
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export default function Hero3D() {
  const [active, setActive] = useState(false),
    [supported, setSupported] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const canvas = document.createElement("canvas");
    const low =
      (navigator as any).deviceMemory <= 4 ||
      navigator.hardwareConcurrency <= 2;
    const reduceQuery = matchMedia("(prefers-reduced-motion: reduce)");
    const reduce = reduceQuery.matches;
    try {
      if (!low && !reduce) setSupported(!!canvas.getContext("webgl2"));
    } catch {}
    const observer = new IntersectionObserver(([entry]) =>
      setActive(
        entry.isIntersecting && !document.hidden && !reduceQuery.matches,
      ),
    );
    if (ref.current) observer.observe(ref.current);
    const visibility = () =>
      setActive(
        !document.hidden &&
          !!ref.current &&
          ref.current.getBoundingClientRect().bottom > 0 &&
          ref.current.getBoundingClientRect().top < innerHeight &&
          !reduceQuery.matches,
      );
    document.addEventListener("visibilitychange", visibility);
    reduceQuery.addEventListener("change", visibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      reduceQuery.removeEventListener("change", visibility);
    };
  }, []);
  return (
    <div
      ref={ref}
      className="hero-canvas"
      aria-label="Áo 3D minh họa thương hiệu"
    >
      {supported && (
        <Boundary>
          <Canvas
            dpr={[1, 1.5]}
            camera={{ position: [0, 0, 4.2], fov: 40 }}
            frameloop={active ? "always" : "never"}
            gl={{ antialias: true, powerPreference: "low-power", alpha: true }}
            onCreated={({ gl }) => {
              gl.setClearAlpha(0);
            }}
          >
            <ambientLight intensity={2} />
            <directionalLight position={[3, 4, 5]} intensity={3} />
            <Shirt />
          </Canvas>
        </Boundary>
      )}
    </div>
  );
}
