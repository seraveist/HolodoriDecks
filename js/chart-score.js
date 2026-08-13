const DEFAULT_DENSITY = Object.freeze({ EASY: 3.0, NORMAL: 4.5, HARD: 6.0, EXPERT: 7.27 });
const DEFAULT_NOTE_WEIGHTS = Object.freeze({
  manual: Object.freeze({ tap: 1, flick: 1.05, long_start: 1, long_end: 1, long_flick_end: 1, long_relay: 0.1, long_continuation: 0.1 }),
  auto: Object.freeze({ tap: 0.8, flick: 0.8, long_start: 0.8, long_end: 0.8, long_flick_end: 0.8, long_relay: 0.1, long_continuation: 0.1 }),
});
const DEFAULT_COMBO = Object.freeze(Array.from({ length: 11 }, (_, index) => ({ from: index * 100, scoreUpPct: index })));
const TIMELINE_WEIGHT_CACHE = new WeakMap();

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function normalizedNoteType(value) {
  const type = String(value ?? "tap").replace(/^critical_/, "");
  return type === "normal" ? "tap" : type;
}

function rulesFor(scoreRules) {
  return {
    noteWeights: scoreRules?.noteWeights ?? DEFAULT_NOTE_WEIGHTS,
    combo: Array.isArray(scoreRules?.combo) && scoreRules.combo.length ? scoreRules.combo : DEFAULT_COMBO,
  };
}

function noteWeight(type, playMode, scoreRules) {
  const rules = rulesFor(scoreRules);
  const mode = playMode === "manual" ? "manual" : "auto";
  const weights = rules.noteWeights?.[mode] ?? DEFAULT_NOTE_WEIGHTS[mode];
  return Math.max(0, finite(weights?.[normalizedNoteType(type)], mode === "manual" ? 1 : 0.8));
}

function comboMultiplier(combo, scoreRules) {
  let scoreUpPct = 0;
  for (const row of [...rulesFor(scoreRules).combo].sort((a, b) => finite(a.from) - finite(b.from))) {
    if (combo >= finite(row.from)) scoreUpPct = finite(row.scoreUpPct);
    else break;
  }
  return 1 + scoreUpPct / 100;
}

function averageComboMultiplier(noteCount, scoreRules) {
  const notes = Math.max(1, Math.round(finite(noteCount, 1)));
  let total = 0;
  for (let combo = 1; combo <= notes; combo += 1) total += comboMultiplier(combo, scoreRules);
  return total / notes;
}

function timelineWeights(context, playMode, scoreRules) {
  let cache = TIMELINE_WEIGHT_CACHE.get(context);
  if (!cache) {
    cache = new Map();
    TIMELINE_WEIGHT_CACHE.set(context, cache);
  }
  const key = `${playMode === "manual" ? "manual" : "auto"}|${scoreRules?.source_commit ?? "default"}`;
  if (cache.has(key)) return cache.get(key);
  const manual = playMode === "manual";
  const weights = (context.noteTimeline ?? []).map((note, index) => (
    noteWeight(note?.[0], playMode, scoreRules)
      * (manual ? comboMultiplier(index + 1, scoreRules) : 1)
  ));
  const result = { weights, baseWeight: weights.reduce((sum, value) => sum + value, 0) };
  cache.set(key, result);
  return result;
}

function memberMatchesCondition(member, condition) {
  if (condition?.kind === "attribute") return member.attribute === condition.value;
  if (condition?.kind === "group") return member.groupings?.has(condition.value);
  return false;
}

function conditionMet(condition, members, combo = 0) {
  if (!condition) return true;
  if (["attribute", "group"].includes(condition.kind)) {
    const count = members.filter((member) => memberMatchesCondition(member, condition)).length;
    return count >= finite(condition.count);
  }
  if (condition.kind === "combo") return combo >= finite(condition.threshold);
  if (condition.kind === "life") return finite(condition.threshold) <= 1000;
  return false;
}

function comboAtTime(notes, time) {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (finite(notes[mid]?.[1]) <= time + 1e-9) low = mid + 1;
    else high = mid;
  }
  return low;
}

function comboAt(context, time) {
  if (context.noteTimeline?.length) return comboAtTime(context.noteTimeline, time);
  return Math.max(0, Math.min(context.notes, Math.floor(context.notes * time / Math.max(1, context.duration))));
}

function resolvedActiveScore(active, members, combo) {
  const base = finite(active?.baseScoreUp);
  const conditional = finite(active?.conditionalScoreUp, base);
  if (!active?.condition || !active?.conditionalScoreUp) return base;
  return conditionMet(active.condition, members, combo) ? conditional : base;
}

function expectedMaximum(events) {
  const sorted = [...events].sort((left, right) => finite(right.scoreUpPct) - finite(left.scoreUpPct));
  let expected = 0;
  let noStronger = 1;
  for (const event of sorted) {
    const probability = clamp(finite(event.probability), 0, 1);
    expected += finite(event.scoreUpPct) * probability * noStronger;
    noStronger *= 1 - probability;
  }
  return expected;
}

function specialWindows(members, context) {
  const events = context.skillTimeline ?? [];
  return events.map((event) => {
    const slot = Math.round(finite(event.slot ?? event.skill_slot_no));
    const member = members[slot - 1];
    if (!member) return null;
    const start = Math.max(0, finite(event.time));
    const duration = Math.max(0, finite(member.special?.duration));
    return {
      slot,
      cardId: member.id,
      characterName: member.characterName,
      start,
      end: Math.min(context.duration, start + duration),
      duration,
      combo: Math.max(0, Math.round(finite(event.combo ?? event.skill_starts_at_combo))),
      support: finite(member.special?.support),
      activationRateUp: finite(member.special?.activationRateUp),
      condition: member.special?.condition ?? null,
      specialLevel: member.special?.level ?? 1,
      description: member.special?.description ?? "",
    };
  }).filter((window) => window.end > window.start);
}

function activeSpecialWindows(windows, time) {
  return windows.filter((window) => window.start <= time + 1e-9 && time < window.end - 1e-9);
}

function supportAt(windows, time) {
  return activeSpecialWindows(windows, time).reduce((sum, window) => sum + window.support, 0);
}

function activationRateUpAt(windows, time, members, combo) {
  return activeSpecialWindows(windows, time).reduce((sum, window) => (
    conditionMet(window.condition, members, combo) ? sum + window.activationRateUp : sum
  ), 0);
}

function buildActiveChecks(members, context, windows, maximize = false) {
  const byMember = new Map();
  const all = [];
  for (const member of members) {
    const active = member.active;
    const interval = Math.max(0.001, finite(active?.interval, 30));
    const duration = Math.max(0, finite(active?.duration));
    const checks = [];
    for (let time = interval; time <= context.duration + 1e-9; time += interval) {
      const combo = comboAt(context, time);
      const rateUp = activationRateUpAt(windows, time, members, combo);
      const probability = maximize
        ? 1
        : clamp(finite(active?.probability) * (1 + rateUp / 100), 0, 1);
      const row = {
        cardId: member.id,
        characterName: member.characterName,
        time,
        end: Math.min(context.duration, time + duration),
        probability,
        baseProbability: finite(active?.probability),
        rateUp,
        scoreUpPct: resolvedActiveScore(active, members, combo),
        combo,
      };
      checks.push(row);
      if (row.end > row.time) all.push(row);
    }
    byMember.set(member.id, checks);
  }
  return { all, byMember };
}

function activeEventsAt(checks, time, cardId = null) {
  return checks.filter((check) => (!cardId || check.cardId === cardId)
    && check.time <= time + 1e-9
    && time < check.end - 1e-9);
}

function probabilityAny(events) {
  return 1 - [...events].reduce((none, event) => none * (1 - clamp(finite(event.probability), 0, 1)), 1);
}

function timelineSkillEvaluation(members, context, fullSupportPct, playMode, scoreRules, maximize = false) {
  const windows = specialWindows(members, context);
  const checks = buildActiveChecks(members, context, windows, maximize);
  const notes = context.noteTimeline ?? [];
  const scoring = timelineWeights(context, playMode, scoreRules);
  let skillWeight = 0;
  const coverageAcc = new Map(members.map((member) => [member.id, 0]));
  const starts = [...checks.all].sort((left, right) => finite(left.time) - finite(right.time));
  const ends = [...checks.all].sort((left, right) => finite(left.end) - finite(right.end));
  const active = new Set();
  const activeByMember = new Map(members.map((member) => [member.id, new Set()]));
  let startIndex = 0;
  let endIndex = 0;

  notes.forEach((note, index) => {
    const time = finite(note?.[1]);
    while (endIndex < ends.length && finite(ends[endIndex].end) <= time + 1e-9) {
      const row = ends[endIndex];
      active.delete(row);
      activeByMember.get(row.cardId)?.delete(row);
      endIndex += 1;
    }
    while (startIndex < starts.length && finite(starts[startIndex].time) <= time + 1e-9) {
      const row = starts[startIndex];
      if (time < finite(row.end) - 1e-9) {
        active.add(row);
        activeByMember.get(row.cardId)?.add(row);
      }
      startIndex += 1;
    }
    const weight = scoring.weights[index] ?? 0;
    const activePct = expectedMaximum(active);
    const support = finite(fullSupportPct) + supportAt(windows, time);
    const supportedPct = activePct * (1 + support / 100);
    skillWeight += weight * (1 + supportedPct / 100);
    for (const member of members) {
      coverageAcc.set(member.id, coverageAcc.get(member.id) + probabilityAny(activeByMember.get(member.id) ?? []));
    }
  });

  const details = members.map((member) => {
    const memberChecks = checks.byMember.get(member.id) ?? [];
    const expectedActivations = memberChecks.reduce((sum, row) => sum + row.probability, 0);
    return {
      cardId: member.id,
      interval: member.active.interval,
      duration: member.active.duration,
      checks: memberChecks.length,
      baseProbability: member.active.probability,
      effectiveProbability: memberChecks.length
        ? memberChecks.reduce((sum, row) => sum + row.probability, 0) / memberChecks.length
        : 0,
      expectedActivations,
      coverage: notes.length ? coverageAcc.get(member.id) / notes.length : 0,
      scoreUpPct: member.active.conditionalScoreUp || member.active.baseScoreUp,
    };
  });
  const supportAveragePct = context.duration > 0
    ? windows.reduce((sum, window) => sum + window.support * (window.end - window.start) / context.duration, 0)
    : 0;
  const activationRateAveragePct = context.duration > 0
    ? windows.reduce((sum, window) => sum + window.activationRateUp * (window.end - window.start) / context.duration, 0)
    : 0;
  const skillMultiplier = scoring.baseWeight > 0 ? skillWeight / scoring.baseWeight : 1;
  return {
    skillMultiplier,
    special: { supportAveragePct, activationRateAveragePct, windows },
    details,
    active: {
      independentPct: Math.max(0, skillMultiplier - 1) * 100,
      correctedPct: Math.max(0, skillMultiplier - 1) * 100,
      duplicateGroups: 0,
      collisionLossPct: 0,
    },
    checks: checks.all,
  };
}

export function buildSongContext(music, difficulty = "EXPERT", chart = null) {
  const normalizedDifficulty = String(difficulty ?? "EXPERT").toUpperCase();
  const density = DEFAULT_DENSITY[normalizedDifficulty] ?? DEFAULT_DENSITY.EXPERT;
  const metadata = chart?.metadata ?? null;
  const rawNotes = Array.isArray(metadata?.notes) ? metadata.notes : [];
  const lastNoteTime = rawNotes.reduce((max, note) => Math.max(max, finite(note?.[1])), 0);
  const lastSkillTime = (metadata?.skills ?? []).reduce((max, skill) => Math.max(max, finite(skill?.time)), 0);
  const baseDuration = Math.max(1, finite(music?.playing_seconds, 110));
  const duration = Math.max(baseDuration, lastNoteTime, lastSkillTime);
  const masterCount = Math.max(0, Math.round(finite(chart?.fullComboNoteCount)));
  const estimatedCount = Math.max(1, Math.round(duration * density));
  const notes = rawNotes.length || masterCount || estimatedCount;
  const chartAccuracy = rawNotes.length
    ? "exact"
    : masterCount
      ? "master"
      : "estimated";
  return {
    kind: "song",
    duration,
    notes,
    coefficient: Math.max(1, finite(music?.live_score_coefficient_permil, 5)),
    density,
    title: music?.title ?? "범용 악곡",
    chartAccuracy,
    chartHash: chart?.chartHash ?? null,
    chartAssetId: chart?.chartAssetId ?? null,
    difficultyLevel: chart?.difficultyLevel ?? null,
    noteTimeline: rawNotes,
    skillTimeline: Array.isArray(metadata?.skills) ? metadata.skills : [],
    fever: metadata?.fever ?? null,
    fullComboNoteCount: masterCount || null,
  };
}

export function songKernel(context, playMode = "auto", scoreRules = null) {
  const manual = playMode === "manual";
  if (context.noteTimeline?.length) {
    return context.noteTimeline.reduce((sum, note, index) => (
      sum + noteWeight(note?.[0], playMode, scoreRules)
        * (manual ? comboMultiplier(index + 1, scoreRules) : 1)
    ), 0) * context.coefficient;
  }
  const defaultWeight = noteWeight("tap", playMode, scoreRules);
  return context.notes
    * context.coefficient
    * defaultWeight
    * (manual ? averageComboMultiplier(context.notes, scoreRules) : 1);
}

export function timelineSongProjection({
  unitScore,
  members,
  context,
  genericContext,
  fullSupportPct,
  playMode = "auto",
  genericSkillMultiplier = 1,
  scoreRules = null,
  evaluationTarget = "both",
}) {
  const needExpected = evaluationTarget !== "potential";
  const needMaximum = evaluationTarget !== "score";
  const expected = needExpected
    ? timelineSkillEvaluation(members, context, fullSupportPct, playMode, scoreRules, false)
    : null;
  const maximum = needMaximum
    ? timelineSkillEvaluation(members, context, fullSupportPct, playMode, scoreRules, true)
    : null;
  const selectedKernel = songKernel(context, playMode, scoreRules);
  const genericKernel = songKernel(genericContext, playMode, scoreRules);
  const baseRatio = genericKernel > 0 ? selectedKernel / genericKernel : 1;
  const skillRatio = expected && genericSkillMultiplier > 0 ? expected.skillMultiplier / genericSkillMultiplier : 1;
  const maxSkillRatio = maximum && genericSkillMultiplier > 0 ? maximum.skillMultiplier / genericSkillMultiplier : 1;
  const averageScore = expected ? Math.max(0, Math.round(unitScore * baseRatio * skillRatio)) : null;
  const rawMaxScore = maximum ? Math.max(0, Math.round(unitScore * baseRatio * maxSkillRatio)) : null;
  const maxScore = rawMaxScore == null ? null : Math.max(averageScore ?? 0, rawMaxScore);
  return {
    averageScore,
    maxScore,
    baseRatio,
    skillRatio,
    maxSkillRatio,
    context,
    playMode: playMode === "manual" ? "manual" : "auto",
    expected,
    maximum,
    specialWindows: expected?.special?.windows ?? maximum?.special?.windows ?? [],
    note: "실제 채보의 노트 시각/종류와 SP 슬롯 발동 시각을 사용합니다.",
  };
}
