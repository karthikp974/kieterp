/** Optional override e.g. VITE_API_ORIGIN=http://192.168.1.10:4000 — leave unset for normal dev. */
export function resolveApiUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input !== "string" || !input.startsWith("/api")) return input;

  const override = import.meta.env.VITE_API_ORIGIN?.replace(/\/$/, "");
  if (override) return `${override}${input}`;

  // Same-origin /api — on phone this is http://192.168.x.x:5173/api (Vite proxies to backend).
  // Do NOT send the phone to :4000; Windows Firewall usually blocks that port from LAN.
  return input;
}

function isLocalDevHost(hostname: string) {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") return true;
  // Same laptop often opens Vite's "Network" URL (192.168.x.x) — not a phone.
  return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
}

function looksLikeMobileBrowser() {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function networkErrorMessage(error: unknown, context: string) {
  if (!(error instanceof TypeError) || !/fetch|network|load failed/i.test(error.message)) {
    return error instanceof Error ? error.message : context;
  }

  const hostname = typeof window !== "undefined" ? window.location.hostname : "";

  if (looksLikeMobileBrowser() && !isLocalDevHost(hostname)) {
    return `${context} Your phone could not reach the server. Same Wi‑Fi as the PC, open the Network link from npm run lan (port 5173 only), and keep npm run dev running on the PC.`;
  }

  if (isLocalDevHost(hostname)) {
    return `${context} From the project folder run npm run dev and open http://localhost:5173 (Docker Postgres/Redis alone is not enough — the dev server must be running).`;
  }

  return `${context} Network error — run npm run dev on your PC and try again.`;
}
