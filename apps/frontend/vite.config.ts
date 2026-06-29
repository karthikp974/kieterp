import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

function normalizeChunkId(id: string): string {
  return id.split("\\").join("/");
}

/** Hostnames allowed for `vite preview` (Docker/EC2/domain access). */
function previewAllowedHosts(env: Record<string, string>): string[] | boolean {
  if (env.PREVIEW_ALLOW_ALL_HOSTS === "true") {
    return true;
  }
  const hosts = new Set(["localhost", "127.0.0.1"]);
  for (const entry of (env.PREVIEW_ALLOWED_HOSTS ?? "").split(",")) {
    const host = entry.trim();
    if (host) hosts.add(host);
  }
  const publicUrl = env.PUBLIC_APP_URL?.trim();
  if (publicUrl) {
    try {
      hosts.add(new URL(publicUrl).hostname);
    } catch {
      /* ignore invalid PUBLIC_APP_URL */
    }
  }
  return [...hosts];
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd() + "/../..", "");
  const frontendPort = Number(env.FRONTEND_PORT) || 5173;
  const apiTarget = env.DEV_API_PROXY_TARGET || `http://127.0.0.1:${env.BACKEND_PORT || "4000"}`;

  return {
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"]
  },
  server: {
    host: "0.0.0.0",
    port: frontendPort,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        timeout: 300_000,
        proxyTimeout: 300_000
      }
    }
  },
  preview: {
    host: "0.0.0.0",
    port: frontendPort,
    strictPort: true,
    allowedHosts: previewAllowedHosts(env),
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        timeout: 300_000,
        proxyTimeout: 300_000
      }
    }
  },
  build: {
    /** Skips gzip-size pass on assets; cuts `vite:build-html` time and avoids noisy Rolldown plugin-timing hints on fast builds. */
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const norm = normalizeChunkId(id);
          if (norm.includes("/node_modules/")) {
            if (norm.includes("lucide-react")) return "lucide";
            if (norm.includes("react-dom")) return "react-dom";
            if (norm.includes("react-router")) return "react-router";
            if (norm.includes("/react/")) return "react";
            return "vendor";
          }
          /** Feature-level splits: stable caching for heavy admin modules (low-RAM devices load less per navigation). */
          if (norm.includes("/src/promotions/")) return "erp-promotion";
          if (norm.includes("/src/finance/")) return "erp-finance";
          if (norm.includes("/src/students/")) return "erp-students";
          if (norm.includes("/src/teachers/")) return "erp-teachers";
          if (norm.includes("/src/reports/") || norm.includes("/src/results/")) return "erp-reports";
          if (norm.includes("/src/timetable/") || norm.includes("/src/attendance/")) return "erp-operations";
          if (norm.includes("/src/portals/") || norm.includes("/src/student-portal/")) return "erp-portals";
          if (
            norm.includes("/src/department-branch/") ||
            norm.includes("/src/classes-sections/") ||
            norm.includes("/src/batches/") ||
            norm.includes("/src/subjects/") ||
            norm.includes("/src/syllabus/")
          ) {
            return "erp-structure";
          }
          return undefined;
        }
      }
    }
  }
};
});
