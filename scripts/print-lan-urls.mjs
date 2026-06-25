#!/usr/bin/env node
/**
 * Prints URLs to open the ERP on this machine and on your phone (same Wi‑Fi).
 */
import os from "node:os";

const frontendPort = process.env.FRONTEND_PORT ?? "5173";
const backendPort = process.env.BACKEND_PORT ?? "4000";

function lanAddresses() {
  const ips = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      ips.push(entry.address);
    }
  }
  return [...new Set(ips)];
}

const ips = lanAddresses();
console.log("\nCollege ERP — open in browser\n");
console.log(`  This PC:     http://localhost:${frontendPort}/`);
if (ips.length) {
  console.log("\n  Phone (same Wi‑Fi):");
  for (const ip of ips) {
    console.log(`    http://${ip}:${frontendPort}/`);
  }
} else {
  console.log("\n  No LAN IPv4 found — connect Wi‑Fi/Ethernet, then run again.");
}
console.log(`\n  API (PC only):   http://localhost:${backendPort}/api`);
console.log("  Phone uses port", frontendPort, "only — /api is proxied by Vite on your PC.");
console.log("  If upload fails on phone, run as Admin: npm run dev:firewall\n");
