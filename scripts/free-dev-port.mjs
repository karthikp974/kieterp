#!/usr/bin/env node
/**
 * Frees the backend dev port before starting npm run dev.
 * Prevents EADDRINUSE + stale backends that cause "Cannot GET /api/..." toasts.
 */
import { execSync } from "node:child_process";
import { platform } from "node:os";

const backendPort = Number(process.env.BACKEND_PORT || 4000);
const frontendPort = Number(process.env.FRONTEND_PORT || 5173);

function freePortWindows(port) {
  let out = "";
  try {
    out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
  } catch {
    return;
  }

  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts.at(-1);
    if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
  }

  for (const pid of pids) {
    console.log(`[free-dev-port] Stopping PID ${pid} on port ${port}`);
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "inherit" });
    } catch {
      console.warn(`[free-dev-port] Could not stop PID ${pid}`);
    }
  }
}

function freePortUnix(port) {
  try {
    execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: "inherit", shell: true });
  } catch {
    // Port already free.
  }
}

function freePort(port) {
  if (platform() === "win32") freePortWindows(port);
  else freePortUnix(port);
}

freePort(backendPort);
freePort(frontendPort);
