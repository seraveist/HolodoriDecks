const THEME_STORAGE_KEY = "holodori-decksim:theme";
const SUPPORTED_THEMES = new Set(["light", "dark"]);

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function systemTheme() {
  return typeof globalThis.matchMedia === "function"
    && globalThis.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function normalizeTheme(value) {
  return SUPPORTED_THEMES.has(value) ? value : systemTheme();
}

function applyTheme(theme) {
  const normalized = normalizeTheme(theme);
  const root = globalThis.document?.documentElement;
  if (root) {
    root.dataset.themePreference = normalized;
    root.dataset.theme = normalized;
    root.style.colorScheme = normalized;
  }
  const themeColor = globalThis.document?.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute("content", normalized === "dark" ? "#0f1420" : "#f7f9fc");
  return normalized;
}

function persistTheme(theme) {
  try {
    storage()?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage is optional; the current page can still apply the theme.
  }
}

export function getThemePreference() {
  return normalizeTheme(storage()?.getItem(THEME_STORAGE_KEY));
}

export function setThemePreference(theme) {
  const normalized = normalizeTheme(theme);
  persistTheme(normalized);
  return applyTheme(normalized);
}

export function toggleTheme() {
  return setThemePreference(getThemePreference() === "dark" ? "light" : "dark");
}

export function initTheme() {
  const normalized = getThemePreference();
  persistTheme(normalized);
  return applyTheme(normalized);
}
