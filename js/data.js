const DATA_URLS = {
  manifest: new URL("../data/generated/manifest.json", import.meta.url),
  cards: new URL("../data/generated/cards.json", import.meta.url),
  characters: new URL("../data/generated/characters.json", import.meta.url),
  music: new URL("../data/generated/music.json", import.meta.url),
};

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url.pathname} 요청 실패 (${response.status})`);
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

export async function loadAppData() {
  const manifest = await fetchJson(DATA_URLS.manifest);
  const dataVersion = manifest.source_commit || manifest.master_version || Date.now();
  const [cards, characters, music] = await Promise.all([
    fetchJson(versionedUrl(DATA_URLS.cards, dataVersion)),
    fetchJson(versionedUrl(DATA_URLS.characters, dataVersion)),
    fetchJson(versionedUrl(DATA_URLS.music, dataVersion)),
  ]);

  if (!Array.isArray(cards) || !Array.isArray(characters) || !Array.isArray(music)) {
    throw new Error("카드, 캐릭터 또는 악곡 데이터 형식이 올바르지 않습니다.");
  }
  if (Number(manifest.card_count) !== cards.length
    || Number(manifest.character_count) !== characters.length
    || Number(manifest.music_count) !== music.length) {
    throw new Error("동기화 manifest와 카드·캐릭터·악곡 데이터 개수가 일치하지 않습니다.");
  }

  return {
    manifest,
    cards,
    characters,
    music,
    cardsById: indexById(cards),
    charactersById: indexById(characters),
    musicById: indexById(music),
  };
}
