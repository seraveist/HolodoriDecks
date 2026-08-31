import assert from "node:assert/strict";
import fs from "node:fs";
import { auditPotentialEffects, prepareScoreCards } from "../js/card-prepare.js";
import { auditLeaderSupport, leaderSupportStatus } from "../js/leader-support.js";
import {
  CARD_SKILL_SUPPORT_REGISTRY,
  auditCardSkillSupport,
  cardSkillSupportStatus,
} from "../js/skill-support.js";
import { prepareScoreCards as legacyPrepareScoreCards } from "../js/score.js";

const cards = JSON.parse(fs.readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
const characters = JSON.parse(fs.readFileSync(new URL("../data/generated/characters.json", import.meta.url), "utf8"));
const masterRefs = JSON.parse(fs.readFileSync(new URL("../data/generated/master_refs.json", import.meta.url), "utf8"));
const charactersById = new Map(characters.map((row) => [row.id, row]));
const selectable = cards.filter((card) => [4, 5].includes(Number(card.rarity)));

const bijou = cards.find((card) => card.id === "card-04014-5-uniq-0053-00");
assert.ok(bijou, "expected Koseki Bijou rarity-5 calibration card");
const bijouPrepared = prepareScoreCards([bijou], charactersById, {
  [bijou.id]: { level: 60, potential: 0 },
}, { levelMode: "current", masterRefs }).get(bijou.id);
assert.deepEqual(
  bijouPrepared.stats,
  { p: 4859, t: 5487, s: 8129 },
  "in-game Bijou Lv60 P/T/S fixture requires independent per-stat ceil rounding",
);

assert.equal(auditPotentialEffects(cards).length, 0, "unexpected CardPotential effect type");
const leaderAudit = auditLeaderSupport(selectable);
assert.equal(
  leaderAudit.understood,
  true,
  `unsupported leader mechanics detected: ${JSON.stringify({
    issues: leaderAudit.issues,
    cards: leaderAudit.unknownCards.slice(0, 10),
  })}`,
);

const skillAudit = auditCardSkillSupport(selectable, masterRefs);
assert.equal(
  skillAudit.understood,
  true,
  `unsupported card skill mechanics detected: ${JSON.stringify({
    issues: skillAudit.issues.slice(0, 20),
    cards: skillAudit.unknownCards.slice(0, 10),
  })}`,
);

const syntheticUnknownLeader = {
  trigger: [{ type: "LiveSkillTriggerType_FUTURE_UNKNOWN" }],
  effect: [{ type: "LivePassiveSkillEffectType_FUTURE_UNKNOWN", value: 999 }],
};
assert.equal(leaderSupportStatus(syntheticUnknownLeader).understood, false,
  "future leader mechanics must default to unsupported");

const syntheticUnsupportedTarget = {
  trigger: [],
  effect: [{
    type: "LivePassiveSkillEffectType_LIVE_PASSIVE_SKILL_EFFECT_TYPE_ALL_PARAMETER_UP_PERMIL_UP",
    value: 500,
    liveSkillEffectTargetId: "live_skill_effect_target-future",
  }],
};
assert.equal(leaderSupportStatus(syntheticUnsupportedTarget).understood, false,
  "known leader effect types with new targets must require explicit support");

function syntheticBaseCard(id = "synthetic-card") {
  return {
    id,
    character_name: "Synthetic",
    growth: { potential_effects: [] },
    skills: { active: { levels: [] }, passive: { levels: [] }, special: { levels: [] } },
  };
}

const knownScoreEffect = {
  groupId: "synthetic-score-effect",
  number: 1,
  type: "LiveActiveSkillEffectType_LIVE_ACTIVE_SKILL_EFFECT_TYPE_SCORE_UP_PERMIL_UP",
  value: "500",
};
const syntheticUnknownTriggerRefs = {
  ...masterRefs,
  active_effects: {
    ...masterRefs.active_effects,
    "synthetic-score-effect": [knownScoreEffect],
  },
  triggers: {
    ...masterRefs.triggers,
    "synthetic-future-trigger": [{
      groupId: "synthetic-future-trigger",
      number: 1,
      type: "LiveSkillTriggerType_FUTURE_UNKNOWN",
      threshold: "1",
    }],
  },
};
const syntheticUnknownTriggerCard = syntheticBaseCard("synthetic-unknown-trigger");
syntheticUnknownTriggerCard.skills.active.levels.push({
  level: 1,
  liveActiveSkillEffectGroupId: "synthetic-score-effect",
  additionalLiveSkillTriggerGroupId: "synthetic-future-trigger",
  additionalLiveActiveSkillEffectGroupId: "synthetic-score-effect",
  coolTimeMillisecond: 30000,
  activationProbabilityPermilMultiply: 500,
  effectDurationMillisecond: 10000,
});
assert.equal(
  cardSkillSupportStatus(syntheticUnknownTriggerCard, syntheticUnknownTriggerRefs).understood,
  false,
  "future active/special trigger types must default to unsupported",
);

const syntheticUnknownEffectRefs = {
  ...masterRefs,
  active_effects: {
    ...masterRefs.active_effects,
    "synthetic-future-effect": [{
      groupId: "synthetic-future-effect",
      number: 1,
      type: "LiveActiveSkillEffectType_FUTURE_UNKNOWN",
      value: "500",
    }],
  },
};
const syntheticUnknownEffectCard = syntheticBaseCard("synthetic-unknown-effect");
syntheticUnknownEffectCard.skills.active.levels.push({
  level: 1,
  liveActiveSkillEffectGroupId: "synthetic-future-effect",
  coolTimeMillisecond: 30000,
  activationProbabilityPermilMultiply: 500,
  effectDurationMillisecond: 10000,
});
assert.equal(
  cardSkillSupportStatus(syntheticUnknownEffectCard, syntheticUnknownEffectRefs).understood,
  false,
  "future active effect types must default to unsupported",
);

const syntheticPassiveTargetRefs = {
  ...masterRefs,
  passive_effects: {
    ...masterRefs.passive_effects,
    "synthetic-passive-target": [{
      groupId: "synthetic-passive-target",
      number: 1,
      type: "LivePassiveSkillEffectType_LIVE_PASSIVE_SKILL_EFFECT_TYPE_ALL_PARAMETER_UP_PERMIL_UP",
      value: "200",
      liveSkillEffectTargetId: "live_skill_effect_target-future",
    }],
  },
};
const syntheticPassiveTargetCard = syntheticBaseCard("synthetic-passive-target");
syntheticPassiveTargetCard.skills.passive.levels.push({
  level: 1,
  livePassiveSkillEffectGroupId: "synthetic-passive-target",
});
assert.equal(
  cardSkillSupportStatus(syntheticPassiveTargetCard, syntheticPassiveTargetRefs).understood,
  false,
  "known passive effects with a new target shape must require explicit support",
);

const syntheticWrongContextRefs = {
  ...masterRefs,
  active_effects: {
    ...masterRefs.active_effects,
    "synthetic-life-recovery": [{
      groupId: "synthetic-life-recovery",
      number: 1,
      type: "LiveActiveSkillEffectType_LIVE_ACTIVE_SKILL_EFFECT_TYPE_LIFE_RECOVERY",
      value: "300",
    }],
  },
};
const syntheticWrongContextCard = syntheticBaseCard("synthetic-wrong-context");
syntheticWrongContextCard.skills.active.levels.push({
  level: 1,
  liveActiveSkillEffectGroupId: "synthetic-life-recovery",
  coolTimeMillisecond: 30000,
  activationProbabilityPermilMultiply: 500,
  effectDurationMillisecond: 10000,
});
assert.equal(
  cardSkillSupportStatus(syntheticWrongContextCard, syntheticWrongContextRefs).understood,
  false,
  "known effects used in an unsupported skill context must not be silently accepted",
);

const syntheticUnknownPotentialCard = syntheticBaseCard("synthetic-unknown-potential");
syntheticUnknownPotentialCard.growth.potential_effects.push({
  upgradeCount: 1,
  effectType: "CardPotentialEffectType_FUTURE_UNKNOWN",
  value: "2",
});
assert.equal(
  cardSkillSupportStatus(syntheticUnknownPotentialCard, masterRefs).understood,
  false,
  "future potential effect types must default to unsupported",
);

const syntheticIgnoredPotentialCard = syntheticBaseCard("synthetic-ignored-potential");
syntheticIgnoredPotentialCard.growth.potential_effects.push({
  upgradeCount: 5,
  effectType: "CardPotentialEffectType_CARD_POTENTIAL_EFFECT_TYPE_SKILL_TREE_CONNECT_EFFECT_LEVEL_UP",
});
const ignoredPotentialStatus = cardSkillSupportStatus(syntheticIgnoredPotentialCard, masterRefs);
assert.equal(ignoredPotentialStatus.understood, true,
  "known out-of-score potential effects must remain supported");
assert.ok(ignoredPotentialStatus.ignored.length > 0,
  "known out-of-score effects must be explicitly recorded as ignored");

function comparable(row) {
  return {
    stats: row.stats,
    enhancementPermyriad: row.enhancementPermyriad,
    active: row.active,
    passive: row.passive,
    special: row.special,
    leader: {
      primaryCondition: row.leader.primaryCondition,
      primaryEffects: row.leader.primaryEffects,
      additionalCondition: row.leader.additionalCondition,
      additionalEffects: row.leader.additionalEffects,
      description: row.leader.description,
    },
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

console.log(
  `card preparation regression: ${selectable.length} selectable cards × 6 awakening states; `
  + `leader registry v${leaderAudit.registryVersion}; card-skill registry v${CARD_SKILL_SUPPORT_REGISTRY.version}; `
  + `triggers=${skillAudit.observedTriggerTypes.length}, activeEffects=${skillAudit.observedActiveEffectTypes.length}, `
  + `passiveEffects=${skillAudit.observedPassiveEffectTypes.length}, potentialEffects=${skillAudit.observedPotentialEffectTypes.length}, `
  + `knownIgnored=${skillAudit.ignoredScoreEffects.length}`,
);
