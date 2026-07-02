#!/usr/bin/env node
/**
 * Generate ERP_MASTER_PASSWORD_HASH and patch the repo-root .env for Docker Compose.
 * Docker Compose treats $ as variable substitution in .env — bcrypt hashes must use $$ per $.
 *
 * Usage (local dev with Node installed):
 *   node scripts/set-master-password-env.mjs "Karhan@974"
 *
 * EC2 / Docker-only hosts (no Node on Ubuntu) — use the shell script instead:
 *   sh scripts/set-master-password-env.sh "Karhan@974"
 *   docker compose up -d backend
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(repoRoot, ".env");
const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/set-master-password-env.mjs "your-master-password"');
  process.exit(1);
}

const hashScript = join(repoRoot, "apps/backend/scripts/hash-master-password.cjs");
const hashResult = spawnSync(process.execPath, [hashScript, password], {
  cwd: repoRoot,
  encoding: "utf8"
});

if (hashResult.status !== 0) {
  console.error(hashResult.stderr || hashResult.stdout || "Failed to generate bcrypt hash.");
  process.exit(hashResult.status ?? 1);
}

const hash = hashResult.stdout.trim();
if (!hash.startsWith("$2")) {
  console.error("Unexpected hash output:", hash);
  process.exit(1);
}

/** Escape $ for Docker Compose .env (passes single $ into containers). */
const composeEscaped = hash.replace(/\$/g, "$$$$");

if (!existsSync(envPath)) {
  console.error(`Missing ${envPath} — copy .env.example to .env first.`);
  process.exit(1);
}

const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
const filtered = lines.filter((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return true;
  const key = trimmed.split("=")[0]?.trim();
  return key !== "ERP_MASTER_PASSWORD" && key !== "ERP_MASTER_PASSWORD_HASH";
});

const insertAt =
  filtered.findIndex((line) => line.trimStart().startsWith("JWT_ACCESS_SECRET=")) + 1 || filtered.length;

filtered.splice(insertAt, 0, `# Master portal password hash — login as any user with this password. Set via: node scripts/set-master-password-env.mjs`);
filtered.splice(insertAt + 1, 0, `ERP_MASTER_PASSWORD_HASH="${composeEscaped}"`);

writeFileSync(envPath, `${filtered.join("\n").replace(/\n?$/, "\n")}`, "utf8");

console.log("Updated .env:");
console.log("  - removed ERP_MASTER_PASSWORD (wrong key) if present");
console.log(`  - set ERP_MASTER_PASSWORD_HASH with Docker-safe escaping (${hash.length} char hash)`);
console.log("");
console.log("Next:");
console.log("  docker compose up -d backend");
console.log('  curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" \\');
console.log('    -d \'{"identifier":"admin","password":"YOUR_PASSWORD"}\'');
