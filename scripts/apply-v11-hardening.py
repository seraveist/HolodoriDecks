from pathlib import Path
import re

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')

def replace(path, old, new, count=1):
    text = read(path)
    if old not in text:
        raise SystemExit(f'missing replacement in {path}: {old[:120]!r}')
    text = text.replace(old, new, count)
    write(path, text)

def regex_replace(path, pattern, repl, count=1, flags=0):
    text = read(path)
    text2, n = re.subn(pattern, repl, text, count=count, flags=flags)
    if n != count:
        raise SystemExit(f'regex replacement count {n} != {count} in {path}: {pattern}')
    write(path, text2)

# ---------------------------------------------------------------------------
# score.js: targeted passive support, exact diagnostics, engine version.
# ---------------------------------------------------------------------------
replace('js/score.js',
    'import { buildSongContext, songKernel, timelineSongProjection } from "./chart-score.js?v=20260813.1";\n\nexport const SCORE_ENGINE_VERSION = "unit-score-v0.5-potential + song-score-v0.4-chart-timeline";',
    'import { buildSongContext, songKernel, timelineSongProjection } from "./chart-score.js?v=20260813.4";\n\nexport const SCORE_ENGINE_VERSION = "unit-score-v0.6-targeted-support + song-score-v0.5-exact-timeline";')

old = '''function passiveEvaluation(members) {
  const bonusByMember = new Map(members.map((member) => [member.id, { p: 0, t: 0, s: 0 }]));
  const activeStates = [];
  let supportPoints = 0;

  for (const owner of members) {
    const passive = owner.passive;
    if (!passive) continue;
    const active = staticConditionState(passive.condition, members) !== false;
    activeStates.push({ cardId: owner.id, active, label: active ? "활성" : "비활성" });
    if (!active) continue;
    const effect = passive.effect;
    const targets = eligibleTargets(effect.target, owner, members)
      .sort((left, right) => effect.kind === "stat" ? right.stats[effect.stat] - left.stats[effect.stat] : 0)
      .slice(0, effect.target?.count ?? 5);
    if (effect.kind === "support") {
      supportPoints += effect.value * targets.length / 5;
      continue;
    }
    for (const target of targets) {
      if (effect.kind === "selfAll" || effect.kind === "all") {
        for (const stat of ["p", "t", "s"]) bonusByMember.get(target.id)[stat] += target.stats[stat] * effect.value / 100;
      } else if (effect.kind === "stat") {
        bonusByMember.get(target.id)[effect.stat] += target.stats[effect.stat] * effect.value / 100;
      }
    }
  }

  const bonusStats = { p: 0, t: 0, s: 0 };
  for (const bonus of bonusByMember.values()) {
    for (const stat of ["p", "t", "s"]) bonusStats[stat] += bonus[stat];
  }
  return { bonusStats, supportPoints, activeStates };
}'''
new = '''function passiveEvaluation(members) {
  const bonusByMember = new Map(members.map((member) => [member.id, { p: 0, t: 0, s: 0 }]));
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
      .sort((left, right) => effect.kind === "stat" ? right.stats[effect.stat] - left.stats[effect.stat] : 0)
      .slice(0, effect.target?.count ?? 5);
    if (effect.kind === "support") {
      for (const target of targets) {
        supportByMember.set(target.id, (supportByMember.get(target.id) ?? 0) + effect.value);
      }
      continue;
    }
    for (const target of targets) {
      if (effect.kind === "selfAll" || effect.kind === "all") {
        for (const stat of ["p", "t", "s"]) bonusByMember.get(target.id)[stat] += target.stats[stat] * effect.value / 100;
      } else if (effect.kind === "stat") {
        bonusByMember.get(target.id)[effect.stat] += target.stats[effect.stat] * effect.value / 100;
      }
    }
  }

  const bonusStats = { p: 0, t: 0, s: 0 };
  for (const bonus of bonusByMember.values()) {
    for (const stat of ["p", "t", "s"]) bonusStats[stat] += bonus[stat];
  }
  const supportPoints = members.length
    ? [...supportByMember.values()].reduce((sum, value) => sum + finite(value), 0) / members.length
    : 0;
  return { bonusStats, supportPoints, supportByMember, activeStates };
}'''
replace('js/score.js', old, new)

replace('js/score.js',
'''function activeDetails(members, context, activationRateAveragePct, maximize = false) {
  return members.map((member) => {''',
'''function activeDetails(members, context, activationRateAveragePct, maximize = false) {
  return members.map((member) => {''')

insert_after = '''function activeDetails(members, context, activationRateAveragePct, maximize = false) {
  return members.map((member) => {
    const active = member.active;
    const checks = Math.floor(context.duration / Math.max(0.001, active.interval));
    const effectiveProbability = maximize ? 1 : clamp(active.probability * (1 + activationRateAveragePct / 100), 0, 1);
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
'''
if insert_after not in read('js/score.js'):
    raise SystemExit('activeDetails block mismatch')
replace('js/score.js', insert_after, insert_after + '''
function memberSupportPct(supportByMember, cardId) {
  if (supportByMember instanceof Map) return finite(supportByMember.get(cardId));
  return finite(supportByMember?.[cardId]);
}

function supportedDetails(details, globalSupportPct = 0, supportByMember = null, extraSupportPct = 0) {
  return details.map((detail) => ({
    ...detail,
    passiveSupportPct: memberSupportPct(supportByMember, detail.cardId),
    scoreUpPct: finite(detail.scoreUpPct) * (1 + (
      finite(globalSupportPct) + memberSupportPct(supportByMember, detail.cardId) + finite(extraSupportPct)
    ) / 100),
  }));
}
''')

replace('js/score.js',
'''function skillEvaluation(members, context, suppressLifeRate = false, maximize = false) {
  const special = specialAverages(members, context, suppressLifeRate);
  const details = activeDetails(members, context, special.activationRateAveragePct, maximize);
  const noRateDetails = activeDetails(members, context, 0, maximize);
  return {
    special,
    details,
    active: aggregateActiveScore(details, context),
    activeBase: aggregateActiveScore(noRateDetails, context),
  };
}''',
'''function skillEvaluation(members, context, suppressLifeRate = false, maximize = false) {
  const special = specialAverages(members, context, suppressLifeRate);
  const details = activeDetails(members, context, special.activationRateAveragePct, maximize);
  const noRateDetails = activeDetails(members, context, 0, maximize);
  return {
    special,
    details,
    noRateDetails,
    active: aggregateActiveScore(details, context),
    activeBase: aggregateActiveScore(noRateDetails, context),
  };
}

function aggregateSupportedActive(details, context, globalSupportPct = 0, supportByMember = null, extraSupportPct = 0) {
  return aggregateActiveScore(supportedDetails(details, globalSupportPct, supportByMember, extraSupportPct), context);
}''')

replace('js/score.js',
'''function songSkillMultiplier(members, context, fullSupportPct, maximize = false) {
  const special = specialAverages(members, context);
  const details = activeDetails(members, context, special.activationRateAveragePct, maximize);
  const active = aggregateActiveScore(details, context);
  const supportedActive = active.correctedPct * (1 + (fullSupportPct + special.supportAveragePct) / 100);
  return { skillMultiplier: 1 + supportedActive / 100, special, details, active };
}

function projectSong(unitScore, members, music, difficulty, fullSupportPct, playMode = "auto", evaluationTarget = "both") {''',
'''function songSkillMultiplier(members, context, leaderSupportPct, passiveSupportByMember, maximize = false) {
  const special = specialAverages(members, context);
  const details = activeDetails(members, context, special.activationRateAveragePct, maximize);
  const active = aggregateSupportedActive(
    details,
    context,
    leaderSupportPct,
    passiveSupportByMember,
    special.supportAveragePct,
  );
  return { skillMultiplier: 1 + active.correctedPct / 100, special, details, active };
}

function projectSong(unitScore, members, music, difficulty, leaderSupportPct, passiveSupportByMember, playMode = "auto", evaluationTarget = "both") {''')

replace('js/score.js',
'''  const genericExpected = songSkillMultiplier(members, generic, fullSupportPct);''',
'''  const genericExpected = songSkillMultiplier(members, generic, leaderSupportPct, passiveSupportByMember);''')
replace('js/score.js',
'''      fullSupportPct,
      playMode,''',
'''      leaderSupportPct,
      passiveSupportByMember,
      playMode,''')
replace('js/score.js',
'''  const selectedExpected = needExpected ? songSkillMultiplier(members, selected, fullSupportPct) : null;
  const selectedMaximum = needMaximum ? songSkillMultiplier(members, selected, fullSupportPct, true) : null;''',
'''  const selectedExpected = needExpected
    ? songSkillMultiplier(members, selected, leaderSupportPct, passiveSupportByMember)
    : null;
  const selectedMaximum = needMaximum
    ? songSkillMultiplier(members, selected, leaderSupportPct, passiveSupportByMember, true)
    : null;''')

old = '''  const unitSkill = skillEvaluation(members, UNIT_CONTEXT, true);
  const active = unitSkill.active.correctedPct;
  const activeBase = unitSkill.activeBase.correctedPct;
  const rateGain = Math.max(0, active - activeBase);
  const scoreBonusDetail = {
    outfit: round1(active * leaderEffects.support / 100),
    active: round1(active),
    board: 0,
    passive: round1(active * passive.supportPoints / 100),
    special: round1(activeBase * unitSkill.special.supportAveragePct / 100 + rateGain),
  };
  const scoreBonusPct = round1(Object.values(scoreBonusDetail).reduce((sum, value) => sum + value, 0));
  const unitScore = unitScoreFromDisplayed(overallPower, scoreBonusPct);

  let potentialUnitScore = unitScore;
  let potentialScoreBonusPct = scoreBonusPct;
  if (includePotential) {
    const potentialUnitSkill = skillEvaluation(members, UNIT_CONTEXT, true, true);
    const potentialActive = potentialUnitSkill.active.correctedPct;
    const potentialActiveBase = potentialUnitSkill.activeBase.correctedPct;
    const potentialRateGain = Math.max(0, potentialActive - potentialActiveBase);
    const potentialScoreBonusDetail = {
      outfit: round1(potentialActive * leaderEffects.support / 100),
      active: round1(potentialActive),
      board: 0,
      passive: round1(potentialActive * passive.supportPoints / 100),
      special: round1(potentialActiveBase * potentialUnitSkill.special.supportAveragePct / 100 + potentialRateGain),
    };
    potentialScoreBonusPct = round1(Object.values(potentialScoreBonusDetail).reduce((sum, value) => sum + value, 0));
    potentialUnitScore = Math.max(unitScore, unitScoreFromDisplayed(overallPower, potentialScoreBonusPct));
  }'''
new = '''  const unitSkill = skillEvaluation(members, UNIT_CONTEXT, true);
  const baseStep = round1(unitSkill.activeBase.correctedPct);
  const leaderStep = round1(aggregateSupportedActive(
    unitSkill.noRateDetails,
    UNIT_CONTEXT,
    leaderEffects.support,
  ).correctedPct);
  const passiveStep = round1(aggregateSupportedActive(
    unitSkill.noRateDetails,
    UNIT_CONTEXT,
    leaderEffects.support,
    passive.supportByMember,
  ).correctedPct);
  const fullStep = round1(aggregateSupportedActive(
    unitSkill.details,
    UNIT_CONTEXT,
    leaderEffects.support,
    passive.supportByMember,
    unitSkill.special.supportAveragePct,
  ).correctedPct);
  const active = fullStep;
  const activeBase = baseStep;
  const rateGain = Math.max(0, unitSkill.active.correctedPct - unitSkill.activeBase.correctedPct);
  const scoreBonusDetail = {
    outfit: round1(leaderStep - baseStep),
    active: baseStep,
    board: 0,
    passive: round1(passiveStep - leaderStep),
    special: round1(fullStep - passiveStep),
  };
  const scoreBonusPct = fullStep;
  const unitScore = unitScoreFromDisplayed(overallPower, scoreBonusPct);

  let potentialUnitScore = unitScore;
  let potentialScoreBonusPct = scoreBonusPct;
  if (includePotential) {
    const potentialUnitSkill = skillEvaluation(members, UNIT_CONTEXT, true, true);
    const potentialBase = round1(potentialUnitSkill.activeBase.correctedPct);
    const potentialLeader = round1(aggregateSupportedActive(
      potentialUnitSkill.noRateDetails,
      UNIT_CONTEXT,
      leaderEffects.support,
    ).correctedPct);
    const potentialPassive = round1(aggregateSupportedActive(
      potentialUnitSkill.noRateDetails,
      UNIT_CONTEXT,
      leaderEffects.support,
      passive.supportByMember,
    ).correctedPct);
    const potentialFull = round1(aggregateSupportedActive(
      potentialUnitSkill.details,
      UNIT_CONTEXT,
      leaderEffects.support,
      passive.supportByMember,
      potentialUnitSkill.special.supportAveragePct,
    ).correctedPct);
    potentialScoreBonusPct = potentialFull;
    potentialUnitScore = Math.max(unitScore, unitScoreFromDisplayed(overallPower, potentialScoreBonusPct));
  }'''
replace('js/score.js', old, new)

replace('js/score.js',
'''    fullSupportPct: leaderEffects.support + passive.supportPoints,
  };''',
'''    fullSupportPct: leaderEffects.support + passive.supportPoints,
    leaderSupportPct: leaderEffects.support,
    passiveSupportByMember: passive.supportByMember,
  };''')

replace('js/score.js',
'''    composition.fullSupportPct,
    playMode,''',
'''    composition.leaderSupportPct,
    composition.passiveSupportByMember,
    playMode,''')

# Exact diagnostics should reuse the exact timeline details actually used for scoring.
replace('js/score.js',
'''function diagnostics(members, context, passiveStates, leader, additionalLeaderConditionMet) {
  const intervalCount = {};
  for (const member of members) intervalCount[member.active.interval] = (intervalCount[member.active.interval] ?? 0) + 1;
  const passiveMap = new Map(passiveStates.map((row) => [row.cardId, row]));
  const skill = skillEvaluation(members, context);
  const activeMap = new Map(skill.details.map((row) => [row.cardId, row]));''',
'''function diagnostics(members, context, passiveStates, leader, additionalLeaderConditionMet, exactDetails = null) {
  const intervalCount = {};
  for (const member of members) intervalCount[member.active.interval] = (intervalCount[member.active.interval] ?? 0) + 1;
  const passiveMap = new Map(passiveStates.map((row) => [row.cardId, row]));
  const skillDetails = Array.isArray(exactDetails) && exactDetails.length
    ? exactDetails
    : skillEvaluation(members, context).details;
  const activeMap = new Map(skillDetails.map((row) => [row.cardId, row]));''')

replace('js/score.js',
'''    diagnostics: includeDiagnostics
      ? diagnostics(members, diagnosticContext, composition.passive.activeStates, leader, composition.additionalMet)
      : [],''',
'''    diagnostics: includeDiagnostics
      ? diagnostics(
        members,
        diagnosticContext,
        composition.passive.activeStates,
        leader,
        composition.additionalMet,
        songProjection?.context?.chartAccuracy === "exact"
          ? (songProjection?.expected?.details ?? songProjection?.maximum?.details ?? null)
          : null,
      )
      : [],''')

# ---------------------------------------------------------------------------
# chart-score.js: apply targeted passive support per Active owner.
# ---------------------------------------------------------------------------
replace('js/chart-score.js',
'''function probabilityAny(events) {
  return 1 - [...events].reduce((none, event) => none * (1 - clamp(finite(event.probability), 0, 1)), 1);
}

function timelineSkillEvaluation(members, context, fullSupportPct, playMode, scoreRules, maximize = false) {''',
'''function probabilityAny(events) {
  return 1 - [...events].reduce((none, event) => none * (1 - clamp(finite(event.probability), 0, 1)), 1);
}

function memberSupportPct(supportByMember, cardId) {
  if (supportByMember instanceof Map) return finite(supportByMember.get(cardId));
  return finite(supportByMember?.[cardId]);
}

function timelineSkillEvaluation(
  members,
  context,
  leaderSupportPct,
  passiveSupportByMember,
  playMode,
  scoreRules,
  maximize = false,
) {''')

replace('js/chart-score.js',
'''    const weight = scoring.weights[index] ?? 0;
    const activePct = expectedMaximum(active);
    const support = finite(fullSupportPct) + supportAt(windows, time);
    const supportedPct = activePct * (1 + support / 100);
    skillWeight += weight * (1 + supportedPct / 100);''',
'''    const weight = scoring.weights[index] ?? 0;
    const specialSupport = supportAt(windows, time);
    const supportedEvents = [...active].map((event) => ({
      ...event,
      scoreUpPct: finite(event.scoreUpPct) * (1 + (
        finite(leaderSupportPct)
        + memberSupportPct(passiveSupportByMember, event.cardId)
        + specialSupport
      ) / 100),
    }));
    const activePct = expectedMaximum(supportedEvents);
    skillWeight += weight * (1 + activePct / 100);''')

replace('js/chart-score.js',
'''      scoreUpPct: member.active.conditionalScoreUp || member.active.baseScoreUp,
    };''',
'''      scoreUpPct: member.active.conditionalScoreUp || member.active.baseScoreUp,
      passiveSupportPct: memberSupportPct(passiveSupportByMember, member.id),
    };''')

replace('js/chart-score.js',
'''  fullSupportPct,
  playMode = "auto",''',
'''  leaderSupportPct = 0,
  passiveSupportByMember = null,
  playMode = "auto",''')
replace('js/chart-score.js',
'''    ? timelineSkillEvaluation(members, context, fullSupportPct, playMode, scoreRules, false)
    : null;
  const maximum = needMaximum
    ? timelineSkillEvaluation(members, context, fullSupportPct, playMode, scoreRules, true)''',
'''    ? timelineSkillEvaluation(members, context, leaderSupportPct, passiveSupportByMember, playMode, scoreRules, false)
    : null;
  const maximum = needMaximum
    ? timelineSkillEvaluation(members, context, leaderSupportPct, passiveSupportByMember, playMode, scoreRules, true)''')

# ---------------------------------------------------------------------------
# Recommend policy: larger dynamic exact-order shortlist and exhaustive small pools.
# ---------------------------------------------------------------------------
replace('js/recommend.js',
'''const DEFAULT_RESULT_COUNT = 5;
''',
'''const DEFAULT_RESULT_COUNT = 5;
const MAX_SHORTLIST_COUNT = 60;

export function exactOrderShortlistSize({ ownedCount = 0, noteCount = 0 } = {}) {
  const owned = Math.max(0, Number(ownedCount) || 0);
  const notes = Math.max(0, Number(noteCount) || 0);
  // With a fixed leader and <= 8 candidate members, C(8,5)=56, so keeping 60
  // candidates makes the staged search exhaustive before the 5! order pass.
  if (owned <= 9) return MAX_SHORTLIST_COUNT;
  let limit = owned <= 20 ? 36 : owned <= 35 ? 28 : owned <= 50 ? 24 : 20;
  if (notes >= 1500) limit = Math.min(limit, 16);
  else if (notes >= 1000) limit = Math.min(limit, 20);
  return Math.max(10, limit);
}
''')
replace('js/recommend.js',
'''  const normalizedResultCount = Math.max(1, Math.min(10, Number(resultCount) || DEFAULT_RESULT_COUNT));''',
'''  const normalizedResultCount = Math.max(1, Math.min(MAX_SHORTLIST_COUNT, Number(resultCount) || DEFAULT_RESULT_COUNT));''')

# ---------------------------------------------------------------------------
# Optimizer worker/core/client.
# ---------------------------------------------------------------------------
write('js/optimizer-core.js', '''import { exactOrderShortlistSize, optimizeOwnedDeck } from "./recommend.js?v=20260813.4";
import { optimizeRecommendationOrders } from "./order.js?v=20260813.4";

export function runOptimizer({
  preparedCards,
  ownedCardIds,
  currentMembers,
  lockedSlots,
  music = null,
  chart = null,
  scoreRules = null,
  difficulty = "EXPERT",
  playMode = "auto",
  simulationTarget = "score",
  separateRole = true,
  resultCount = 5,
}) {
  const exactMusic = music ? { ...music, _chart: chart, _scoreRules: scoreRules } : null;
  const searchChart = chart ? { ...chart, metadata: null } : null;
  const searchMusic = music ? { ...music, _chart: searchChart, _scoreRules: scoreRules } : null;
  const hasExactOrder = Boolean(chart?.metadata?.skills?.length);
  const shortlistCount = hasExactOrder
    ? exactOrderShortlistSize({ ownedCount: ownedCardIds?.length, noteCount: chart?.metadata?.notes?.length })
    : resultCount;

  let result = optimizeOwnedDeck({
    preparedCards,
    ownedCardIds,
    currentMembers,
    lockedSlots,
    music: searchMusic,
    difficulty,
    playMode,
    simulationTarget,
    separateRole,
    resultCount: shortlistCount,
  });
  if (result.ok) {
    result = optimizeRecommendationOrders({
      recommendation: result,
      preparedCards,
      currentMembers,
      lockedSlots,
      music: exactMusic,
      difficulty,
      playMode,
      simulationTarget,
      separateRole,
      resultCount,
    });
  }
  return { ...result, shortlistCount, exactOrder: hasExactOrder };
}
''')

write('js/optimizer-worker.js', '''import { runOptimizer } from "./optimizer-core.js?v=20260813.4";

self.addEventListener("message", (event) => {
  try {
    const result = runOptimizer(event.data);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error?.stack || error?.message || error) });
  }
});
''')

write('js/optimizer-client.js', '''import { runOptimizer } from "./optimizer-core.js?v=20260813.4";

const WORKER_TIMEOUT_MS = 120_000;

export async function runOptimizerWithWorker(payload) {
  if (typeof Worker === "undefined") return { ...runOptimizer(payload), executionMode: "main-thread" };
  let worker;
  try {
    worker = new Worker(new URL("./optimizer-worker.js?v=20260813.4", import.meta.url), { type: "module" });
  } catch {
    return { ...runOptimizer(payload), executionMode: "main-thread" };
  }

  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("optimizer worker timeout")), WORKER_TIMEOUT_MS);
      worker.addEventListener("message", (event) => {
        clearTimeout(timeout);
        if (event.data?.ok) resolve(event.data.result);
        else reject(new Error(event.data?.error || "optimizer worker failed"));
      }, { once: true });
      worker.addEventListener("error", (event) => {
        clearTimeout(timeout);
        reject(event.error || new Error(event.message || "optimizer worker error"));
      }, { once: true });
      worker.postMessage(payload);
    });
    return { ...result, executionMode: "worker" };
  } catch (error) {
    console.warn("Optimizer worker failed; falling back to the main thread.", error);
    return { ...runOptimizer(payload), executionMode: "main-thread-fallback" };
  } finally {
    worker.terminate();
  }
}
''')

# app.js worker integration and smaller structured-clone payload.
replace('js/app.js',
'''import { optimizeOwnedDeck } from "./recommend.js?v=20260813.1";
import { optimizeRecommendationOrders } from "./order.js?v=20260813.1";
import { prepareScoreCards } from "./score.js?v=20260813.1";''',
'''import { prepareScoreCards } from "./score.js?v=20260813.4";
import { runOptimizerWithWorker } from "./optimizer-client.js?v=20260813.4";''')
replace('js/app.js', 'const APP_VERSION = "20260812.3";', 'const APP_VERSION = "20260813.4";')

pattern = re.escape('''    const preparedCards = prepareScoreCards(data.cards, data.charactersById, state.ownedCardSettings, {
    levelMode: state.levelMode,
  });
  const song = state.musicId ? data.musicById.get(state.musicId) : null;
  const chart = song ? await loadSelectedChart(chartResources, song.id, state.difficulty) : null;
  const exactMusic = song ? { ...song, _chart: chart, _scoreRules: chartResources.scoreRules } : null;
  const searchChart = chart ? { ...chart, metadata: null } : null;
  const searchMusic = song ? { ...song, _chart: searchChart, _scoreRules: chartResources.scoreRules } : null;
  const hasExactOrder = Boolean(chart?.metadata?.skills?.length);
  let result = optimizeOwnedDeck({
    preparedCards,
    ownedCardIds: state.ownedCardIds,
    currentMembers: state.members,
    lockedSlots: state.lockedSlots,
    music: searchMusic,
    difficulty: state.difficulty,
    playMode: state.playMode,
    simulationTarget: state.simulationTarget,
    separateRole: state.separateRole,
    resultCount: hasExactOrder ? Math.min(10, RESULT_COUNT * 2) : RESULT_COUNT,
  });
  if (result.ok) {
    result = optimizeRecommendationOrders({
      recommendation: result,
      preparedCards,
      currentMembers: state.members,
      lockedSlots: state.lockedSlots,
      music: exactMusic,
      difficulty: state.difficulty,
      playMode: state.playMode,
      simulationTarget: state.simulationTarget,
      separateRole: state.separateRole,
      resultCount: RESULT_COUNT,
    });
  }
''')
replacement = '''    const ownedSet = new Set(state.ownedCardIds);
    const preparedCards = prepareScoreCards(
      data.cards.filter((card) => ownedSet.has(card.id)),
      data.charactersById,
      state.ownedCardSettings,
      { levelMode: state.levelMode },
    );
    const song = state.musicId ? data.musicById.get(state.musicId) : null;
    const chart = song ? await loadSelectedChart(chartResources, song.id, state.difficulty) : null;
    const result = await runOptimizerWithWorker({
      preparedCards,
      ownedCardIds: state.ownedCardIds,
      currentMembers: state.members,
      lockedSlots: state.lockedSlots,
      music: song,
      chart,
      scoreRules: chartResources.scoreRules,
      difficulty: state.difficulty,
      playMode: state.playMode,
      simulationTarget: state.simulationTarget,
      separateRole: state.separateRole,
      resultCount: RESULT_COUNT,
    });
'''
regex_replace('js/app.js', pattern, replacement)

# ---------------------------------------------------------------------------
# Runtime Exact integrity: exact Content-Range + SHA fail-closed.
# ---------------------------------------------------------------------------
replace('js/chart-data.js',
'''  if (response.status !== 206) {
    try { await response.body?.cancel(); } catch { /* ignore */ }
    return null;
  }

  try {
    const text = await response.text();''',
'''  const expectedRange = `bytes ${start}-${end}/`;
  const contentRange = String(response.headers?.get?.("content-range") ?? "");
  if (response.status !== 206 || !contentRange.startsWith(expectedRange)) {
    try { await response.body?.cancel(); } catch { /* ignore */ }
    return null;
  }

  try {
    const text = await response.text();''')
replace('js/chart-data.js',
'''      const actualSha = await sha256Hex(text);
      if (actualSha && actualSha !== expectedSha) return null;''',
'''      const actualSha = await sha256Hex(text);
      if (!actualSha || actualSha !== expectedSha) return null;''')

# ---------------------------------------------------------------------------
# Runtime index reconciliation after Master updates.
# ---------------------------------------------------------------------------
write('scripts/reconcile-exact-runtime-index.mjs', '''import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const chartPath = path.join(root, "data/generated/chart-index.json");
const runtimePath = path.join(root, "data/generated/exact-runtime-index.json");

const [chartIndex, runtimeIndex] = await Promise.all([
  fs.readFile(chartPath, "utf8").then(JSON.parse),
  fs.readFile(runtimePath, "utf8").then(JSON.parse),
]);

function matches(runtime, chart) {
  return runtime && chart
    && String(runtime.musicId) === String(chart.musicId)
    && String(runtime.difficulty).toUpperCase() === String(chart.difficulty).toUpperCase()
    && String(runtime.chartHash ?? "") === String(chart.chartHash ?? "")
    && Number(runtime.fullComboNoteCount) === Number(chart.fullComboNoteCount)
    && Number(runtime.normalNoteCount) === Number(chart.normalNoteCount)
    && (!runtime.chartAssetId || !chart.chartAssetId || String(runtime.chartAssetId) === String(chart.chartAssetId));
}

const kept = {};
const dropped = [];
for (const [key, runtime] of Object.entries(runtimeIndex.charts ?? {})) {
  const chart = chartIndex.charts?.[key];
  if (matches(runtime, chart)) kept[key] = runtime;
  else dropped.push(key);
}

const next = {
  ...runtimeIndex,
  currentMasterSourceCommit: chartIndex.source_commit ?? null,
  currentMasterChartCount: Number(chartIndex.chart_count) || Object.keys(chartIndex.charts ?? {}).length,
  runtimeExactCount: Object.keys(kept).length,
  droppedCurrentMasterCount: dropped.length,
  droppedCurrentMasterKeys: dropped,
  charts: kept,
};
await fs.writeFile(runtimePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
console.log(`runtime exact reconcile: ${next.runtimeExactCount}/${next.currentMasterChartCount}, dropped ${dropped.length}`);
''')

# ---------------------------------------------------------------------------
# Tests: targeted support, exhaustive staged-vs-bruteforce, integrity headers.
# ---------------------------------------------------------------------------
# Runtime loader mock gains headers and SHA; use WebCrypto in Node 24.
replace('scripts/test-exact-runtime-source.mjs',
'''  return {
    status: 206,
    text: async () => sourceText,
    body: { cancel: async () => {} },
  };''',
'''  return {
    status: 206,
    headers: { get: (name) => String(name).toLowerCase() === "content-range"
      ? `bytes 10-${10 + Buffer.byteLength(sourceText) - 1}/999999`
      : null },
    text: async () => sourceText,
    body: { cancel: async () => {} },
  };''')
# Add expected object SHA to runtime entry.
replace('scripts/test-exact-runtime-source.mjs',
'''  const runtimeEntry = {
    ...chartEntry,
    start: 10,
    end: 10 + Buffer.byteLength(sourceText) - 1,
    length: Buffer.byteLength(sourceText),
  };''',
'''  const objectSha256 = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sourceText))
    .then((digest) => [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
  const runtimeEntry = {
    ...chartEntry,
    start: 10,
    end: 10 + Buffer.byteLength(sourceText) - 1,
    length: Buffer.byteLength(sourceText),
    objectSha256,
  };''')

# Targeted passive support regression appended before final console.log.
replace('scripts/test-chart-scoring.mjs',
'''console.log("chart timeline scoring tests: OK");''',
'''// Targeted passive Active-effect support must benefit only the targeted Active owner.
{
  const targeted = member("targeted", { activeScore: 120, interval: 15, duration: 10 });
  targeted.groupings = new Set(["grp-target"]);
  const weak = member("weak", { activeScore: 20, interval: 15, duration: 10 });
  const supporter = member("supporter");
  supporter.passive = {
    level: 1,
    description: "targeted support",
    condition: null,
    effect: { kind: "support", value: 100, target: { kind: "group", value: "grp-target", count: 1 } },
  };
  const filler1 = member("f1");
  const filler2 = member("f2");
  const exact = {
    fullComboNoteCount: 11,
    chartHash: "target-support",
    metadata: exactChart().metadata,
  };
  const exactSong = { ...song, _chart: exact };
  const strongTarget = evaluateDeck({ leader: L, members: [targeted, weak, supporter, filler1, filler2], music: exactSong, playMode: "manual" });
  targeted.groupings = new Set();
  weak.groupings = new Set(["grp-target"]);
  const weakTarget = evaluateDeck({ leader: L, members: [targeted, weak, supporter, filler1, filler2], music: exactSong, playMode: "manual" });
  assert.ok(strongTarget.rankingScore > weakTarget.rankingScore,
    `targeted support should favor the stronger Active owner (${strongTarget.rankingScore} > ${weakTarget.rankingScore})`);
}

console.log("chart timeline scoring tests: OK");''')

write('scripts/test-optimizer-exhaustive.mjs', '''import assert from "node:assert/strict";
import { runOptimizer } from "../js/optimizer-core.js";
import { evaluateDeck } from "../js/score.js";

function member(id, specialSupport = 0) {
  return {
    id, characterId: `c-${id}`, characterName: id, attribute: 1, groupings: new Set(),
    profile: { level: 80, currentLevel: 80, maxLevel: 80, potential: 0, levelMode: "current" },
    stats: { p: 900 + id.charCodeAt(0) * 3, t: 900, s: 900 }, enhancementPermyriad: 0, passive: null,
    active: { level: 1, interval: 15, probability: 0.8, duration: 10, baseScoreUp: 50, conditionalScoreUp: 50, condition: null, description: "" },
    special: { level: 1, duration: 20, support: specialSupport, activationRateUp: 0, condition: null, description: "" },
  };
}
const leader = { id: "L", characterId: "leader", characterName: "Leader", leader: {
  primaryCondition: [], primaryEffects: { p: 0, t: 0, s: 0, support: 0 },
  additionalCondition: [], additionalEffects: { p: 0, t: 0, s: 0, support: 0 }, description: "",
}};
const members = ["A","B","C","D","E","F","G","H"].map((id, index) => member(id, index === 7 ? 120 : 0));
const preparedCards = new Map([[leader.id, leader], ...members.map((row) => [row.id, row])]);
const notes = Array.from({ length: 80 }, (_, i) => ["tap", 10 + i * 0.8]);
const chart = { fullComboNoteCount: notes.length, chartHash: "exhaustive", metadata: {
  notes,
  skills: [1,2,3,4,5].map((slot, i) => ({ slot, time: 8 + i * 15, combo: i * 15 })),
  fever: null,
}};
const music = { id: "mx", title: "Exhaustive", playing_seconds: 90, live_score_coefficient_permil: 5 };

function* combinations(rows, size, start = 0, selected = []) {
  if (selected.length === size) { yield [...selected]; return; }
  for (let i = start; i <= rows.length - (size - selected.length); i += 1) {
    selected.push(rows[i]); yield* combinations(rows, size, i + 1, selected); selected.pop();
  }
}
function* permutations(rows, selected = []) {
  if (!rows.length) { yield [...selected]; return; }
  for (let i = 0; i < rows.length; i += 1) {
    const next = rows.slice(); const [value] = next.splice(i, 1);
    selected.push(value); yield* permutations(next, selected); selected.pop();
  }
}
let brute = null;
const exactMusic = { ...music, _chart: chart };
for (const combo of combinations(members, 5)) {
  for (const order of permutations(combo)) {
    const score = evaluateDeck({ leader, members: order, music: exactMusic, difficulty: "EXPERT", playMode: "manual", separateRole: true, evaluationTarget: "score" });
    if (!brute || score.rankingScore > brute.score.rankingScore) brute = { order, score };
  }
}
const staged = runOptimizer({
  preparedCards,
  ownedCardIds: ["L", ...members.map((row) => row.id)],
  currentMembers: ["L", null, null, null, null, null],
  lockedSlots: [true, false, false, false, false, false],
  music,
  chart,
  scoreRules: null,
  difficulty: "EXPERT",
  playMode: "manual",
  simulationTarget: "score",
  separateRole: true,
  resultCount: 1,
});
assert.equal(staged.ok, true);
assert.equal(staged.shortlistCount, 60);
assert.equal(staged.score.rankingScore, brute.score.rankingScore,
  `staged ${staged.score.rankingScore} != exhaustive ${brute.score.rankingScore}`);
assert.deepEqual(staged.members, ["L", ...brute.order.map((row) => row.id)]);
console.log(`optimizer exhaustive regression: OK (${staged.score.rankingScore})`);
''')

# ---------------------------------------------------------------------------
# Manual mode labeling: it uses PERFECT judgement coefficients.
# ---------------------------------------------------------------------------
replace('index.html', 'Manual FC 근사', 'Manual PERFECT FC')
replace('js/i18n.js', '"play.manual": "Manual FC 근사"', '"play.manual": "Manual PERFECT FC"')
replace('js/i18n.js', '"play.manual": "Manual FC Approx."', '"play.manual": "Manual PERFECT FC"') if '"play.manual": "Manual FC Approx."' in read('js/i18n.js') else None
replace('js/i18n.js', '"play.manual": "Manual FC近似"', '"play.manual": "Manual PERFECT FC"') if '"play.manual": "Manual FC近似"' in read('js/i18n.js') else None
replace('js/ui/result.js', '"Manual FC"', '"Manual PERFECT FC"')
replace('js/score.js', '"Manual FC 근사: 추정 노트와 콤보 보너스를 포함합니다."', '"Manual PERFECT FC 근사: 추정 노트와 콤보 보너스를 포함합니다."')

# ---------------------------------------------------------------------------
# App/cache versions.
# ---------------------------------------------------------------------------
replace('index.html', 'data-app-version="20260812.3"', 'data-app-version="20260813.4"')
replace('index.html', 'js/app.js?v=20260813.3', 'js/app.js?v=20260813.4') if 'js/app.js?v=20260813.3' in read('index.html') else None
# If app script uses another old query, normalize it.
regex_replace('index.html', r'js/app\.js\?v=202608\d+\.\d+', 'js/app.js?v=20260813.4')

# ---------------------------------------------------------------------------
# Version 1.1.0 and documentation.
# ---------------------------------------------------------------------------
write('VERSION', '1.1.0\n')
replace('pyproject.toml', 'version = "1.0.0"', 'version = "1.1.0"')
replace('src/holodori_decksim/__init__.py', '__version__ = "1.0.0"', '__version__ = "1.1.0"')

readme = read('README.md')
readme = readme.replace('**v1.0.0**', '**v1.1.0**', 1)
readme = readme.replace('## v1.0.0 주요 기능', '## v1.1.0 주요 기능', 1)
readme = re.sub(r'## 채보 정확도 계층\n.*?## v1 계산 범위와 제한', '''## 채보 정확도 계층

현재 v1.1.0은 다음 순서로 계산합니다.

```text
Local Exact metadata
  ↓ 없으면
Pinned Runtime Exact source
  ↓ 없거나 검증/로드 실패 시
Master chart
  ↓ 없으면
Estimated
```

현재 Master 728개 중 Runtime Exact index와 안전 키가 일치하는 채보는 **703개**이며, 나머지 25개는 Master/fallback을 사용합니다. Runtime Exact는 선택한 채보 객체만 HTTP Range로 lazy-load하고 `Content-Range`, byte length, per-object SHA-256, `chartHash`, 노트 수와 asset id를 다시 검증합니다. 검증에 실패하면 Exact로 계산하지 않습니다.

Manual 모드는 **PERFECT 판정 계수 + Full Combo**를 기준으로 하므로 UI에는 `Manual PERFECT FC`로 표기합니다.

## v1 계산 범위와 제한''', readme, count=1, flags=re.S)
readme = readme.replace('공개 v1.0.0에서 실제 노트별 시각과 SP 발동 순서는 Local Exact metadata가 확보된 악곡/난이도에서만 사용합니다. 그 외에는 Master 풀콤보 수와 집계형 SP 모델로 fallback합니다.', '실제 노트별 시각과 SP 발동 순서는 Local/Runtime Exact metadata가 검증된 악곡·난이도에서 사용하며, 그 외에는 Master 풀콤보 수와 집계형 SP 모델로 fallback합니다.')
readme = re.sub(r'- 공개 v1\.0\.0 Local Exact 채보 metadata: 1\n- 다음 릴리스 후보 Runtime Exact 호환 채보: 703 / 728\n- 후보 snapshot Runtime Exact unavailable: 25 / 728', '- Local Exact 채보 metadata: 1\n- Runtime Exact 호환 채보: 703 / 728\n- Runtime Exact unavailable/fallback: 25 / 728', readme)
readme = readme.replace('unit-score-v0.5-potential + song-score-v0.4-chart-timeline', 'unit-score-v0.6-targeted-support + song-score-v0.5-exact-timeline')
readme = readme.replace('Manual FC 콤보 보너스', 'Manual PERFECT FC 콤보 보너스')
write('README.md', readme)

changelog = read('CHANGELOG.md')
changelog = changelog.replace('## [Unreleased]\n', '## [1.1.0] - 2026-08-13\n', 1)
changelog = changelog.replace('> 위 항목은 현재 `feat/exact-chart-runtime-source` 릴리스 후보에서 검증 중이며 아직 v1.0.0 공개 릴리스에는 포함되지 않습니다.\n\n', '')
changelog = changelog.replace('- Runtime Exact index builder와 loader regression test', '- Runtime Exact index builder와 loader regression test\n- 대상 지정 Passive Active-effect support의 멤버별 계산\n- 작은 카드 풀에서 staged optimizer와 전수 조사를 비교하는 exhaustive regression\n- Web Worker 기반 편성 탐색과 main-thread fallback\n- Playwright Chromium E2E smoke test')
changelog = changelog.replace('- 외부 Exact source가 실패하거나 stale이면 계산 자체를 실패시키지 않고 기존 Master fallback을 유지', '- 외부 Exact source가 실패하거나 stale이면 계산 자체를 실패시키지 않고 기존 Master fallback을 유지\n- Exact shortlist를 보유 카드 수/노트 수에 따라 동적으로 확대하고 소규모 탐색은 완전 커버\n- Exact 결과 진단표가 실제 타임라인 발동 세부값을 사용\n- Runtime Exact 검증을 Content-Range + SHA fail-closed로 강화\n- Manual 모드 표기를 Manual PERFECT FC로 명확화\n- Master sync 시 Runtime Exact index를 현재 chart-index에 재정렬')
write('CHANGELOG.md', changelog)

local = read('LOCAL_TEST.md')
local = local.replace('현재 회귀 검증용 실제 채보로 `m0049 / EXPERT`를 사용할 수 있습니다.', 'Local Exact 회귀 검증은 `m0049 / EXPERT`를 사용하고, Runtime Exact가 있는 일반 곡도 추가로 확인합니다.')
local += '''\n## 14. 자동 브라우저 E2E\n\n```bash\nnpm ci\nnpx playwright install --with-deps chromium\nnpx playwright test\n```\n\nChromium에서 앱 로드, 보유 카드 상태 주입, Manual PERFECT FC 계산, TOP 결과, Exact 안내, 다크 모드와 모바일 viewport를 점검합니다.\n'''
write('LOCAL_TEST.md', local)

notice = read('NOTICE.md')
notice = notice.replace('현재 저장소에 포함된 `m0049 / EXPERT` Exact metadata는', '저장소에 포함된 `m0049 / EXPERT` Local Exact metadata는')
notice += '''\n### Runtime Exact index\n\nv1.1.0은 `asciisyaez/yagoo-dori`의 고정 공개 generated snapshot에서 선택된 chart object를 HTTP Range로 읽을 수 있는 호환성 index를 포함합니다. 저장소는 703개 변환 chart timeline을 bulk 재배포하지 않으며, 외부 자료의 권리와 이용 조건은 원 출처에 따릅니다. 네트워크 또는 무결성 검증 실패 시 Master fallback을 사용합니다.\n'''
write('NOTICE.md', notice)

# ---------------------------------------------------------------------------
# Master sync & CI/Page validation.
# ---------------------------------------------------------------------------
replace('.github/workflows/sync-master-data.yml',
'''          node scripts/build-i18n.mjs
          node scripts/build-chart-index.mjs''',
'''          node scripts/build-i18n.mjs
          node scripts/build-chart-index.mjs
          node scripts/reconcile-exact-runtime-index.mjs''')
replace('.github/workflows/sync-master-data.yml',
'''          node scripts/test-chart-scoring.mjs
          find js -type f -name '*.js' -print0 | xargs -0 -n1 node --check''',
'''          node scripts/test-chart-scoring.mjs
          node scripts/test-exact-runtime-source.mjs
          node scripts/test-optimizer-exhaustive.mjs
          find js -type f -name '*.js' -print0 | xargs -0 -n1 node --check''')

# validate workflow additions.
replace('.github/workflows/validate.yml',
'''          node --check scripts/build-exact-runtime-index.mjs
          node --check scripts/test-chart-scoring.mjs''',
'''          node --check scripts/build-exact-runtime-index.mjs
          node --check scripts/reconcile-exact-runtime-index.mjs
          node --check scripts/test-chart-scoring.mjs
          node --check scripts/test-optimizer-exhaustive.mjs
          node --check js/optimizer-core.js
          node --check js/optimizer-client.js
          node --check js/optimizer-worker.js''')
replace('.github/workflows/validate.yml',
'''            import('./js/chart-score.js'),
            import('./js/order.js'),''',
'''            import('./js/chart-score.js'),
            import('./js/optimizer-core.js'),
            import('./js/optimizer-client.js'),
            import('./js/order.js'),''')
replace('.github/workflows/validate.yml',
'''          node scripts/build-chart-index.mjs
          node scripts/test-chart-scoring.mjs
          node scripts/test-exact-runtime-source.mjs''',
'''          node scripts/build-chart-index.mjs
          node scripts/reconcile-exact-runtime-index.mjs
          node scripts/test-chart-scoring.mjs
          node scripts/test-exact-runtime-source.mjs
          node scripts/test-optimizer-exhaustive.mjs''')
replace('.github/workflows/validate.yml',
'''          if (runtime.runtimeExactCount !== Object.keys(runtime.charts ?? {}).length
            || runtime.runtimeExactCount !== 703''',
'''          const chartIndex = JSON.parse(await readFile('data/generated/chart-index.json', 'utf8'));
          if (runtime.runtimeExactCount !== Object.keys(runtime.charts ?? {}).length
            || runtime.currentMasterSourceCommit !== chartIndex.source_commit
            || runtime.runtimeExactCount !== 703''')
replace('.github/workflows/validate.yml', 'data-app-version="20260812.3"', 'data-app-version="20260813.4"')
replace('.github/workflows/validate.yml', 'const APP_VERSION = "20260812.3"', 'const APP_VERSION = "20260813.4"')

# pages workflow.
replace('.github/workflows/pages.yml',
'''          node --check scripts/build-chart-index.mjs
          node --check scripts/test-chart-scoring.mjs''',
'''          node --check scripts/build-chart-index.mjs
          node --check scripts/reconcile-exact-runtime-index.mjs
          node --check scripts/test-chart-scoring.mjs
          node --check scripts/test-optimizer-exhaustive.mjs
          node --check js/optimizer-core.js
          node --check js/optimizer-client.js
          node --check js/optimizer-worker.js''') if 'node --check scripts/test-chart-scoring.mjs' in read('.github/workflows/pages.yml') else None
replace('.github/workflows/pages.yml',
'''            import('./js/chart-score.js'),
            import('./js/order.js'),''',
'''            import('./js/chart-score.js'),
            import('./js/optimizer-core.js'),
            import('./js/optimizer-client.js'),
            import('./js/order.js'),''')
replace('.github/workflows/pages.yml', 'data-app-version="20260812.3"', 'data-app-version="20260813.4"')
replace('.github/workflows/pages.yml',
'''          node scripts/build-chart-index.mjs
          python scripts/validate-generated-data.py''',
'''          node scripts/build-chart-index.mjs
          node scripts/reconcile-exact-runtime-index.mjs
          node scripts/test-chart-scoring.mjs
          node scripts/test-exact-runtime-source.mjs
          node scripts/test-optimizer-exhaustive.mjs
          python scripts/validate-generated-data.py''')

# ---------------------------------------------------------------------------
# Playwright E2E (pinned current release).
# ---------------------------------------------------------------------------
write('package.json', '''{
  "name": "holodori-decksim-web",
  "private": true,
  "version": "1.1.0",
  "devDependencies": {
    "@playwright/test": "1.60.0"
  },
  "scripts": {
    "test:e2e": "playwright test"
  }
}\n''')
write('playwright.config.mjs', '''import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  workers: 1,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: {
    command: "python -m http.server 4173 --bind 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});\n''')
write('e2e/app.spec.mjs', '''import { test, expect } from "@playwright/test";

async function seedOwnedCards(page) {
  await page.goto("/");
  const seed = await page.evaluate(async () => {
    const cards = await fetch("./data/generated/cards.json").then((r) => r.json());
    const picked = cards.filter((card) => [4, 5].includes(Number(card.rarity))).slice(0, 8);
    const state = {
      simulationTarget: "score", levelMode: "current", separateRole: true,
      members: [null, null, null, null, null, null], lockedSlots: [false, false, false, false, false, false],
      ownedCardIds: picked.map((card) => card.id),
      ownedCardSettings: Object.fromEntries(picked.map((card) => [card.id, {
        level: Math.max(...(card.growth?.levels ?? []).map((row) => Number(row.level) || 1)), potential: 0,
      }])),
      musicId: "m0049", difficulty: "EXPERT", playMode: "manual",
    };
    localStorage.setItem("holodori-decksim:v2", JSON.stringify(state));
    return picked.length;
  });
  expect(seed).toBeGreaterThanOrEqual(6);
  await page.reload();
}

test("loads, calculates an Exact deck in a worker, and renders TOP result", async ({ page }) => {
  await seedOwnedCards(page);
  await expect(page.locator("#play-mode")).toHaveValue("manual");
  await expect(page.locator("#play-mode option:checked")).toContainText("PERFECT");
  await page.locator("#auto-compose").click();
  await expect(page.locator(".recommendation-result-card").first()).toContainText("TOP 1", { timeout: 120_000 });
  await page.locator(".recommendation-result-card").first().click();
  await expect(page.locator(".recommendation-result-card").first()).toContainText(/실제 채보|Exact chart/);
});

test("theme and mobile layout remain operable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator('[data-view-tab="owned"]').click();
  await expect(page.locator("#owned-view")).toBeVisible();
});
''')
write('.github/workflows/e2e.yml', '''name: Browser E2E

on:
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  chromium:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
''')

# package-lock is produced by npm in the patch workflow below.

print('v1.1 hardening patch applied')
