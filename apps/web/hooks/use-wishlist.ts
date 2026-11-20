"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, send } from "../components/client";

type Snapshot = { owner?: string; ids: string[]; loaded: boolean };

// One account-scoped snapshot for every card. Never persist private account
// state in localStorage; the server remains authoritative after each login.
export function useWishlist(userId?: string) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ ids: [], loaded: false });
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const currentOwner = useRef(userId);
  currentOwner.current = userId;
  const latest = useRef(snapshot);
  const pending = useRef(new Set<string>());
  const request = useRef<{ owner: string; promise: Promise<string[]> } | null>(null);

  const loadWishlist = useCallback(async () => {
    if (!userId) return [];
    if (request.current?.owner === userId) return request.current.promise;
    const promise = api("/me/wishlist").then((rows) => {
      const ids = rows.map((row: { productId: string }) => row.productId);
      if (currentOwner.current === userId) {
        latest.current = { owner: userId, ids, loaded: true };
        setSnapshot(latest.current);
      }
      return ids as string[];
    });
    request.current = { owner: userId, promise };
    try {
      return await promise;
    } finally {
      if (request.current?.promise === promise) request.current = null;
    }
  }, [userId]);

  useEffect(() => {
    if (userId) void loadWishlist().catch(() => {});
    else {
      latest.current = { ids: [], loaded: false };
      setSnapshot(latest.current);
    }
  }, [userId, loadWishlist]);

  async function toggleWishlist(productId: string): Promise<boolean | undefined> {
    if (!userId) throw new Error("Đăng nhập để lưu sản phẩm yêu thích.");
    const key = `${userId}:${productId}`;
    if (pending.current.has(key)) return;
    pending.current.add(key);
    setPendingKeys([...pending.current]);
    try {
      const ids = latest.current.owner === userId && latest.current.loaded
        ? latest.current.ids
        : await loadWishlist();
      if (currentOwner.current !== userId) return;
      const saved = ids.includes(productId);
      await send(`/me/wishlist/${encodeURIComponent(productId)}`, {}, saved ? "DELETE" : "POST");
      if (currentOwner.current !== userId) return;
      const next = new Set(latest.current.owner === userId ? latest.current.ids : ids);
      if (saved) next.delete(productId);
      else next.add(productId);
      latest.current = { owner: userId, ids: [...next], loaded: true };
      setSnapshot(latest.current);
      return !saved;
    } finally {
      pending.current.delete(key);
      setPendingKeys([...pending.current]);
    }
  }

  return {
    wishlistIds: snapshot.owner === userId ? snapshot.ids : [],
    wishlistPending: pendingKeys.filter((key) => key.startsWith(`${userId}:`)).map((key) => key.slice(`${userId}:`.length)),
    toggleWishlist,
  };
}
