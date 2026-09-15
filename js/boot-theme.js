// Apply the theme before styles paint, without requiring inline JavaScript.
(() => {
  try {
    const key = "holodori-decksim:theme";
    const saved = localStorage.getItem(key);
    const theme = saved === "dark" || saved === "light"
      ? saved
      : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    localStorage.setItem(key, theme);
    document.documentElement.dataset.themePreference = theme;
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.themePreference = "light";
    document.documentElement.dataset.theme = "light";
  }
})();
