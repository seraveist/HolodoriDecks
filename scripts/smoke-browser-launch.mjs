import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode != null || !child.pid) return;
  await new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); child.off("exit", finish); resolve(); };
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* process already gone */ }
      finish();
    }, 2_000);
    child.once("exit", finish);
    try { child.kill("SIGTERM"); } catch { finish(); }
  });
}

async function removeProfile(profile) {
  const resolved = path.resolve(profile);
  if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith("holodori-browser-smoke-")) {
    throw new Error(`Refusing to remove unexpected Chrome profile: ${profile}`);
  }
  await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

async function activePortUrl(profile) {
  try {
    const [port, endpoint] = (await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/);
    if (/^\d+$/.test(port) && Number(port) > 0 && Number(port) <= 65535 && /^\/devtools\/browser\/[\w-]+$/.test(endpoint)) {
      return `ws://127.0.0.1:${port}${endpoint}`;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return null;
}

// Retry only process startup. Once returned, application assertions are run
// once and must fail normally; a failed UI test never becomes a successful retry.
export async function launchSmokeBrowser(executable, {
  attempts = 3, timeoutMs = 20_000, pollMs = 100,
  spawnProcess = spawn, onRetry = (message) => console.warn(message),
} = {}) {
  const failures = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const profileDir = await fs.mkdtemp(path.join(tmpdir(), "holodori-browser-smoke-"));
    let child = null;
    let stderr = "";
    let spawnError = null;
    const close = async () => { await stop(child); await removeProfile(profileDir); };
    try {
      child = spawnProcess(executable, [
        "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
        "--no-first-run", "--no-default-browser-check", "--remote-allow-origins=*",
        "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
        `--user-data-dir=${profileDir}`, "about:blank",
      ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
      child.on("error", (error) => { spawnError = error; });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-8_000); });
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (spawnError) throw spawnError;
        if (child.exitCode !== null || child.signalCode != null) {
          throw new Error(`Chrome exited (${child.exitCode ?? child.signalCode})`);
        }
        const debuggerUrl = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1] ?? await activePortUrl(profileDir);
        if (debuggerUrl) return { process: child, debuggerUrl, profileDir, close };
        await delay(pollMs);
      }
      throw new Error(`Chrome remote debugging did not start within ${timeoutMs}ms`);
    } catch (error) {
      failures.push(`Attempt ${attempt}/${attempts}: ${error.message}${stderr ? `\n${stderr.trim()}` : ""}`);
      await close();
      // A missing binary/permission cannot be repaired by trying it again.
      if (["ENOENT", "EACCES"].includes(error.code) || attempt === attempts) break;
      onRetry(`[browser-startup] ${failures.at(-1)}\nRetrying with a fresh Chrome profile.`);
    }
  }
  throw new Error(`Chrome startup failed:\n${failures.join("\n")}`);
}
