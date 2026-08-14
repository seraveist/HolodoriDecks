import assert from "node:assert/strict";
import fs from "node:fs";
import { auditPotentialEffects, prepareScoreCards } from "../js/card-prepare.js";
import { prepareScoreCards as legacyPrepareScoreCards } from "../js/score.js";

const cards = JSON.parse(fs.readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
const characters = JSON.parse(fs.readFileSync(new URL("../data/generated/characters.json", import.meta.url), "utf8"));
const masterRefs = JSON.parse(fs.readFileSync(new URL("../data/generated/master_refs.json", import.meta.url), "utf8"));
const charactersById = new Map(characters.map((row) => [row.id, row]));
const selectable = cards.filter((card) => [4, 5].includes(Number(card.rarity)));

assert.equal(auditPotentialEffects(cards).length, 0, "unexpected CardPotential effect type");

function comparable(row) {
  return {
    stats: row.stats,
    enhancementPermyriad: row.enhancementPermyriad,
    active: row.active,
    passive: row.passive,
    special: row.special,
    leader: row.leader,
  };
}

for (const potential of [0, 1, 2, 3, 4, 5]) {
  const settings = Object.fromEntries(selectable.map((card) => {
    const maxLevel = Math.max(1, ...(card.growth?.levels ?? []).map((level) => Number(level.level) || 1));
    return [card.id, { level: maxLevel, potential }];
  }));
  const current = prepareScoreCards(selectable, charactersById, settings, {
    levelMode: "current",
    masterRefs,
  });
  const legacy = legacyPrepareScoreCards(selectable, charactersById, settings, { levelMode: "current" });

  for (const card of selectable) {
    assert.deepEqual(
      comparable(current.get(card.id)),
      comparable(legacy.get(card.id)),
      `${card.id} potential ${potential} changed live-score preparation`,
    );
    if (potential === 5) {
      assert.equal(current.get(card.id).profile.ignoredSkillTreePotential, true,
        `${card.id} should record 5-awakening skill-tree effect as out of score scope`);
    }
  }
}

const rarityFive = selectable.find((card) => Number(card.rarity) === 5);
assert.ok(rarityFive, "expected at least one rarity-5 card");
const levelRows = rarityFive.growth?.levels ?? [];
const lowLevel = Math.max(1, Number(levelRows[0]?.level) || 1);
const maxLevel = Math.max(...levelRows.map((row) => Number(row.level) || 1));
const sampleSettings = {
  [rarityFive.id]: { level: lowLevel, potential: 2 },
};
const currentLevelPrepared = prepareScoreCards([rarityFive], charactersById, sampleSettings, {
  levelMode: "current",
  masterRefs,
}).get(rarityFive.id);
const maxLevelPrepared = prepareScoreCards([rarityFive], charactersById, sampleSettings, {
  levelMode: "max",
  masterRefs,
}).get(rarityFive.id);
assert.equal(currentLevelPrepared.profile.level, lowLevel);
assert.equal(maxLevelPrepared.profile.level, maxLevel);
assert.equal(currentLevelPrepared.profile.parameterPermilUp, 100);
assert.equal(maxLevelPrepared.profile.parameterPermilUp, 100);

console.log(`card preparation regression: ${selectable.length} selectable cards × 6 awakening states`);
