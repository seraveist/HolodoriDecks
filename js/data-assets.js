const GENERATED_BASE = new URL("../data/generated/", import.meta.url);

// Source previews stay fresh; only content-addressed deployment files use cache.
export function dataAssetRequest(originalUrl, manifest = {}) {
  const original = new URL(originalUrl);
  const logicalName = original.href.startsWith(GENERATED_BASE.href)
    ? original.href.slice(GENERATED_BASE.href.length).split("?")[0] : "";
  const assets = manifest.public_assets;
  const mapped = assets?.files?.[logicalName];
  if (mapped !== undefined) {
    if (assets.version !== 1 || typeof mapped !== "string"
      || !/^runtime\/[a-zA-Z0-9_-]+\.[0-9a-f]{64}\.json$/.test(mapped)) {
      throw new TypeError("Invalid public asset manifest");
    }
    return { url: new URL(mapped, GENERATED_BASE), cache: "force-cache" };
  }
  original.searchParams.set("v", String(manifest.source_commit || manifest.master_version || Date.now()));
  return { url: original, cache: "no-store" };
}
