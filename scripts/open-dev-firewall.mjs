#!/usr/bin/env node
/**
 * Allow inbound TCP on dev ports so phones on the same Wi‑Fi can reach Vite (5173).
 * Run once from an elevated (Admin) PowerShell: npm run dev:firewall
 */
import { execSync } from "node:child_process";
import { platform } from "node:os";

const frontendPort = process.env.FRONTEND_PORT || "5173";

if (platform() !== "win32") {
  console.log("dev:firewall is only needed on Windows. On Linux/macOS, ensure port", frontendPort, "is reachable on LAN.");
  process.exit(0);
}

const rules = [{ name: "College ERP Dev Frontend", port: frontendPort }];

for (const { name, port } of rules) {
  try {
    execSync(
      `netsh advfirewall firewall add rule name="${name}" dir=in action=allow protocol=TCP localport=${port}`,
      { stdio: "inherit" }
    );
    console.log(`Allowed inbound TCP ${port} (${name}).`);
  } catch {
    console.error(`Could not add firewall rule for port ${port}. Re-run PowerShell as Administrator.`);
    process.exit(1);
  }
}

console.log("\nPhone URL: run npm run lan and open the Network address on the same Wi‑Fi.\n");
