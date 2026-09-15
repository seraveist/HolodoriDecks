import { t } from "./i18n.js?v=1.3.1";
import { decodeCards } from "./data-codec.js?v=1.3.1";
import { dataAssetRequest } from "./data-assets.js?v=1.3.1";

const DATA_URLS = {
  manifest: new URL("../data/generated/manifest.json", import.meta.url),
  cards: new URL("../data/generated/cards.json", import.meta.url),
  characters: new URL("../data/generated/characters.json", import.meta.url),
  music: new URL("../data/generated/music.json", import.meta.url),
  musicSearch: new URL("../data/generated/music-search.json", import.meta.url),
  masterRefs: new URL("../data/generated/master_refs.json", import.meta.url),
};

async function fetchJson(url, cache = "no-store") {
  const response = await fetch(url, { cache });
  if (!response.ok) {
    throw new Error(t("data.requestFailed", {
      path: new URL(url, window.location.href).pathname,
      status: response.status,
    }));
  }
  return response.json();
}

async function fetchOptionalJson(url, cache = "no-store") {
  const response = await fetch(url, { cache });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(t("data.requestFailed", {
      path: new URL(url, window.location.href).pathname,
      status: response.status,
    }));
  }
  return response.json();
}

function fetchAsset(url, manifest, optional = false) {
  const request = dataAssetRequest(url, manifest);
  return (optional ? fetchOptionalJson : fetchJson)(request.url, request.cache);
}

function indexById(rows) {
  return new Map(rows.map((row) => [row.id, row]));
}

export async function loadManifest() {
  return fetchJson(DATA_URLS.manifest);
}

export async function loadAppData(providedManifest = null) {
  const manifest = providedManifest ?? await loadManifest();
  const [cardPayload, characters, music, musicSearch, masterRefs] = await Promise.all([
    fetchAsset(DATA_URLS.cards, manifest),
    fetchAsset(DATA_URLS.characters, manifest),
    fetchAsset(DATA_URLS.music, manifest),
    fetchAsset(DATA_URLS.musicSearch, manifest, true),
    fetchAsset(DATA_URLS.masterRefs, manifest),
  ]);
  const cards = decodeCards(cardPayload);

  if (!Array.isArray(cards) || !Array.isArray(characters) || !Array.isArray(music)
    || !masterRefs?.triggers || !masterRefs?.active_effects || !masterRefs?.passive_effects) {
    throw new Error(t("data.invalid"));
  }
  if (Number(manifest.card_count) !== cards.length
    || Number(manifest.character_count) !== characters.length
    || Number(manifest.music_count) !== music.length) {
    throw new Error(t("data.countMismatch"));
  }
  if (musicSearch && (Number(musicSearch.music_count) !== music.length || !musicSearch.items)) {
    throw new Error(t("data.invalid"));
  }

  const searchItems = musicSearch?.items ?? {};
  const searchableMusic = music.map((song) => ({
    ...song,
    search: searchItems[song.id] ?? null,
  }));

  return {
    manifest,
    cards,
    characters,
    music: searchableMusic,
    masterRefs,
    cardsById: indexById(cards),
    charactersById: indexById(characters),
    musicById: indexById(searchableMusic),
  };
}
