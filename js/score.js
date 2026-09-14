import { buildSongContext, songKernel, timelineSongProjection } from "./chart-score.js?v=1.3.0";
import { unitDisplayBonuses, UNIT_DISPLAY_MODEL, UNIT_DISPLAY_CONTEXT } from "./unit-score.js?v=1.3.0";

export const SCORE_ENGINE_VERSION = "unit-score-v1.0-verified-display + song-score-v0.5-independent-song-base";
export const UNIT_SCORE_K = 2.037342;
export const CALIBRATION_FIXTURES = Object.freeze([
  { power: 67629, bonus: 106.8, score: 284936 },
  { power: 59589, bonus: 146.0, score: 298652 },
  { power: 62804, bonus: 99.8, score: 255651 },
  { power: 55049, bonus: 136.1, score: 264795 },
  { power: 84364, bonus: 110.2, score: 361288 },
  { power: 74232, bonus: 151.7, score: 380661 },
  { power: 109374, bonus: 134.7, score: 522987 },
  { power: 138734, bonus: 134.7, score: 663376 },
  { power: 142201, bonus: 136.0, score: 683720 },
  { power: 170243, bonus: 136.0, score: 818550 },
]);

const UNIT_CONTEXT = Object.freeze({ duration: 110, notes: 800, coefficient: 5, kind: "unit" });
const DEFAULT_ACCOUNT_BONUSES = Object.freeze({ memberEnhancementPermyriad: 0, boardScoreBonusPct: 0 });
const COMBO_AVERAGE_CACHE = new Map();
const GENERIC_CONTEXT_CACHE = new Map();
const MUSIC_CONTEXT_CACHE = new WeakMap();
const SONG_KERNEL_CACHE = new WeakMap();
const SONG_ACTIVE_WINDOWS_CACHE = new WeakMap();
const DIFFICULTY_NOTE_DENSITY = Object.freeze({
  EASY: 3.0,
  NORMAL: 4.5,
  HARD: 6.0,
  EXPERT: 7.27,
});

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round1 = (value) => Math.round(finite(value) * 10) / 10;

export function unitScoreFromDisplayed(power, scoreBonusPct) {
  return Math.round(finite(power) * (1 + finite(scoreBonusPct) / 100) * UNIT_SCORE_K);
}

export function scoreEngineSelfTest() {
  const rows = CALIBRATION_FIXTURES.map((fixture) => {
    const predicted = unitScoreFromDisplayed(fixture.power, fixture.bonus);
    return { ...fixture, predicted, error: predicted - fixture.score };
  });
  return { maxAbsError: Math.max(...rows.map((row) => Math.abs(row.error))), rows };
}

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

function distributeStats(card, parameterBaseValue, potential) {
  const base = finite(parameterBaseValue);
  const ratio = card?.parameter_ratio_permil ?? {};
  const multiplier = potential >= 2 ? 1.1 : 1;
  return {
    p: Math.ceil(base * finite(ratio.performance) / 1000 * multiplier),
    t: Math.ceil(base * finite(ratio.technique) / 1000 * multiplier),
    s: Math.ceil(base * finite(ratio.sense) / 1000 * multiplier),
  };
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
    const match = trigger.cardAttributeType.match(/ATTRIBUTE_(\d+)$/);
    return match ? { kind: "attribute", value: Number(match[1]), count: finite(trigger.threshold) } : null;
  }
  if (trigger.characterGroupingId) {
    return { kind: "group", value: trigger.characterGroupingId, count: finite(trigger.threshold) };
  }
  return conditionFromId(trigger.groupId);
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

function skillLevel(skill, useLevelTwo) {
  const levels = skill?.levels ?? [];
  return levels[Math.min(useLevelTwo ? 1 : 0, Math.max(0, levels.length - 1))] ?? null;
}

function parsePassive(skill, potential) {
  const level = skillLevel(skill, potential >= 4);
  if (!level) return null;
  const effectId = level.livePassiveSkillEffectGroupId ?? "";
  const value = permilValueFromId(effectId);
  const target = targetFromEffectId(effectId);
  let kind = "support";
  let stat = null;
  if (effectId.includes("all_parameter_up")) kind = target.kind === "self" ? "selfAll" : "all";
  else if (effectId.includes("performance_up")) { kind = "stat"; stat = "p"; }
  else if (effectId.includes("technique_up")) { kind = "stat"; stat = "t"; }
  else if (effectId.includes("sense_up")) { kind = "stat"; stat = "s"; }
  return {
    level: finite(level.level, 1),
    description: cleanDescription(level.description),
    condition: conditionFromId(level.liveSkillTriggerGroupId),
    effect: { kind, stat, value, target },
  };
}

function parseActive(skill, potential) {
  const level = skillLevel(skill, potential >= 1);
  if (!level) {
    return {
      level: 1, interval: 30, probability: 0, duration: 0,
      baseScoreUp: 0, conditionalScoreUp: 0, condition: null, description: "정보 없음",
    };
  }
  const baseScoreUp = permilValueFromId(level.liveActiveSkillEffectGroupId);
  const conditionalScoreUp = permilValueFromId(level.additionalLiveActiveSkillEffectGroupId);
  return {
    level: finite(level.level, 1),
    interval: Math.max(0.001, finite(level.coolTimeMillisecond, 30000) / 1000),
    probability: clamp(finite(level.activationProbabilityPermilMultiply) / 1000, 0, 1),
    duration: Math.max(0, finite(level.effectDurationMillisecond) / 1000),
    baseScoreUp,
    conditionalScoreUp: conditionalScoreUp || baseScoreUp,
    condition: conditionFromId(level.additionalLiveSkillTriggerGroupId),
    description: cleanDescription(level.description),
  };
}

function parseSpecial(skill, potential) {
  const level = skillLevel(skill, potential >= 3);
  if (!level) {
    return { level: 1, duration: 0, support: 0, activationRateUp: 0, condition: null, description: "정보 없음" };
  }
  const primaryId = level.liveActiveSkillEffectGroupId ?? "";
  const additionalId = level.additionalLiveActiveSkillEffectGroupId ?? "";
  return {
    level: finite(level.level, 1),
    duration: Math.max(0, finite(level.effectDurationMillisecond) / 1000),
    support: primaryId.includes("score_up_effect_up") ? permilValueFromId(primaryId) : 0,
    activationRateUp: additionalId.includes("activation_probability_up") ? permilValueFromId(additionalId) : 0,
    condition: conditionFromId(level.additionalLiveSkillTriggerGroupId),
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

export function prepareScoreCards(cards, charactersById, ownedCardSettings = {}, { levelMode = "current" } = {}) {
  return new Map(cards.map((card) => {
    const character = charactersById.get(card.character_id);
    const maxLevel = maxCardLevel(card);
    const profile = ownedCardSettings[card.id] ?? { level: maxLevel, potential: 0 };
    const currentLevel = Math.min(maxLevel, Math.max(1, Math.round(finite(profile.level, maxLevel))));
    const level = levelMode === "max" ? maxLevel : currentLevel;
    const potential = Math.min(5, Math.max(0, Math.round(finite(profile.potential, 0))));
    const growth = growthAtLevel(card, level);
    return [card.id, {
      id: card.id,
      raw: card,
      characterId: card.character_id,
      characterName: card.character_name,
      attribute: Number(card.attribute),
      groupings: new Set(character?.grouping_ids ?? []),
      profile: { level, currentLevel, maxLevel, potential, levelMode },
      stats: distributeStats(card, growth.parameterBaseValue, potential),
      enhancementPermyriad: finite(growth.liveDeckPowerPermyriadUp),
      active: parseActive(card.skills?.active, potential),
      passive: parsePassive(card.skills?.passive, potential),
      special: parseSpecial(card.skills?.special, potential),
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

function memberMatchesCondition(member, condition) {
  if (condition?.kind === "attribute") return member.attribute === condition.value;
  if (condition?.kind === "group") return member.groupings.has(condition.value);
  return false;
}

function conditionCount(condition, members) {
  if (["attribute", "group"].includes(condition?.kind)) {
    return members.filter((member) => memberMatchesCondition(member, condition)).length;
  }
  return 0;
}

function staticConditionState(condition, members) {
  if (!condition) return true;
  if (["attribute", "group"].includes(condition.kind)) return conditionCount(condition, members) >= condition.count;
  return null;
}

function allConditionsMet(conditions, members) {
  return conditions.every((condition) => staticConditionState(condition, members) !== false);
}

function dynamicConditionAvailability(condition, members, context) {
  if (!condition) return 1;
  const staticState = staticConditionState(condition, members);
  if (staticState === true) return 1;
  if (staticState === false) return 0;
  if (condition.kind === "combo") {
    return clamp((context.notes - finite(condition.threshold)) / Math.max(1, context.notes), 0, 1);
  }
  if (condition.kind === "life") return finite(condition.threshold) <= 1000 ? 1 : 0;
  return 0.5;
}

function eligibleTargets(target, owner, members) {
  if (!target || target.kind === "all") return [...members];
  if (target.kind === "self") return [owner];
  if (target.kind === "attribute") return members.filter((member) => member.attribute === target.value);
  if (target.kind === "group") return members.filter((member) => member.groupings.has(target.value));
  return [];
}

function addEffects(target, source) {
  for (const key of ["p", "t", "s", "support"]) target[key] += finite(source?.[key]);
}

function passiveEvaluation(members) {
  const bonusRatesByMember = new Map(members.map((member) => [member.id, { p: 0, t: 0, s: 0 }]));
  const supportByMember = new Map(members.map((member) => [member.id, 0]));
  const activeStates = [];

  for (const owner of members) {
    const passive = owner.passive;
    if (!passive) continue;
    const active = staticConditionState(passive.condition, members) !== false;
    activeStates.push({ cardId: owner.id, active, label: active ? "활성" : "비활성" });
    if (!active) continue;
    const effect = passive.effect;
    const targets = eligibleTargets(effect.target, owner, members)
      // Observation C supports base-total selection for single-stat buffs.
      // Use the same priority for support; its absolute bonus and equal-total
      // tie behavior are not yet isolated by the in-game observations.
      .sort((left, right) => (right.stats.p + right.stats.t + right.stats.s)
        - (left.stats.p + left.stats.t + left.stats.s))
      .slice(0, effect.target?.count ?? 5);
    if (effect.kind === "support") {
      for (const target of targets) {
        supportByMember.set(target.id, (supportByMember.get(target.id) ?? 0) + effect.value);
      }
      continue;
    }
    for (const target of targets) {
      if (effect.kind === "selfAll" || effect.kind === "all") {
        for (const stat of ["p", "t", "s"]) {
          bonusRatesByMember.get(target.id)[stat] += effect.value;
        }
      } else if (effect.kind === "stat") {
        bonusRatesByMember.get(target.id)[effect.stat] += effect.value;
      }
    }
  }

  const bonusStats = { p: 0, t: 0, s: 0 };
  // Passive effects in the same member/stat bucket add before the game rounds
  // up. Rounding every effect separately overcounts overlapping stat buffs.
  for (const member of members) {
    const rates = bonusRatesByMember.get(member.id);
    for (const stat of ["p", "t", "s"]) {
      bonusStats[stat] += Math.ceil(member.stats[stat] * rates[stat] / 100);
    }
  }
  const supportPoints = [...supportByMember.values()].reduce((sum, value) => sum + value, 0) / Math.max(1, members.length);
  return {
    bonusStats,
    supportPoints,
    supportByMember: Object.fromEntries(supportByMember),
    activeStates,
  };
}

function activeConditionalShare(active, members, context) {
  if (!active?.conditionalScoreUp || !active?.condition) return 0;
  const staticState = staticConditionState(active.condition, members);
  if (staticState === true) return 1;
  if (staticState === false) return 0;
  const checks = Math.floor(context.duration / Math.max(0.001, active.interval));
  if (checks <= 0) return 0;
  if (active.condition.kind === "combo") {
    const thresholdTime = clamp(finite(active.condition.threshold) / Math.max(1, context.notes), 0, 1) * context.duration;
    let conditionalChecks = 0;
    for (let check = 1; check <= checks; check += 1) {
      if (check * active.interval >= thresholdTime) conditionalChecks += 1;
    }
    return conditionalChecks / checks;
  }
  if (active.condition.kind === "life") return finite(active.condition.threshold) <= 1000 ? 1 : 0;
  return 0.5;
}

function resolvedActiveScore(active, members, context, maximize = false) {
  const base = finite(active?.baseScoreUp);
  const conditional = finite(active?.conditionalScoreUp, base);
  if (!active?.conditionalScoreUp || !active?.condition) return base;
  if (maximize) {
    if (active.condition.kind === "combo") return context.notes > finite(active.condition.threshold) ? conditional : base;
    return dynamicConditionAvailability(active.condition, members, context) > 0 ? conditional : base;
  }
  return base + (conditional - base) * activeConditionalShare(active, members, context);
}

function specialAverages(members, context, suppressLifeRate = false) {
  let supportAveragePct = 0;
  let activationRateAveragePct = 0;
  for (const member of members) {
    const special = member.special;
    const coverage = clamp(finite(special?.duration) / Math.max(1, context.duration), 0, 1);
    supportAveragePct += finite(special?.support) * coverage;
    if (suppressLifeRate && special?.condition?.kind === "life") continue;
    activationRateAveragePct += finite(special?.activationRateUp)
      * coverage
      * dynamicConditionAvailability(special?.condition, members, context);
  }
  return { supportAveragePct, activationRateAveragePct };
}

function activeDetails(members, context, activationRateAveragePct, maximize = false) {
  return members.map((member) => {
    const active = member.active;
    const checks = Math.floor(context.duration / Math.max(0.001, active.interval));
    const probability = clamp(active.probability * (1 + activationRateAveragePct / 100), 0, 1);
    const effectiveProbability = maximize && probability > 0 ? 1 : probability;
    const expectedActivations = checks * effectiveProbability;
    const coverage = clamp(expectedActivations * Math.min(active.duration, active.interval) / context.duration, 0, 1);
    return {
      cardId: member.id,
      interval: active.interval,
      duration: active.duration,
      checks,
      baseProbability: active.probability,
      effectiveProbability,
      expectedActivations,
      coverage,
      scoreUpPct: resolvedActiveScore(active, members, context, maximize),
    };
  });
}

function expectedMaximum(items, probabilityKey) {
  const sorted = [...items].sort((left, right) => right.scoreUpPct - left.scoreUpPct);
  let expected = 0;
  let noStronger = 1;
  for (const item of sorted) {
    const probability = clamp(finite(item[probabilityKey]), 0, 1);
    expected += item.scoreUpPct * probability * noStronger;
    noStronger *= 1 - probability;
  }
  return expected;
}

function applyUnitSupport(details, leaderSupportPct = 0, supportByMember = {}) {
  return details.map((detail) => ({
    ...detail,
    scoreUpPct: detail.scoreUpPct * (1 + (
      finite(leaderSupportPct) + finite(supportByMember?.[detail.cardId])
    ) / 100),
  }));
}

function legacyUnitScoreBonusBreakdown(members, passive, leaderSupportPct = 0, maximize = false) {
  const special = specialAverages(members, UNIT_CONTEXT, false);
  const baseDetails = activeDetails(members, UNIT_CONTEXT, 0, maximize);
  const rateDetails = activeDetails(
    members,
    UNIT_CONTEXT,
    special.activationRateAveragePct,
    maximize,
  );
  const stagesWithSupport = (supportPct) => {
    const activeStage = expectedMaximum(applyUnitSupport(baseDetails, supportPct), "coverage");
    const passiveStage = expectedMaximum(
      applyUnitSupport(baseDetails, supportPct, passive.supportByMember), "coverage",
    );
    // Apply additive support per member before selecting the strongest Active.
    const specialStage = expectedMaximum(
      applyUnitSupport(rateDetails, supportPct + special.supportAveragePct, passive.supportByMember), "coverage",
    );
    return {
      active: round1(activeStage),
      passive: round1(Math.max(0, passiveStage - activeStage)),
      special: round1(Math.max(0, specialStage - passiveStage)),
    };
  };
  const base = stagesWithSupport(0);
  if (!leaderSupportPct) return { outfit: 0, ...base };

  // G/I and E/J retain Active/SP when the leader changes. E/J's Passive does
  // change, so do not force it to the no-leader counterfactual. Evaluate its
  // marginal gain with the leader present; outfit receives the residual.
  // This preserves the legacy total and permits context-dependent targeting
  // competition, but does not yet reproduce the observed E/J Passive values
  // or resolve indirect board attribution.
  const supported = stagesWithSupport(leaderSupportPct);
  const total = (parts) => Object.values(parts).reduce((sum, value) => sum + value, 0);
  const memberParts = { ...base, passive: supported.passive };
  return { outfit: round1(total(supported) - total(memberParts)), ...memberParts };
}

function unitDisplayConditionMet(condition, members) {
  const state = staticConditionState(condition, members);
  if (state !== null) return state;
  if (condition.kind === "combo") return finite(condition.threshold) <= UNIT_DISPLAY_CONTEXT.notes;
  if (condition.kind === "life") return finite(condition.threshold) <= 1000;
  return false;
}

function unitScoreBonusBreakdown(members, passive, leaderSupportPct, maximize, accountBonuses) {
  const inputs = members.map(member => {
    const active = member.active;
    const board = accountBonuses.memberBoards[member.characterId];
    return {
      probability: active.probability, interval: active.interval, duration: active.duration,
      value: unitDisplayConditionMet(active.condition, members) ? active.conditionalScoreUp : active.baseScoreUp,
      support: passive.supportByMember[member.id] ?? 0,
      rate: board?.activationRatePct ?? 0,
      frequency: board?.activationFrequencyPct ?? 0,
      specialSupport: member.special.support, specialDuration: member.special.duration,
      specialRate: unitDisplayConditionMet(member.special.condition, members) ? member.special.activationRateUp : 0,
    };
  });
  const displayed = unitDisplayBonuses(inputs, { leaderBoardSupportPct: accountBonuses.leaderBoardSupportPct, maximize });
  if (leaderSupportPct > 0) {
    // Active/SP invariance is observed for score-support costumes too. Their
    // Outfit/Passive allocation was excluded; retain those legacy estimates.
    const legacy = legacyUnitScoreBonusBreakdown(members, passive, leaderSupportPct, maximize);
    return { ...legacy, active: displayed.active, special: displayed.special };
  }
  return displayed;
}

function exactSameIntervalExpected(group, liveDuration) {
  if (group.length < 2) return expectedMaximum(group, "coverage");
  const interval = group[0].interval;
  let weighted = 0;
  for (let checkAt = interval; checkAt <= liveDuration + 1e-9; checkAt += interval) {
    const maxWindow = Math.min(liveDuration - checkAt, Math.max(...group.map((item) => item.duration)));
    if (maxWindow <= 0) continue;
    const boundaries = new Set([0, maxWindow]);
    for (const item of group) boundaries.add(Math.min(maxWindow, item.duration));
    const sorted = [...boundaries].sort((left, right) => left - right);
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const start = sorted[index];
      const end = sorted[index + 1];
      if (end <= start) continue;
      const activeCandidates = group
        .filter((item) => item.duration > start)
        .map((item) => ({ ...item, checkProbability: item.effectiveProbability }));
      weighted += expectedMaximum(activeCandidates, "checkProbability") * ((end - start) / liveDuration);
    }
  }
  return weighted;
}

function aggregateActiveScore(details, context) {
  const independentPct = expectedMaximum(details, "coverage");
  const groups = new Map();
  for (const detail of details) {
    const key = String(detail.interval);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(detail);
  }
  let correction = 0;
  let duplicateGroups = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    duplicateGroups += 1;
    correction += exactSameIntervalExpected(group, context.duration) - expectedMaximum(group, "coverage");
  }
  const correctedPct = Math.max(0, independentPct + correction);
  return {
    independentPct,
    correctedPct,
    duplicateGroups,
    collisionLossPct: Math.max(0, independentPct - correctedPct),
  };
}

function skillEvaluation(members, context, suppressLifeRate = false, maximize = false) {
  const special = specialAverages(members, context, suppressLifeRate);
  const details = activeDetails(members, context, special.activationRateAveragePct, maximize);
  const noRateDetails = activeDetails(members, context, 0, maximize);
  return {
    special,
    details,
    active: aggregateActiveScore(details, context),
    activeBase: aggregateActiveScore(noRateDetails, context),
  };
}

function contextFromMusic(music, difficulty) {
  const normalizedDifficulty = String(difficulty ?? "EXPERT").toUpperCase();
  if (music) {
    let cache = MUSIC_CONTEXT_CACHE.get(music);
    if (!cache) {
      cache = new Map();
      MUSIC_CONTEXT_CACHE.set(music, cache);
    }
    if (cache.has(normalizedDifficulty)) return cache.get(normalizedDifficulty);
    const context = buildSongContext(music, normalizedDifficulty, music?._chart ?? null);
    const resolved = { ...context, comboMultiplier: averageComboMultiplier(context.notes) };
    cache.set(normalizedDifficulty, resolved);
    return resolved;
  }
  if (GENERIC_CONTEXT_CACHE.has(normalizedDifficulty)) return GENERIC_CONTEXT_CACHE.get(normalizedDifficulty);
  const density = DIFFICULTY_NOTE_DENSITY[normalizedDifficulty] ?? DIFFICULTY_NOTE_DENSITY.EXPERT;
  const resolved = {
    ...UNIT_CONTEXT,
    kind: "generic",
    comboMultiplier: averageComboMultiplier(UNIT_CONTEXT.notes),
    density,
    title: "범용 악곡",
    chartAccuracy: "generic",
    noteTimeline: [],
    skillTimeline: [],
    fever: null,
  };
  GENERIC_CONTEXT_CACHE.set(normalizedDifficulty, resolved);
  return resolved;
}

function averageComboMultiplier(noteCount) {
  const notes = Math.max(1, Math.round(finite(noteCount, 1)));
  if (COMBO_AVERAGE_CACHE.has(notes)) return COMBO_AVERAGE_CACHE.get(notes);
  let before = 0;
  let after = 0;
  for (let note = 1; note <= notes; note += 1) {
    before += 1 + Math.min(10, Math.floor((note - 1) / 100)) / 100;
    after += 1 + Math.min(10, Math.floor(note / 100)) / 100;
  }
  const value = (before + after) / (2 * notes);
  COMBO_AVERAGE_CACHE.set(notes, value);
  return value;
}

function cachedSongKernel(context, playMode, scoreRules) {
  let cache = SONG_KERNEL_CACHE.get(context);
  if (!cache) {
    cache = new Map();
    SONG_KERNEL_CACHE.set(context, cache);
  }
  const key = `${playMode === "manual" ? "manual" : "auto"}|${scoreRules?.source_commit ?? "default"}`;
  if (!cache.has(key)) cache.set(key, songKernel(context, playMode, scoreRules));
  return cache.get(key);
}

function staticSupportForMember(memberId, supportProfile = {}) {
  return finite(supportProfile?.leaderSupportPct)
    + finite(supportProfile?.passiveSupportByMember?.[memberId]);
}

function applyStaticSupport(details, supportProfile = {}, specialSupportAveragePct = 0) {
  return details.map((detail) => {
    const staticSupportPct = staticSupportForMember(detail.cardId, supportProfile);
    return {
      ...detail,
      rawScoreUpPct: detail.scoreUpPct,
      staticSupportPct,
      specialSupportAveragePct,
      scoreUpPct: detail.scoreUpPct * (1 + (staticSupportPct + specialSupportAveragePct) / 100),
    };
  });
}

function songSkillMultiplier(members, context, supportProfile = {}, maximize = false) {
  const special = specialAverages(members, context);
  const rawDetails = activeDetails(members, context, special.activationRateAveragePct, maximize);
  const supported = applyStaticSupport(rawDetails, supportProfile, special.supportAveragePct);
  const { details, active } = uniformSongActiveEvaluation(supported, context);
  return { skillMultiplier: 1 + active.correctedPct / 100, special, details, active };
}

// Without a note timeline, assume uniform note density, but preserve the
// actual Active check intervals, overlaps and clipped end-of-song windows.
// Pairwise collision corrections can produce a lower all-success score than
// the expectation; integrating the joint windows is monotone in probability.
function uniformSongActiveWindows(details, context) {
  let cache = SONG_ACTIVE_WINDOWS_CACHE.get(context);
  if (!cache) {
    cache = new Map();
    SONG_ACTIVE_WINDOWS_CACHE.set(context, cache);
  }
  const key = details.map(d => `${d.interval}:${d.duration}`).join("|");
  if (cache.has(key)) return cache.get(key);
  const events = [];
  details.forEach((detail, index) => {
    const interval = Math.max(0.001, finite(detail.interval, 30));
    const duration = Math.max(0, finite(detail.duration));
    if (!duration) return;
    for (let time = interval; time < context.duration; time += interval) {
      events.push({ time, index, delta: 1 });
      events.push({ time: Math.min(context.duration, time + duration), index, delta: -1 });
    }
  });
  events.sort((a, b) => a.time - b.time);
  const groups = new Map();
  const counts = details.map(() => 0);
  let previous = 0;
  for (const event of events) {
    if (event.time > previous) {
      const signature = counts.join(",");
      const group = groups.get(signature) ?? { counts: [...counts], weight: 0 };
      group.weight += (event.time - previous) / context.duration;
      groups.set(signature, group);
    }
    counts[event.index] += event.delta;
    previous = event.time;
  }
  const windows = [...groups.values()];
  if (cache.size >= 512) cache.delete(cache.keys().next().value);
  cache.set(key, windows);
  return windows;
}

function uniformSongActiveEvaluation(details, context) {
  const windows = uniformSongActiveWindows(details, context);
  const sorted = details.map((detail, index) => ({ ...detail, index }))
    .sort((a, b) => b.scoreUpPct - a.scoreUpPct);
  const coverage = details.map(() => 0);
  let correctedPct = 0;
  for (const window of windows) {
    let noStronger = 1;
    for (const detail of sorted) {
      const count = window.counts[detail.index];
      const probability = count === 1 ? detail.effectiveProbability
        : count > 1 ? 1 - (1 - detail.effectiveProbability) ** count : 0;
      correctedPct += window.weight * detail.scoreUpPct * probability * noStronger;
      coverage[detail.index] += window.weight * probability;
      noStronger *= 1 - probability;
    }
  }
  const resolved = details.map((detail, index) => ({ ...detail, coverage: coverage[index] }));
  const independentPct = expectedMaximum(resolved, "coverage");
  return {
    details: resolved,
    active: { independentPct, correctedPct, collisionLossPct: Math.max(0, independentPct - correctedPct) },
  };
}

function projectSong(baseScore, members, music, difficulty, supportProfile = {}, playMode = "auto", evaluationTarget = "both") {
  if (!music) return null;
  const selected = contextFromMusic(music, difficulty);
  const generic = contextFromMusic(null, difficulty);
  const scoreRules = music?._scoreRules ?? null;
  const needExpected = evaluationTarget !== "potential";
  const needMaximum = evaluationTarget !== "score";
  if (selected.chartAccuracy === "exact" && selected.noteTimeline.length) {
    return timelineSongProjection({
      baseScore,
      members,
      context: selected,
      genericContext: generic,
      supportProfile,
      playMode,
      scoreRules,
      evaluationTarget,
    });
  }
  const selectedExpected = needExpected ? songSkillMultiplier(members, selected, supportProfile) : null;
  const selectedMaximum = needMaximum ? songSkillMultiplier(members, selected, supportProfile, true) : null;
  const manual = playMode === "manual";
  const selectedKernel = cachedSongKernel(selected, playMode, scoreRules);
  const genericKernel = cachedSongKernel(generic, "auto", scoreRules);
  const baseRatio = genericKernel > 0 ? selectedKernel / genericKernel : 1;
  const skillRatio = selectedExpected?.skillMultiplier ?? 1;
  const maxSkillRatio = selectedMaximum?.skillMultiplier ?? 1;
  const averageScore = selectedExpected
    ? Math.max(0, Math.round(baseScore * baseRatio * skillRatio))
    : null;
  const maxScore = selectedMaximum
    ? Math.max(0, Math.round(baseScore * baseRatio * maxSkillRatio))
    : null;
  return {
    averageScore,
    maxScore,
    baseRatio,
    skillRatio,
    maxSkillRatio,
    context: selected,
    playMode: manual ? "manual" : "auto",
    expected: selectedExpected,
    maximum: selectedMaximum,
    specialWindows: [],
    note: selected.chartAccuracy === "master"
      ? "Master의 실제 풀콤보 노트 수를 사용하고, SP 타이밍은 집계 기반으로 근사합니다."
      : manual
        ? "Manual PERFECT FC 근사: 추정 노트와 콤보 보너스를 포함합니다."
        : "AUTO 근사: 추정 노트 수를 사용하고 콤보 보너스를 제외합니다.",
  };
}

function diagnostics(members, context, passiveStates, leader, additionalLeaderConditionMet, projectedDetails = null) {
  const intervalCount = {};
  for (const member of members) intervalCount[member.active.interval] = (intervalCount[member.active.interval] ?? 0) + 1;
  const passiveMap = new Map(passiveStates.map((row) => [row.cardId, row]));
  const fallbackSkill = projectedDetails ? null : skillEvaluation(members, context);
  const activeMap = new Map((projectedDetails ?? fallbackSkill.details).map((row) => [row.cardId, row]));
  const leaderConditions = [
    ...leader.leader.primaryCondition,
    ...(additionalLeaderConditionMet ? leader.leader.additionalCondition : []),
  ].filter((condition) => ["attribute", "group"].includes(condition.kind));
  return members.map((member, index) => {
    const active = activeMap.get(member.id);
    const passive = passiveMap.get(member.id);
    return {
      slot: index + 1,
      cardId: member.id,
      characterName: member.characterName,
      profile: member.profile,
      activeLevel: member.active.level,
      activeDescription: member.active.description,
      passiveLevel: member.passive?.level ?? 1,
      passiveDescription: member.passive?.description ?? "정보 없음",
      specialLevel: member.special.level,
      specialDescription: member.special.description,
      interval: member.active.interval,
      probability: member.active.probability,
      effectiveProbability: active.effectiveProbability,
      duration: member.active.duration,
      checks: active.checks,
      expectedActivations: active.expectedActivations,
      coverage: active.coverage,
      scoreUpPct: active.scoreUpPct,
      activationChecks: active.activationChecks ?? [],
      staticSupportPct: finite(active.staticSupportPct),
      collision: intervalCount[member.active.interval] > 1,
      passiveActive: passive?.active ?? true,
      passiveLabel: passive?.label ?? "활성",
      leaderConditionMatched: leaderConditions.some((condition) => memberMatchesCondition(member, condition)),
    };
  });
}

function normalizeAccountBonuses(accountBonuses = null) {
  const source = accountBonuses ?? DEFAULT_ACCOUNT_BONUSES;
  const explicitPermyriad = source?.memberEnhancementPermyriad;
  const fromPct = finite(source?.memberEnhancementPct) * 100;
  return {
    memberEnhancementPermyriad: Math.max(0, finite(explicitPermyriad, fromPct)),
    boardScoreBonusPct: Math.max(0, finite(source?.boardScoreBonusPct)),
    leaderBoardSupportPct: Math.max(0, finite(source?.leaderBoardSupportPct)),
    memberBoards: Object.fromEntries(Object.entries(source?.memberBoards ?? {}).sort(([a], [b]) => a.localeCompare(b))
      .map(([id, value]) => [id, {
        activationRatePct: Math.max(0, finite(value?.activationRatePct)),
        activationFrequencyPct: Math.max(0, finite(value?.activationFrequencyPct)),
      }])),
  };
}

function accountBonusKey(accountBonuses) {
  const normalized = normalizeAccountBonuses(accountBonuses);
  return JSON.stringify(normalized);
}

function buildDeckComposition({ leader, members, separateRole = true, includePotential = true, accountBonuses = null }) {
  if (!leader || members.length !== 5 || members.some((member) => !member)) return null;
  if (separateRole && members.some((member) => member.characterId === leader.characterId)) return null;

  const normalizedAccountBonuses = normalizeAccountBonuses(accountBonuses);
  const primaryMet = allConditionsMet(leader.leader.primaryCondition, members);
  const baseStats = members.reduce((total, member) => ({
    p: total.p + member.stats.p,
    t: total.t + member.stats.t,
    s: total.s + member.stats.s,
  }), { p: 0, t: 0, s: 0 });
  const passive = passiveEvaluation(members);
  const leaderEffects = { p: 0, t: 0, s: 0, support: 0 };
  if (primaryMet) addEffects(leaderEffects, leader.leader.primaryEffects);
  const additionalMet = primaryMet && allConditionsMet(leader.leader.additionalCondition, members);
  if (additionalMet) addEffects(leaderEffects, leader.leader.additionalEffects);
  const leaderBonusStats = { p: 0, t: 0, s: 0 };
  for (const member of members) {
    for (const stat of ["p", "t", "s"]) {
      leaderBonusStats[stat] += Math.ceil(member.stats[stat] * finite(leaderEffects[stat]) / 100);
    }
  }
  const preEnhancementStats = {
    p: baseStats.p + leaderBonusStats.p + passive.bonusStats.p,
    t: baseStats.t + leaderBonusStats.t + passive.bonusStats.t,
    s: baseStats.s + leaderBonusStats.s + passive.bonusStats.s,
  };
  const enhancementRate = normalizedAccountBonuses.memberEnhancementPermyriad / 10000;
  const deckStats = {
    p: Math.round(preEnhancementStats.p * (1 + enhancementRate)),
    t: Math.round(preEnhancementStats.t * (1 + enhancementRate)),
    s: Math.round(preEnhancementStats.s * (1 + enhancementRate)),
  };
  const baseParameter = baseStats.p + baseStats.t + baseStats.s;
  const leaderPower = leaderBonusStats.p + leaderBonusStats.t + leaderBonusStats.s;
  const passivePower = passive.bonusStats.p + passive.bonusStats.t + passive.bonusStats.s;
  const preEnhancementPower = preEnhancementStats.p + preEnhancementStats.t + preEnhancementStats.s;
  const overallPower = deckStats.p + deckStats.t + deckStats.s;
  const enhancementPower = Math.max(0, overallPower - preEnhancementPower);

  // Unit Score detail is decomposed by mechanic category without double-counting.
  // The legacy same-cycle loss diagnostic is separate from the new display
  // model's normalized overlap calculation and the song's actual timeline.
  const unitSkill = skillEvaluation(members, UNIT_CONTEXT, false);
  const internalActive = unitSkill.active.correctedPct;
  const internalActiveBase = unitSkill.activeBase.correctedPct;
  const rateGain = Math.max(0, internalActive - internalActiveBase);
  const unitBreakdown = unitScoreBonusBreakdown(members, passive, leaderEffects.support, false, normalizedAccountBonuses);
  const active = unitBreakdown.active;
  const activeBase = active;
  const scoreBonusDetail = {
    outfit: unitBreakdown.outfit,
    active: unitBreakdown.active,
    board: round1((unitBreakdown.board ?? 0) + normalizedAccountBonuses.boardScoreBonusPct),
    passive: unitBreakdown.passive,
    special: unitBreakdown.special,
  };
  const scoreBonusPct = round1(Object.values(scoreBonusDetail).reduce((sum, value) => sum + value, 0));
  const unitScore = unitScoreFromDisplayed(overallPower, scoreBonusPct);

  let potentialUnitScore = unitScore;
  let potentialScoreBonusPct = scoreBonusPct;
  if (includePotential) {
    const potentialBreakdown = unitScoreBonusBreakdown(members, passive, leaderEffects.support, true, normalizedAccountBonuses);
    const potentialScoreBonusDetail = {
      outfit: potentialBreakdown.outfit,
      active: potentialBreakdown.active,
      board: round1((potentialBreakdown.board ?? 0) + normalizedAccountBonuses.boardScoreBonusPct),
      passive: potentialBreakdown.passive,
      special: potentialBreakdown.special,
    };
    potentialScoreBonusPct = round1(Object.values(potentialScoreBonusDetail).reduce((sum, value) => sum + value, 0));
    potentialUnitScore = Math.max(unitScore, unitScoreFromDisplayed(overallPower, potentialScoreBonusPct));
  }

  return {
    potentialComputed: includePotential,
    unitBonusModel: leaderEffects.support > 0 ? "legacy-score-support-costume" : UNIT_DISPLAY_MODEL,
    accountBonusKey: accountBonusKey(normalizedAccountBonuses),
    accountBonuses: normalizedAccountBonuses,
    primaryMet,
    baseStats,
    passive,
    leaderEffects,
    additionalMet,
    deckStats,
    baseParameter,
    leaderPower,
    passivePower,
    overallPower,
    enhancementPower,
    unitSkill,
    active,
    activeBase,
    internalActive,
    internalActiveBase,
    rateGain,
    scoreBonusDetail,
    scoreBonusPct,
    unitScore,
    potentialUnitScore,
    potentialScoreBonusPct,
    fullSupportPct: leaderEffects.support + passive.supportPoints,
    supportProfile: {
      leaderSupportPct: leaderEffects.support,
      passiveSupportByMember: passive.supportByMember,
    },
  };
}

export function prepareDeckComposition({ leader, members, separateRole = true, accountBonuses = null }) {
  return buildDeckComposition({ leader, members, separateRole, includePotential: true, accountBonuses });
}

export function evaluateDeck({
  leader,
  members,
  music = null,
  difficulty = "EXPERT",
  playMode = "auto",
  separateRole = true,
  includeDiagnostics = false,
  evaluationTarget = "both",
  accountBonuses = null,
  preparedComposition = null,
}) {
  const needPotential = evaluationTarget !== "score";
  const requestedAccountBonusKey = accountBonusKey(accountBonuses);
  let composition = preparedComposition;
  if (!composition
    || (needPotential && !composition.potentialComputed)
    || composition.accountBonusKey !== requestedAccountBonusKey) {
    composition = buildDeckComposition({
      leader,
      members,
      separateRole,
      includePotential: needPotential,
      accountBonuses,
    });
  }
  if (!composition) return null;

  const songProjection = projectSong(
    // Keep the calibrated power scale, but apply only this song's skills.
    // Displayed Unit bonuses use a different model and cannot be removed by
    // dividing by an aggregate generic skill multiplier.
    composition.overallPower * UNIT_SCORE_K,
    members,
    music,
    difficulty,
    composition.supportProfile,
    playMode,
    evaluationTarget,
  );
  const rankingScore = songProjection?.averageScore ?? composition.unitScore;
  const potentialRankingScore = songProjection?.maxScore ?? composition.potentialUnitScore;
  const diagnosticContext = songProjection?.context ?? UNIT_CONTEXT;
  const projectedDiagnostics = songProjection?.expected?.details ?? songProjection?.maximum?.details ?? null;

  return {
    rankingScore,
    potentialRankingScore,
    unitScore: composition.unitScore,
    potentialUnitScore: composition.potentialUnitScore,
    estimatedSongScore: songProjection?.averageScore ?? null,
    estimatedSongMax: songProjection?.maxScore ?? null,
    songProjection,
    deckStats: composition.deckStats,
    baseStats: composition.baseStats,
    overallPower: composition.overallPower,
    scoreBonusPct: composition.scoreBonusPct,
    potentialScoreBonusPct: composition.potentialScoreBonusPct,
    activeScoreBonus: composition.active,
    activeBaseScoreBonus: composition.activeBase,
    activationRateGain: composition.rateGain,
    supportPct: composition.fullSupportPct + composition.unitSkill.special.supportAveragePct,
    activePassives: composition.passive.activeStates.filter((row) => row.active).length,
    songKernelRatio: songProjection?.baseRatio ?? 1,
    context: diagnosticContext,
    leaderCondition: {
      primaryMet: composition.primaryMet,
      primaryCount: leader.leader.primaryCondition.length,
      additionalMet: composition.additionalMet,
      additionalCount: leader.leader.additionalCondition.length,
    },
    detail: {
      unitBonusModel: composition.unitBonusModel,
      power: {
        memberParameter: composition.baseParameter,
        outfit: composition.leaderPower,
        board: 0,
        passive: composition.passivePower,
        memory: 0,
        enhancement: composition.enhancementPower,
      },
      scoreBonus: composition.scoreBonusDetail,
      collision: {
        groups: composition.unitSkill.active.duplicateGroups,
        lossPct: round1(composition.unitSkill.active.collisionLossPct),
        appliedToUnitActive: false,
      },
    },
    passiveStates: composition.passive.activeStates,
    diagnostics: includeDiagnostics
      ? diagnostics(members, diagnosticContext, composition.passive.activeStates, leader, composition.additionalMet, projectedDiagnostics)
      : [],
  };
}

export function memberIntrinsicValue(member) {
  const parameter = member.stats.p + member.stats.t + member.stats.s;
  const active = member.active.conditionalScoreUp || member.active.baseScoreUp;
  const uptime = member.active.probability * Math.min(member.active.duration / member.active.interval, 1);
  return parameter * (1 + active * uptime / 100);
}

export function memberPotentialValue(member) {
  const parameter = member.stats.p + member.stats.t + member.stats.s;
  const active = member.active.conditionalScoreUp || member.active.baseScoreUp;
  const uptime = Math.min(member.active.duration / member.active.interval, 1);
  return parameter * (1 + active * uptime / 100);
}

export function leaderPotential(leader) {
  const effects = { p: 0, t: 0, s: 0, support: 0 };
  addEffects(effects, leader.leader.primaryEffects);
  addEffects(effects, leader.leader.additionalEffects);
  return effects.p + effects.t + effects.s + effects.support * 1.5;
}
