"use client";
import { useEffect } from "react";

// A streamed section may appear after the browser's native fragment lookup.
// Scroll once the section and local fonts exist, without changing the URL.
export function useEditorialFragment(ids: readonly string[], ready = true) {
  const allowed = ids.join("|");
  useEffect(() => {
    if (!ready || !allowed) return;
    let active = true, firstFrame = 0, secondFrame = 0;
    const scroll = () => {
      const id = window.location.hash.slice(1);
      if (active && allowed.split("|").includes(id)) document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "instant" });
    };
    const schedule = () => {
      cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame);
      firstFrame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(scroll); });
    };
    void document.fonts.ready.then(() => { if (active) schedule(); });
    window.addEventListener("hashchange", schedule);
    window.addEventListener("load", schedule, { once: true });
    return () => { active = false; cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); window.removeEventListener("hashchange", schedule); window.removeEventListener("load", schedule); };
  }, [allowed, ready]);
}
