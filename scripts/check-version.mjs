import assert from "node:assert/strict";
import fs from "node:fs";
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const version = read("VERSION").trim();
assert.match(version, /^\d+\.\d+\.\d+$/);
for (const [file, pattern] of [
  ["pyproject.toml", /^version = "([^"]+)"/m],
  ["src/holodori_decksim/__init__.py", /__version__ = "([^"]+)"/],
  ["js/app.js", /const APP_VERSION = "([^"]+)"/],
  ["index.html", /data-app-version="([^"]+)"/],
  ["index.html", /styles\.css\?v=([^"]+)"/],
  ["index.html", /app\.js\?v=([^"]+)"/],
]) assert.equal(read(file).match(pattern)?.[1], version, `${file}: version mismatch`);
assert.ok(read("CHANGELOG.md").includes(`## [${version}] - `), "Release notes missing");
console.log(`release version ${version}: package, app, HTML and changelog agree`);
