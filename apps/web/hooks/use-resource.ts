"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "../components/client";

type PendingResource = { promise: Promise<any>; controller: AbortController; readers: number };
const pending = new Map<string, PendingResource>();

// Share only requests that are currently in flight. Product price/availability
// are fetched again on navigation; this does not introduce a stale result cache.
function subscribe(path: string) {
  let request = pending.get(path);
  if (!request) {
    const controller = new AbortController();
    const promise = api(path, { signal: controller.signal });
    request = { controller, promise, readers: 0 };
    const entry = request;
    pending.set(path, entry);
    void promise.finally(() => {
      if (pending.get(path) === entry) pending.delete(path);
    }).catch(() => {});
  }
  request.readers++;
  const entry = request;
  return {
    promise: entry.promise,
    release() {
      entry.readers--;
      // React StrictMode re-subscribes immediately after its probe cleanup.
      queueMicrotask(() => {
        if (!entry.readers && pending.get(path) === entry) {
          pending.delete(path);
          entry.controller.abort();
        }
      });
    },
  };
}
export function useResource(path: string, initialData?: any) {
  const initialPath = useRef(path);
  const navigated = useRef(false);
  const [data, setData] = useState<any>(initialData ?? null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(initialData === undefined),
    [settledPath, setSettledPath] = useState(initialData === undefined ? "" : path),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (path !== initialPath.current) navigated.current = true;
    // Server-fetched data is already fresh. Do not repeat it after hydration.
    if (initialData !== undefined && !navigated.current && attempt === 0) return;
    let active = true;
    const request = subscribe(path);
    setLoading(true);
    setError("");
    request.promise
      .then((value) => { if (active) setData(value); })
      .catch((e) => {
        if (active && e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (active) { setSettledPath(path); setLoading(false); }
      });
    return () => { active = false; request.release(); };
  }, [path, attempt]);
  return { data, error, loading: loading || settledPath !== path, retry: () => setAttempt((n) => n + 1) };
}
