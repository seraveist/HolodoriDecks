const THEME_STORAGE_KEY = "holodori-decksim:theme";
const DEFAULT_THEME = "system";
const SUPPORTED_THEMES = new Set(["system", "light", "dark"]);

let mediaListenerBound = false;

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function mediaQuery() {
  return typeof globalThis.matchMedia === "function"
    ? globalThis.matchMedia("(prefers-color-scheme: dark)")
    : null;
}

function normalizeTheme(value) {
  return SUPPORTED_THEMES.has(value) ? value : DEFAULT_THEME;
}

function resolvedTheme(preference) {
  if (preference === "dark" || preference === "light") return preference;
  return mediaQuery()?.matches ? "dark" : "light";
}

function applyTheme(preference) {
  const normalized = normalizeTheme(preference);
  const resolved = resolvedTheme(normalized);
  const root = globalThis.document?.documentElement;
  if (root) {
    root.dataset.themePreference = normalized;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
  }
  const themeColor = globalThis.document?.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute("content", resolved === "dark" ? "#0f1420" : "#f7f9fc");
  return normalized;
}

export function getThemePreference() {
  const saved = storage()?.getItem(THEME_STORAGE_KEY);
  return normalizeTheme(saved);
}

export function setThemePreference(preference) {
  const normalized = normalizeTheme(preference);
  try {
    storage()?.setItem(THEME_STORAGE_KEY, normalized);
  } catch {
    // Storage is optional; the current page can still apply the theme.
  }
  applyTheme(normalized);
  return normalized;
}

export function initTheme() {
  const preference = applyTheme(getThemePreference());
  const query = mediaQuery();
  if (query && !mediaListenerBound) {
    query.addEventListener?.("change", () => {
      if (getThemePreference() === "system") applyTheme("system");
    });
    mediaListenerBound = true;
  }
  return preference;
}
