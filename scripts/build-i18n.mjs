import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED_DIR = path.join(ROOT, "data", "generated");
const OUTPUT_DIR = path.join(GENERATED_DIR, "i18n");

const LANGUAGE_FILES = Object.freeze([
  "LangCard",
  "LangCharacter",
  "LangMusic",
  "LangGeneratedLiveLeaderSkill",
  "LangGeneratedLiveActiveSkillLevel",
  "LangGeneratedLiveActiveSkillEffect",
  "LangGeneratedLivePassiveSkillLevel",
  "LangGeneratedLivePassiveSkillEffect",
  "LangGeneratedLiveSpecialSkillLevel",
  "LangGeneratedLiveSkillTrigger",
  "LangGeneratedLiveSkillEffectTarget",
]);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function fetchText(url, label) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.raw+json, application/json, text/plain, */*",
      "User-Agent": "HolodoriDecks-i18n-builder",
    },
  });
  if (!response.ok) {
    throw new Error(`${label} 요청 실패: HTTP ${response.status}`);
  }
  return response.text();
}

async function fetchJson(url, label) {
  return JSON.parse(await fetchText(url, label));
}

function rawUrl(repository, commit, fileName) {
  return `https://raw.githubusercontent.com/${repository}/${commit}/${fileName}`;
}

function flattenLanguageRows(rows, target, sourceLabel) {
  if (!Array.isArray(rows)) throw new Error(`${sourceLabel} 형식이 배열이 아닙니다.`);
  for (const row of rows) {
    const id = String(row?.id ?? row?.data?.id ?? "").trim();
    const text = row?.data?.text;
    if (!id || typeof text !== "string" || !text.trim()) continue;
    if (Object.hasOwn(target, id) && target[id] !== text) {
      throw new Error(`${sourceLabel}: 중복 LangId의 번역 값이 다릅니다: ${id}`);
    }
    target[id] = text;
  }
}

function requiredLangIds(cards, characters, music) {
  const ids = new Set();
  for (const character of characters) ids.add(`la-name-${character.id}`);
  for (const song of music) ids.add(`la-music_title-${song.id}`);

  for (const card of cards) {
    const suffix = String(card.id).replace(/^card-/, "");
    ids.add(`la-card_name-${suffix}`);
    if (card.leader?.description) ids.add(`la-generated-live_leader_skill-${card.id}-description`);

    for (const [kind, prefix] of [
      ["active", "la-generated-live_active_skill"],
      ["passive", "la-generated-live_passive_skill"],
      ["special", "la-generated-live_special_skill"],
    ]) {
      for (const level of card.skills?.[kind]?.levels ?? []) {
        if (!level?.description) continue;
        const number = Number(level.level) || 1;
        ids.add(`${prefix}-${card.id}.${number}-description`);
      }
    }
  }
  return ids;
}

async function buildLocale(locale, config, masterVersion, requiredIds) {
  const { repository, commit, suffix } = config ?? {};
  if (!repository || !commit || !suffix) {
    throw new Error(`manifest.locales.${locale} 설정이 불완전합니다.`);
  }

  const sourceVersion = (await fetchText(
    rawUrl(repository, commit, "version.txt"),
    `${locale} version.txt`,
  )).trim();
  if (sourceVersion !== masterVersion) {
    throw new Error(
      `${locale} 언어 데이터 버전 불일치: expected=${masterVersion}, actual=${sourceVersion}`,
    );
  }

  const pack = {};
  for (const baseName of LANGUAGE_FILES) {
    const fileName = `${baseName}_${suffix}.json`;
    const rows = await fetchJson(rawUrl(repository, commit, fileName), `${locale}/${fileName}`);
    flattenLanguageRows(rows, pack, `${locale}/${fileName}`);
  }

  const missing = [...requiredIds].filter((id) => !Object.hasOwn(pack, id));
  if (missing.length) {
    const preview = missing.slice(0, 20).join(", ");
    throw new Error(`${locale} 필수 번역 ${missing.length}건 누락: ${preview}`);
  }

  const sortedPack = Object.fromEntries(Object.entries(pack).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(
    path.join(OUTPUT_DIR, `${locale}.json`),
    `${JSON.stringify(sortedPack)}\n`,
    "utf8",
  );
  return {
    locale,
    repository,
    commit,
    sourceVersion,
    entryCount: Object.keys(sortedPack).length,
    requiredEntryCount: requiredIds.size,
  };
}

async function main() {
  const [manifest, cards, characters, music] = await Promise.all([
    readJson(path.join(GENERATED_DIR, "manifest.json")),
    readJson(path.join(GENERATED_DIR, "cards.json")),
    readJson(path.join(GENERATED_DIR, "characters.json")),
    readJson(path.join(GENERATED_DIR, "music.json")),
  ]);
  const masterVersion = String(manifest.master_version ?? "").trim();
  if (!masterVersion) throw new Error("manifest.master_version이 없습니다.");
  const localeEntries = Object.entries(manifest.locales ?? {});
  if (!localeEntries.length) throw new Error("manifest.locales가 없습니다.");

  await mkdir(OUTPUT_DIR, { recursive: true });
  const requiredIds = requiredLangIds(cards, characters, music);
  const results = [];
  for (const [locale, config] of localeEntries) {
    results.push(await buildLocale(locale, config, masterVersion, requiredIds));
  }

  const report = {
    master_version: masterVersion,
    generated_at: new Date().toISOString(),
    required_entry_count: requiredIds.size,
    locales: Object.fromEntries(results.map((result) => [result.locale, {
      repository: result.repository,
      commit: result.commit,
      source_version: result.sourceVersion,
      entry_count: result.entryCount,
    }])),
  };
  await writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const result of results) {
    console.log(`[i18n] ${result.locale}: ${result.entryCount} entries (${result.repository}@${result.commit.slice(0, 8)})`);
  }
  console.log(`[i18n] validated ${requiredIds.size} required LangIds for ${results.length} locales`);
}

main().catch((error) => {
  console.error(`[i18n] build failed: ${error.message}`);
  process.exitCode = 1;
});
