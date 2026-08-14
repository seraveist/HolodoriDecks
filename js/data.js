import { t } from "./i18n.js?v=20260812.1";

const DATA_URLS = {
  manifest: new URL("../data/generated/manifest.json", import.meta.url),
  cards: new URL("../data/generated/cards.json", import.meta.url),
  characters: new URL("../data/generated/characters.json", import.meta.url),
  music: new URL("../data/generated/music.json", import.meta.url),
  masterRefs: new URL("../data/generated/master_refs.json", import.meta.url),
};

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(t("data.requestFailed", {
      path: new URL(url, window.location.href).pathname,
      status: response.status,
    }));
  }
  return response.json();
}

function versionedUrl(url, version) {
  const result = new URL(url);
  result.searchParams.set("v", version);
  return result;
}

function indexById(rows) {
  return new Map(rows.map((row) => [row.id, row]));
}

export async function loadManifest() {
  return fetchJson(DATA_URLS.manifest);
}

export async function loadAppData(providedManifest = null) {
  const manifest = providedManifest ?? await loadManifest();
  const dataVersion = manifest.source_commit || manifest.master_version || Date.now();
  const [cards, characters, music, masterRefs] = await Promise.all([
    fetchJson(versionedUrl(DATA_URLS.cards, dataVersion)),
    fetchJson(versionedUrl(DATA_URLS.characters, dataVersion)),
    fetchJson(versionedUrl(DATA_URLS.music, dataVersion)),
    fetchJson(versionedUrl(DATA_URLS.masterRefs, dataVersion)),
  ]);

  if (!Array.isArray(cards) || !Array.isArray(characters) || !Array.isArray(music)
    || !masterRefs?.triggers || !masterRefs?.active_effects || !masterRefs?.passive_effects) {
    throw new Error(t("data.invalid"));
  }
  if (Number(manifest.card_count) !== cards.length
    || Number(manifest.character_count) !== characters.length
    || Number(manifest.music_count) !== music.length) {
    throw new Error(t("data.countMismatch"));
  }

  return {
    manifest,
    cards,
    characters,
    music,
    masterRefs,
    cardsById: indexById(cards),
    charactersById: indexById(characters),
    musicById: indexById(music),
  };
}
