import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const DEV_API_FALLBACK = "http://localhost:4000";
const KNOWN_API_HOST_ALIASES = {
  "13.203.194.93": "https://fm.catalystsolutions.eco",
};

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isIpAddress(hostname) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function normalizeProxyTarget(value) {
  if (!value) return DEV_API_FALLBACK;

  try {
    let url = new URL(value);
    const alias = KNOWN_API_HOST_ALIASES[url.hostname];

    if (alias) {
      const mappedUrl = new URL(alias);
      if (url.pathname && url.pathname !== "/") {
        mappedUrl.pathname = `${trimTrailingSlash(mappedUrl.pathname)}${url.pathname}`;
      }
      mappedUrl.search = url.search;
      mappedUrl.hash = url.hash;
      url = mappedUrl;
    }

    if (url.protocol === "http:" && !isLocalHostname(url.hostname) && !isIpAddress(url.hostname)) {
      url.protocol = "https:";
    }

    return trimTrailingSlash(url.toString());
  } catch {
    return trimTrailingSlash(value);
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = normalizeProxyTarget(env.VITE_API_URL);

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/health": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/uploads": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
