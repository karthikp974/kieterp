function parseContentDispositionFilename(header: string | null, fallback: string) {
  if (!header) return fallback;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].replace(/"/g, ""));
    } catch {
      return utf8[1];
    }
  }
  const basic = /filename="([^"]+)"/i.exec(header);
  return basic?.[1] ?? fallback;
}

/** Exchange the (header-only) access token for a 60s single-use download token. */
async function fetchDownloadToken(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/download-token", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { downloadToken?: string };
    return data.downloadToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Download via same-origin navigation (iframe). Avoids Chrome "Insecure download blocked"
 * that happens with blob: URLs when MIME/extension do not match sniffed content.
 *
 * The long-lived access token is never placed in the URL: we first exchange it (via the
 * Authorization header) for a 60s single-use download token, and that goes in the query.
 */
export async function downloadAuthenticatedExport(accessToken: string, apiPath: string, params: Record<string, string | undefined>) {
  const downloadToken = await fetchDownloadToken(accessToken);
  if (!downloadToken) {
    console.error("Could not obtain a download token; export aborted.");
    return;
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  search.set("accessToken", downloadToken);

  const url = `${apiPath}?${search.toString()}`;
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.setAttribute("aria-hidden", "true");
  iframe.src = url;
  document.body.appendChild(iframe);
  window.setTimeout(() => iframe.remove(), 120_000);
}

/** Fetch + save picker fallback when iframe download is unavailable. */
export async function downloadAuthenticatedExportViaFetch(
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  apiPath: string,
  params: Record<string, string | undefined>,
  fallbackFilename: string
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const response = await authFetch(`${apiPath}?${search.toString()}`);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new Error(message || "Export failed");
  }

  const filename = parseContentDispositionFilename(response.headers.get("Content-Disposition"), fallbackFilename);
  const contentType = response.headers.get("Content-Type")?.split(";")[0]?.trim() ?? "application/octet-stream";
  const blob = new Blob([await response.arrayBuffer()], { type: contentType });

  if ("showSaveFilePicker" in window) {
    try {
      const ext = filename.includes(".") ? `.${filename.split(".").pop()}` : "";
      const picker = window.showSaveFilePicker as (options: {
        suggestedName: string;
        types?: { description: string; accept: Record<string, string[]> }[];
      }) => Promise<FileSystemFileHandle>;
      const handle = await picker({
        suggestedName: filename,
        ...(ext ? { types: [{ description: "Export", accept: { [contentType]: [ext] } }] } : {})
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      if ((error as DOMException).name === "AbortError") return;
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}
