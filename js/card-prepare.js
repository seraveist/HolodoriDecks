import { prepareScoreCards as legacyPrepareScoreCards } from "./score.js?v=1.1.0";
import {
  POTENTIAL_EFFECT_TYPE as POTENTIAL_TYPE,
  auditPotentialSupport,
  potentialEffectTypeSuffix,
} from "./skill-support.js?v=1.1.0";

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function cleanDescription(value) {
  return String(value ?? "정보 없음")
    .replace(/\[\/?[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function maxCardLevel(card) {
  return Math.max(1, ...(card?.growth?.levels ?? []).map((row) => finite(row.level, 1)));
}

function growthAtLevel(card, requestedLevel) {
  const rows = card?.growth?.levels ?? [];
  const level = Math.min(maxCardLevel(card), Math.max(1, Math.round(finite(requestedLevel, maxCardLevel(card)))));
  return [...rows]
    .sort((left, right) => Math.abs(finite(left.level) - level) - Math.abs(finite(right.level) - level))[0]
    ?? { level, parameterBaseValue: 0, liveDeckPowerPermyriadUp: 0 };
}

function effectTypeSuffix(effect) {
  return potentialEffectTypeSuffix(effect);
}

function potentialRows(card, potential) {
  const count = Math.min(5, Math.max(0, Math.round(finite(potential))));
  return (card?.growth?.potential_effects ?? [])
    .filter((row) => finite(row?.upgradeCount, 99) <= count)
    .sort((left, right) => finite(left?.upgradeCount) - finite(right?.upgradeCount));
}

function potentialSkillLevel(rows, suffix) {
  return rows
    .filter((row) => effectTypeSuffix(row) === suffix)
    .reduce((level, row) => Math.max(level, Math.round(finite(row?.value, 1))), 1);
}

function potentialParameterPermil(rows) {
  return rows
    .filter((row) => effectTypeSuffix(row) === POTENTIAL_TYPE.parameter)
    .reduce((sum, row) => sum + finite(row?.value), 0);
}

export function auditPotentialEffects(cards) {
  return auditPotentialSupport(cards);
}

function skillLevel(skill, requestedLevel) {
  const levels = [...(skill?.levels ?? [])].sort((left, right) => finite(left?.level) - finite(right?.level));
  if (!levels.length) return null;
  const target = Math.max(1, Math.round(finite(requestedLevel, 1)));
  return levels.find((level) => finite(level?.level) === target)
    ?? [...levels].reverse().find((level) => finite(level?.level) <= target)
    ?? levels[0];
}

function conditionFromId(groupId) {
  const value = String(groupId ?? "");
  let match = value.match(/deck_card_attribute-attribute_(\d+)-(\d+)$/);
  if (match) return { kind: "attribute", value: Number(match[1]), count: Number(match[2]) };
  match = value.match(/deck_card_character_grouping-(.+)-(\d+)$/);
  if (match) return { kind: "group", value: match[1], count: Number(match[2]) };
  match = value.match(/combo_gte-(\d+)$/);
  if (match) return { kind: "combo", threshold: Number(match[1]) };
  match = value.match(/life_gte-(\d+)$/);
  if (match) return { kind: "life", threshold: Number(match[1]) };
  return null;
}

function conditionFromTrigger(trigger) {
  if (!trigger) return null;
  if (trigger.cardAttributeType) {
    const match = String(trigger.cardAttributeType).match(/ATTRIBUTE_(\d+)$/);
    return match ? { kind: "attribute", value: Number(match[1]), count: finite(trigger.threshold) } : null;
  }
  if (trigger.characterGroupingId) {
    return { kind: "group", value: trigger.characterGroupingId, count: finite(trigger.threshold) };
  }
  return conditionFromId(trigger.groupId);
}

function conditionFromMaster(masterRefs, groupId) {
  const structured = masterRefs?.triggers?.[groupId] ?? [];
  return structured.map(conditionFromTrigger).find(Boolean) ?? conditionFromId(groupId);
}

function targetFromEffectId(effectId) {
  const value = String(effectId ?? "");
  if (value.endsWith("live_skill_effect_target-self")) return { kind: "self", count: 1 };
  let match = value.match(/live_skill_effect_target-attribute-attribute_(\d+)-(\d+)$/);
  if (match) return { kind: "attribute", value: Number(match[1]), count: Number(match[2]) };
  match = value.match(/live_skill_effect_target-character_grouping-(.+)-(\d+)$/);
  if (match) return { kind: "group", value: match[1], count: Number(match[2]) };
  return { kind: "all", count: 5 };
}

function permilValueFromId(groupId) {
  const match = String(groupId ?? "").match(/per(?:mil|myriad)_up-(\d+)/);
  return match ? Number(match[1]) / 10 : 0;
}

function effectPct(effect) {
  return effect && Number.isFinite(Number(effect.value)) ? Number(effect.value) / 10 : null;
}

function activeEffects(masterRefs, groupId) {
  return masterRefs?.active_effects?.[groupId] ?? [];
}

function passiveEffects(masterRefs, groupId) {
  return masterRefs?.passive_effects?.[groupId] ?? [];
}

function scoreUpPct(masterRefs, groupId) {
  const effect = activeEffects(masterRefs, groupId)
    .find((row) => String(row?.type ?? "").includes("SCORE_UP_PERMIL_UP"));
  return effectPct(effect) ?? permilValueFromId(groupId);
}

function parseActive(skill, requestedLevel, masterRefs) {
  const level = skillLevel(skill, requestedLevel);
  if (!level) {
    return {
      level: 1, interval: 30, probability: 0, duration: 0,
      baseScoreUp: 0, conditionalScoreUp: 0, condition: null, description: "정보 없음",
    };
  }
  const baseId = level.liveActiveSkillEffectGroupId ?? "";
  const conditionalId = level.additionalLiveActiveSkillEffectGroupId ?? "";
  const baseScoreUp = scoreUpPct(masterRefs, baseId);
  const conditionalScoreUp = scoreUpPct(masterRefs, conditionalId);
  return {
    level: finite(level.level, 1),
    interval: Math.max(0.001, finite(level.coolTimeMillisecond, 30000) / 1000),
    probability: clamp(finite(level.activationProbabilityPermilMultiply) / 1000, 0, 1),
    duration: Math.max(0, finite(level.effectDurationMillisecond) / 1000),
    baseScoreUp,
    conditionalScoreUp: conditionalScoreUp || baseScoreUp,
    condition: conditionFromMaster(masterRefs, level.additionalLiveSkillTriggerGroupId),
    description: cleanDescription(level.description),
  };
}

function passiveKind(effectId, structuredType) {
  const type = String(structuredType ?? "");
  if (type.includes("ALL_PARAMETER") || effectId.includes("all_parameter_up")) return "all";
  if (type.includes("PERFORMANCE") || effectId.includes("performance_up")) return "p";
  if (type.includes("TECHNIQUE") || effectId.includes("technique_up")) return "t";
  if (type.includes("SENSE") || effectId.includes("sense_up")) return "s";
  return "support";
}

function parsePassive(skill, requestedLevel, masterRefs) {
  const level = skillLevel(skill, requestedLevel);
  if (!level) return null;
  const effectId = level.livePassiveSkillEffectGroupId ?? "";
  const structured = passiveEffects(masterRefs, effectId);
  const primary = structured.find((row) => Number.isFinite(Number(row?.value))) ?? structured[0] ?? null;
  const value = effectPct(primary) ?? permilValueFromId(effectId);
  const target = targetFromEffectId(effectId);
  const kindHint = passiveKind(effectId, primary?.type);
  let kind = "support";
  let stat = null;
  if (kindHint === "all") kind = target.kind === "self" ? "selfAll" : "all";
  else if (["p", "t", "s"].includes(kindHint)) {
    kind = "stat";
    stat = kindHint;
  }
  return {
    level: finite(level.level, 1),
    description: cleanDescription(level.description),
    condition: conditionFromMaster(masterRefs, level.liveSkillTriggerGroupId),
    effect: { kind, stat, value, target },
  };
}

function structuredSpecialPct(masterRefs, groupId, marker) {
  const effect = activeEffects(masterRefs, groupId)
    .find((row) => String(row?.type ?? "").includes(marker));
  return effectPct(effect) ?? (String(groupId ?? "").includes(marker.toLowerCase()) ? permilValueFromId(groupId) : 0);
}

function parseSpecial(skill, requestedLevel, masterRefs) {
  const level = skillLevel(skill, requestedLevel);
  if (!level) {
    return { level: 1, duration: 0, support: 0, activationRateUp: 0, condition: null, description: "정보 없음" };
  }
  const primaryId = level.liveActiveSkillEffectGroupId ?? "";
  const additionalId = level.additionalLiveActiveSkillEffectGroupId ?? "";
  const supportEffect = activeEffects(masterRefs, primaryId)
    .find((row) => String(row?.type ?? "").includes("SCORE_UP_EFFECT_UP"));
  const rateEffect = activeEffects(masterRefs, additionalId)
    .find((row) => String(row?.type ?? "").includes("ACTIVATION_PROBABILITY_UP"));
  return {
    level: finite(level.level, 1),
    duration: Math.max(0, finite(level.effectDurationMillisecond) / 1000),
    support: effectPct(supportEffect) ?? (primaryId.includes("score_up_effect_up") ? permilValueFromId(primaryId) : 0),
    activationRateUp: effectPct(rateEffect) ?? (additionalId.includes("activation_probability_up") ? permilValueFromId(additionalId) : 0),
    condition: conditionFromMaster(masterRefs, level.additionalLiveSkillTriggerGroupId),
    description: cleanDescription(level.description),
  };
}

function parseLeaderEffects(effects) {
  const parsed = { p: 0, t: 0, s: 0, support: 0 };
  for (const effect of effects ?? []) {
    const value = finite(effect.value) / 10;
    const type = String(effect.type ?? "");
    if (type.includes("ALL_PARAMETER")) {
      parsed.p += value;
      parsed.t += value;
      parsed.s += value;
    } else if (type.includes("PERFORMANCE")) parsed.p += value;
    else if (type.includes("TECHNIQUE")) parsed.t += value;
    else if (type.includes("SENSE")) parsed.s += value;
    else if (type.includes("LIVE_ACTIVE_SKILL_EFFECT")) parsed.support += value;
  }
  return parsed;
}

function distributeStats(card, parameterBaseValue, parameterPermilUp) {
  const base = finite(parameterBaseValue);
  const ratio = card?.parameter_ratio_permil ?? {};
  const multiplier = 1 + finite(parameterPermilUp) / 1000;
  return {
    p: Math.ceil(base * finite(ratio.performance) / 1000 * multiplier),
    t: Math.ceil(base * finite(ratio.technique) / 1000 * multiplier),
    s: Math.ceil(base * finite(ratio.sense) / 1000 * multiplier),
  };
}

export function prepareScoreCards(cards, charactersById, ownedCardSettings = {}, {
  levelMode = "current",
  masterRefs = null,
} = {}) {
  if (!masterRefs?.triggers || !masterRefs?.active_effects || !masterRefs?.passive_effects) {
    return legacyPrepareScoreCards(cards, charactersById, ownedCardSettings, { levelMode });
  }

  return new Map(cards.map((card) => {
    const character = charactersById.get(card.character_id);
    const maxLevel = maxCardLevel(card);
    const profile = ownedCardSettings[card.id] ?? { level: maxLevel, potential: 0 };
    const currentLevel = Math.min(maxLevel, Math.max(1, Math.round(finite(profile.level, maxLevel))));
    const level = levelMode === "max" ? maxLevel : currentLevel;
    const potential = Math.min(5, Math.max(0, Math.round(finite(profile.potential, 0))));
    const growth = growthAtLevel(card, level);
    const effects = potentialRows(card, potential);
    const activeLevel = potentialSkillLevel(effects, POTENTIAL_TYPE.active);
    const specialLevel = potentialSkillLevel(effects, POTENTIAL_TYPE.special);
    const passiveLevel = potentialSkillLevel(effects, POTENTIAL_TYPE.passive);
    const parameterPermilUp = potentialParameterPermil(effects);

    return [card.id, {
      id: card.id,
      raw: card,
      characterId: card.character_id,
      characterName: card.character_name,
      attribute: Number(card.attribute),
      groupings: new Set(character?.grouping_ids ?? []),
      profile: {
        level,
        currentLevel,
        maxLevel,
        potential,
        levelMode,
        parameterPermilUp,
        ignoredSkillTreePotential: effects.some((effect) => effectTypeSuffix(effect) === POTENTIAL_TYPE.skillTree),
      },
      stats: distributeStats(card, growth.parameterBaseValue, parameterPermilUp),
      enhancementPermyriad: finite(growth.liveDeckPowerPermyriadUp),
      active: parseActive(card.skills?.active, activeLevel, masterRefs),
      passive: parsePassive(card.skills?.passive, passiveLevel, masterRefs),
      special: parseSpecial(card.skills?.special, specialLevel, masterRefs),
      leader: {
        primaryCondition: (card.leader?.trigger ?? []).map(conditionFromTrigger).filter(Boolean),
        primaryEffects: parseLeaderEffects(card.leader?.effect),
        additionalCondition: (card.leader?.additional_trigger ?? []).map(conditionFromTrigger).filter(Boolean),
        additionalEffects: parseLeaderEffects(card.leader?.additional_effect),
        description: cleanDescription(card.leader?.description),
      },
    }];
  }));
}
