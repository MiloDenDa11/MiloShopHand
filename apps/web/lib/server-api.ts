import { cache } from "react";

// Request-scoped memoization lets product metadata and HTML share a request.
// No cross-request cache: prices and availability are fetched for each visit.
export const serverApi = cache(async (path: string): Promise<any | undefined> => {
  try {
    const response = await fetch(`${process.env.API_INTERNAL_URL || "http://localhost:4000"}/api/v1${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    // The existing client error/retry flow remains available when API is offline.
    return undefined;
  }
});
