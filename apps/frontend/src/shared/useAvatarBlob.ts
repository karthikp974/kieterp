import { useEffect, useState } from "react";

const blobCache = new Map<string, string>();

type AuthFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Loads a protected avatar URL once and caches the object URL by path.
 */
export function useAvatarBlob(avatarUrl: string | null | undefined, authFetch?: AuthFetch) {
  const [blobUrl, setBlobUrl] = useState<string | null>(() => (avatarUrl ? blobCache.get(avatarUrl) ?? null : null));

  useEffect(() => {
    if (!avatarUrl || !authFetch) {
      setBlobUrl(null);
      return;
    }

    const cached = blobCache.get(avatarUrl);
    if (cached) {
      setBlobUrl(cached);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;

    void (async () => {
      try {
        const res = await authFetch(avatarUrl);
        if (!res.ok || !active) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        blobCache.set(avatarUrl, objectUrl);
        if (active) setBlobUrl(objectUrl);
      } catch {
        if (active) setBlobUrl(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [authFetch, avatarUrl]);

  return blobUrl;
}

/** Clear cached blob when user uploads a new photo (cache-busting query changes path). */
export function revokeAvatarBlobCache(avatarUrl: string) {
  const existing = blobCache.get(avatarUrl);
  if (existing) {
    URL.revokeObjectURL(existing);
    blobCache.delete(avatarUrl);
  }
}
