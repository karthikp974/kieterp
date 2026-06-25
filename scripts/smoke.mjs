#!/usr/bin/env node
/**
 * Quick smoke check: backend health + optional frontend.
 * Usage: node scripts/smoke.mjs
 */
const apiBase = process.env.SMOKE_API_URL ?? "http://localhost:4000/api";

async function check(path) {
  const url = `${apiBase}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json().catch(() => ({}));
}

async function main() {
  await check("/health");
  console.log("smoke: backend health OK");
}

main().catch((err) => {
  console.error("smoke failed:", err.message);
  process.exit(1);
});
