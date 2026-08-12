import { readFile, writeFile } from "node:fs/promises";

async function edit(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after === before) {
    console.log(`[theme-refactor] unchanged ${path}`);
    return false;
  }
  await writeFile(path, after, "utf8");
  console.log(`[theme-refactor] updated ${path}`);
  return true;
}

function replaceAll(text, search, replacement, label = search) {
  if (!text.includes(search)) {
    if (text.includes(replacement)) return text;
    throw new Error(`Expected CSS fragment not found: ${label}`);
  }
  return text.split(search).join(replacement);
}

function replaceOnce(text, search, replacement, label = search) {
  if (!text.includes(search)) {
    if (text.includes(replacement)) return text;
    throw new Error(`Expected CSS fragment not found: ${label}`);
  }
  return text.replace(search, replacement);
}

await edit("css/tokens.css", (source) => {
  let text = source;
  if (!text.includes("--ink-900:")) text = text.replace("  --ink-950: #162034;\n", "  --ink-950: #162034;\n  --ink-900: #202c42;\n");
  if (!text.includes("--ink-700:")) text = text.replace("  --ink-800: #2c3850;\n", "  --ink-800: #2c3850;\n  --ink-700: #45546d;\n");
  if (!text.includes("--surface-inverse:")) text = text.replace("  --surface-blue: #f1f7ff;\n", "  --surface-blue: #f1f7ff;\n  --surface-inverse: #162034;\n  --ink-inverse: #ffffff;\n");
  if (!text.includes("--brand-line:")) text = text.replace("  --brand-soft: #eaf0ff;\n", "  --brand-soft: #eaf0ff;\n  --brand-line: #d7e3ff;\n  --brand-line-strong: #9fc0ff;\n");
  if (!text.includes("--accent-ink:")) text = text.replace("  --accent: #17a8a1;\n", "  --accent: #17a8a1;\n  --accent-ink: #087e78;\n");
  if (!text.includes("--accent-line:")) text = text.replace("  --accent-soft: #e7f8f6;\n", "  --accent-soft: #e7f8f6;\n  --accent-line: #b9e3d8;\n");
  if (!text.includes("--warning-ink:")) text = text.replace("  --warning: #f3a533;\n", "  --warning: #f3a533;\n  --warning-ink: #b06a0a;\n");
  if (!text.includes("--danger-soft:")) text = text.replace("  --danger: #d94d67;\n", "  --danger: #d94d67;\n  --danger-soft: #fff0f1;\n  --danger-line: #e49a9f;\n");
  return text;
});

await edit("css/base.css", (source) => {
  let text = source;
  text = replaceOnce(text,
    "  background: var(--ink-950);\n  color: #fff;\n  transform: translateY(-160%);",
    "  background: var(--surface-inverse);\n  color: var(--ink-inverse);\n  transform: translateY(-160%);",
    "skip-link inverse surface");
  text = replaceOnce(text,
    "  background: #fff;\n  color: var(--ink-950);\n  box-shadow: var(--shadow-sm);",
    "  background: var(--surface);\n  color: var(--ink-950);\n  box-shadow: var(--shadow-sm);",
    "language picker surface");
  return text;
});

await edit("css/components.css", (source) => {
  let text = source;
  const replacements = [
    ["background-color: #fff;", "background-color: var(--surface);"],
    ["background: #fff;", "background: var(--surface);"],
    ["background: #f8faff;", "background: var(--surface-soft);"],
    ["background: #fbfcff;", "background: var(--surface-soft);"],
    ["background: #f5f8ff;", "background: var(--surface-blue);"],
    ["background: #edf3ff;", "background: var(--brand-soft);"],
    ["background: #eef1f6;", "background: var(--surface-soft);"],
    ["background: #f9fbfe;", "background: var(--surface-soft);"],
    ["background: #e8f7f5;", "background: var(--accent-soft);"],
    ["background: #fff0f1;", "background: var(--danger-soft);"],
    ["background-color: #f1f3f7;", "background-color: var(--surface-soft);"],
    ["color: #087e78;", "color: var(--accent-ink);"],
    ["color: #b06a0a;", "color: var(--warning-ink);"],
    ["color: #bbc5d4;", "color: var(--ink-500);"],
    ["border-color: #aeb9ca;", "border-color: var(--line-strong);"],
    ["#d7e3ff", "var(--brand-line)"],
    ["#cfdbf7", "var(--brand-line)"],
    ["#9fc0ff", "var(--brand-line-strong)"],
    ["#b9e3d8", "var(--accent-line)"],
    ["#edf0f5", "var(--line)"],
    ["#aac0fa", "var(--brand-line-strong)"],
    ["#9bb2ee", "var(--brand-line-strong)"],
    ["#dfe4ec", "var(--line)"],
    ["border: 2px solid #d8dfeb;", "border: 2px solid var(--line);"],
    ["border-color: #86a5f4;", "border-color: var(--brand);"],
    ["border-color: #9db3ef;", "border-color: var(--brand);"],
    ["border-color: #9edbd5;", "border-color: var(--accent);"],
    ["border: 1px dashed #bcc7d8;", "border: 1px dashed var(--line-strong);"],
    ["background: linear-gradient(155deg, #fbfcff, #f3f6fb);", "background: linear-gradient(155deg, var(--surface), var(--surface-soft));"],
    ["background: var(--ink-950);", "background: var(--surface-inverse);"],
    ["border: 1px solid #ccd5e3;", "border: 1px solid var(--line-strong);"],
    ["background: linear-gradient(150deg, #e9edf4, #dfe6f0);", "background: linear-gradient(150deg, var(--surface-soft), var(--line));"],
  ];
  for (const [from, to] of replacements) text = replaceAll(text, from, to);
  text = replaceOnce(text,
    "background:\n    linear-gradient(180deg, rgba(246, 249, 255, 0.68), #fff 230px),\n    #fff;",
    "background:\n    linear-gradient(180deg, var(--surface-soft), var(--surface) 230px),\n    var(--surface);",
    "result panel background");
  return text;
});

await edit("css/owned.css", (source) => {
  let text = source;
  text = replaceAll(text, "background: #fff;", "background: var(--surface);");
  text = replaceAll(text, "background: #f8faff;", "background: var(--surface-soft);");
  text = replaceAll(text, "border-color: #a8bbef;", "border-color: var(--brand);");
  return text;
});

await edit("css/modal.css", (source) => {
  let text = source;
  text = replaceAll(text, "background: #fff;", "background: var(--surface);");
  text = replaceAll(text, "background: #fafbfd;", "background: var(--surface-soft);");
  text = replaceAll(text, "background: #f7f9fc;", "background: var(--surface-soft);");
  text = replaceAll(text, "background: #f8faff;", "background: var(--surface-soft);");
  text = replaceOnce(text,
    "    #fff;\n  font-size: 13px;",
    "    var(--surface);\n  font-size: 13px;",
    "modal search input background");
  text = replaceAll(text, "border: 1px solid rgba(255,255,255,0.6);", "border: 1px solid var(--line);");
  text = replaceAll(text, "#b9c9f5", "var(--brand-line)");
  return text;
});

await edit("css/tweaks.css", (source) => {
  let text = source;
  text = replaceAll(text, "border-color: #e49a9f;", "border-color: var(--danger-line);");
  text = replaceAll(text, "background: #fff5f6;", "background: var(--danger-soft);");
  const iconState = `html[data-theme="dark"] .theme-toggle-icon-moon {\n  display: none;\n}\n\nhtml[data-theme="dark"] .theme-toggle-icon-sun {\n  display: block;\n}\n\n`;
  if (text.includes(iconState)) text = text.replace(iconState, "");
  return text;
});

const darkTheme = `html[data-theme="dark"] {\n  color-scheme: dark;\n  --ink-950: #f2f5fb;\n  --ink-900: #e9eef7;\n  --ink-800: #dfe5f0;\n  --ink-700: #c4ccda;\n  --ink-650: #aeb8ca;\n  --ink-500: #8995aa;\n  --line: #30394a;\n  --line-strong: #414b5f;\n  --surface: #171d29;\n  --surface-soft: #0f1420;\n  --surface-blue: #16223a;\n  --surface-inverse: #0b1018;\n  --ink-inverse: #ffffff;\n  --brand: #6f94ff;\n  --brand-dark: #90abff;\n  --brand-soft: #1b2b50;\n  --brand-line: #314a7c;\n  --brand-line-strong: #5876bf;\n  --accent: #37c5bd;\n  --accent-ink: #77d9d3;\n  --accent-soft: #153633;\n  --accent-line: #2d716b;\n  --warning: #f4b554;\n  --warning-ink: #f4b554;\n  --danger: #ff718a;\n  --danger-soft: #351c26;\n  --danger-line: #a85468;\n  --shadow-sm: 0 8px 22px rgba(0, 0, 0, 0.2);\n  --shadow-md: 0 18px 50px rgba(0, 0, 0, 0.34);\n}\n\n/* Theme-level exceptions only. Component surfaces use semantic tokens in their base CSS. */\nhtml[data-theme="dark"] body {\n  background:\n    radial-gradient(circle at 5% 0%, rgba(111, 148, 255, 0.12), transparent 28rem),\n    radial-gradient(circle at 100% 24%, rgba(55, 197, 189, 0.08), transparent 25rem),\n    var(--surface-soft);\n}\n\nhtml[data-theme="dark"] .view-tabs {\n  background: rgba(23, 29, 41, 0.88);\n}\n\nhtml[data-theme="dark"] .slot-clear-button {\n  border-color: #4a5568;\n  background: rgba(18, 24, 36, 0.94);\n  color: #e5eaf3;\n  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);\n}\n\nhtml[data-theme="dark"] .slot-clear-button:hover {\n  border-color: var(--danger-line);\n  background: var(--danger-soft);\n  color: var(--danger);\n}\n\nhtml[data-theme="dark"] .owned-card:not(.is-owned) .landscape-card-art img[data-card-portrait] {\n  opacity: 0.54;\n}\n\nhtml[data-theme="dark"] .modal-backdrop {\n  background: rgba(3, 6, 12, 0.76);\n}\n\nhtml[data-theme="dark"] .app-error {\n  background: #581f30;\n}\n\nhtml[data-theme="dark"] .theme-toggle-icon-moon {\n  display: none;\n}\n\nhtml[data-theme="dark"] .theme-toggle-icon-sun {\n  display: block;\n}\n`;
await writeFile("css/theme.css", darkTheme, "utf8");
console.log("[theme-refactor] normalized css/theme.css");

await edit("styles.css", (source) => source
  .replace(/\.\/css\/(tokens|base|components|owned|modal|tweaks|theme)\.css\?v=20260812\.\d+/g, "./css/$1.css?v=20260812.5"));

await edit("index.html", (source) => source.replace("./styles.css?v=20260812.3", "./styles.css?v=20260812.5"));

const layeringStep = `      - name: Validate CSS theme layering\n        run: |\n          node --input-type=module <<'NODE'\n          import { readFile } from 'node:fs/promises';\n          const neutralFiles = ['css/base.css', 'css/components.css', 'css/owned.css', 'css/modal.css', 'css/tweaks.css'];\n          const neutral = await Promise.all(neutralFiles.map(async (path) => [path, await readFile(path, 'utf8')]));\n          for (const [path, text] of neutral) {\n            if (text.includes('data-theme="dark"')) throw new Error(\`dark selector leaked into \${path}\`);\n            if (text.split('{').length !== text.split('}').length) throw new Error(\`brace mismatch in \${path}\`);\n          }\n          const forbiddenSurface = /background(?:-color)?\\s*:\\s*#(?:fff(?:fff)?|f8faff|f7f9fc|fafbfd|fbfcff|f5f8ff|edf3ff|eef1f6|f9fbfe|e8f7f5|fff0f1|fff5f6)/i;\n          for (const [path, text] of neutral) {\n            if (forbiddenSurface.test(text)) throw new Error(\`theme-sensitive light surface literal remains in \${path}\`);\n          }\n          const light = await readFile('css/tokens.css', 'utf8');\n          const dark = await readFile('css/theme.css', 'utf8');\n          const requiredTokens = ['ink-900','ink-700','surface-inverse','ink-inverse','brand-line','brand-line-strong','accent-ink','accent-line','warning-ink','danger-soft','danger-line'];\n          for (const token of requiredTokens) {\n            if (!light.includes(\`--\${token}:\`)) throw new Error(\`missing light token --\${token}\`);\n            if (!dark.includes(\`--\${token}:\`)) throw new Error(\`missing dark token --\${token}\`);\n          }\n          console.log('[theme] semantic surface hierarchy validated');\n          NODE\n\n`;

for (const workflow of [".github/workflows/validate.yml", ".github/workflows/pages.yml"]) {
  await edit(workflow, (source) => {
    if (source.includes("Validate CSS theme layering")) return source;
    const marker = "      - name: Build and validate locale packs\n";
    if (!source.includes(marker)) throw new Error(`Workflow marker not found in ${workflow}`);
    return source.replace(marker, layeringStep + marker);
  });
}

console.log("[theme-refactor] complete");
