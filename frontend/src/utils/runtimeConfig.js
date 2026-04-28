const DEV_API_BASE = "";
const KNOWN_API_HOST_ALIASES = {
  "13.203.194.93": "https://fm.catalystsolutions.eco",
};

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function mapKnownApiHost(url) {
  const alias = KNOWN_API_HOST_ALIASES[url.hostname];
  if (!alias) return url;

  const mappedUrl = new URL(alias);
  if (url.pathname && url.pathname !== "/") {
    mappedUrl.pathname = `${trimTrailingSlash(mappedUrl.pathname)}${url.pathname}`;
  }
  mappedUrl.search = url.search;
  mappedUrl.hash = url.hash;
  return mappedUrl;
}

function normalizeUrl(value, { preferHttps = false } = {}) {
  if (!value) return "";

  try {
    let url = new URL(value);
    const pageProtocol = typeof window !== "undefined" ? window.location.protocol : "";
    url = mapKnownApiHost(url);

    if ((preferHttps || pageProtocol === "https:") && url.protocol === "http:" && !isLocalHostname(url.hostname)) {
      url.protocol = "https:";
    }

    return trimTrailingSlash(url.toString());
  } catch {
    return trimTrailingSlash(value);
  }
}

export function getApiBaseUrl() {
  const configured = normalizeUrl(import.meta.env.VITE_API_URL || "", { preferHttps: true });
  if (import.meta.env.DEV) return DEV_API_BASE;
  if (configured) return configured;
  return "";
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
