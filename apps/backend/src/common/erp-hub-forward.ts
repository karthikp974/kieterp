/**
 * Forward ERP activity to WorkflowTech Activity Hub (wftact).
 * Set WFTACT_INGEST_URL, WFTACT_INGEST_KEY, and WFTACT_SITE on the ERP backend.
 */
export async function forwardActivityToHub(input: {
  kind: "LOGIN" | "PAGE_VIEW" | "HEARTBEAT" | "LOGOUT";
  userLabel?: string | null;
  portal?: string | null;
  path?: string | null;
  meta?: Record<string, unknown>;
}) {
  const url = process.env.WFTACT_INGEST_URL;
  const key = process.env.WFTACT_INGEST_KEY;
  const site = process.env.WFTACT_SITE;
  if (!url || !key || !site) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wftact-key": key
      },
      body: JSON.stringify({
        site,
        kind: input.kind,
        user_label: input.userLabel ?? undefined,
        portal: input.portal ?? undefined,
        path: input.path ?? undefined,
        meta: input.meta ?? {},
        at: new Date().toISOString()
      })
    });
  } catch {
    // Non-blocking — never break ERP if hub is down
  }
}
