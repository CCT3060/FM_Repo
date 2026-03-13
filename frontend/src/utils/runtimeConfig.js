const DEV_API_BASE = "http://localhost:4000";

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function normalizeUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(value);
    const pageProtocol = typeof window !== "undefined" ? window.location.protocol : "";

    if (pageProtocol === "https:" && url.protocol === "http:" && !isLocalHostname(url.hostname)) {
      url.protocol = "https:";
    }

    return trimTrailingSlash(url.toString());
  } catch {
    return trimTrailingSlash(value);
  }
}

export function getApiBaseUrl() {
  const configured = normalizeUrl(import.meta.env.VITE_API_URL || "");
  if (configured) return configured;
  return import.meta.env.DEV ? DEV_API_BASE : "";
}

export function buildApiUrl(path) {
  const base = getApiBaseUrl();
  return `${base}${path}`;
}

export function getPublicAppUrl() {
  const configured = normalizeUrl(import.meta.env.VITE_PUBLIC_APP_URL || "");
  if (configured) return configured;
  if (typeof window !== "undefined") return trimTrailingSlash(window.location.origin);
  return "";
}
