/** Parse Nest/Express JSON error bodies into a user-facing message. */
export async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { message?: string | string[]; error?: string }
    | null;
  if (!body) return fallback;
  const raw = body.message;
  if (Array.isArray(raw) && raw.length) return raw.map((item) => String(item)).join(" ");
  if (typeof raw === "string" && raw.trim()) return raw;
  if (typeof body.error === "string" && body.error.trim()) return body.error;
  return fallback;
}
