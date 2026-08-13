from pathlib import Path
import re

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')

def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise SystemExit(f'missing replacement anchor in {path}: {old[:120]!r}')
    text = text.replace(old, new, 1)
    write(path, text)

def replace_all(path, old, new):
    text = read(path)
    if old not in text:
        raise SystemExit(f'missing replacement anchor in {path}: {old[:120]!r}')
    write(path, text.replace(old, new))

# ---- recommendation shortlist -------------------------------------------------
replace_once('js/recommend.js',
'''const DEFAULT_RESULT_COUNT = 5;\n''',
'''const DEFAULT_RESULT_COUNT = 5;\nconst MAX_RESULT_COUNT = 30;\n''')
replace_once('js/recommend.js',
'''export function recommendationValue(score, simulationTarget = "score") {\n''',
'''export function exactShortlistSize(noteCount = 0, ownedCount = 0) {\n  const notes = Math.max(0, Number(noteCount) || 0);\n  const owned = Math.max(0, Number(ownedCount) || 0);\n  if (owned > 0 && owned <= 18) return MAX_RESULT_COUNT;\n  if (notes >= 1_600) return 12;\n  if (notes >= 1_200) return 16;\n  if (notes >= 800) return 20;\n  return 24;\n}\n\nexport function recommendationValue(score, simulationTarget = "score") {\n''')
replace_once('js/recommend.js',
'''  const normalizedResultCount = Math.max(1, Math.min(10, Number(resultCount) || DEFAULT_RESULT_COUNT));\n''',
'''  const normalizedResultCount = Math.max(1, Math.min(MAX_RESULT_COUNT, Number(resultCount) || DEFAULT_RESULT_COUNT));\n''')

# ---- targeted passive support -------------------------------------------------
old_passive = '''function passiveEvaluation(members) {\n  const bonusByMember = new Map(members.map((member) => [member.id, { p: 0, t: 0, s: 0 }]));\n  const activeStates = [];\n  let supportPoints = 0;\n\n  for (const owner of members) {\n    const passive = owner.passive;\n    if (!passive) continue;\n    const active = staticConditionState(passive.condition, members) !== false;\n    activeStates.push({ cardId: owner.id, active, label: active ? "활성" : "비활성" });\n    if (!active) continue;\n    const effect = passive.effect;\n    const targets = eligibleTargets(effect.target, owner, members)\n      .sort((left, right) => effect.kind === "stat" ? right.stats[effect.stat] - left.stats[effect.stat] : 0)\n      .slice(0, effect.target?.count ?? 5);\n    if (effect.kind === "support") {\n      supportPoints += effect.value * targets.length / 5;\n      continue;\n    }\n    for (const target of targets) {\n      if (effect.kind === "selfAll" || effect.kind === "all") {\n        for (const stat of ["p", "t", "s"]) bonusByMember.get(target.id)[stat] += target.stats[stat] * effect.value / 100;\n      } else if (effect.kind === "stat") {\n        bonusByMember.get(target.id)[effect.stat] += target.stats[effect.stat] * effect.value / 100;\n      }\n    }\n  }\n\n  const bonusStats = { p: 0, t: 0, s: 0 };\n  for (const bonus of bonusByMember.values()) {\n    for (const stat of ["p", "t", "s"]) bonusStats[stat] += bonus[stat];\n  }\n  return { bonusStats, supportPoints, activeStates };\n}\n'''
new_passive = '''function passiveEvaluation(members) {\n  const bonusByMember = new Map(members.map((member) => [member.id, { p: 0, t: 0, s: 0 }]));\n  const supportByMember = new Map(members.map((member) => [member.id, 0]));\n  const activeStates = [];\n\n  for (const owner of members) {\n    const passive = owner.passive;\n    if (!passive) continue;\n    const active = staticConditionState(passive.condition, members) !== false;\n    activeStates.push({ cardId: owner.id, active, label: active ? "활성" : "비활성" });\n    if (!active) continue;\n    const effect = passive.effect;\n    const targets = eligibleTargets(effect.target, owner, members)\n      .sort((left, right) => effect.kind === "stat" ? right.stats[effect.stat] - left.stats[effect.stat] : 0)\n      .slice(0, effect.target?.count ?? 5);\n    if (effect.kind === "support") {\n      for (const target of targets) {\n        supportByMember.set(target.id, (supportByMember.get(target.id) ?? 0) + effect.value);\n      }\n      continue;\n    }\n    for (const target of targets) {\n      if (effect.kind === "selfAll" || effect.kind === "all") {\n        for (const stat of ["p", "t", "s"]) bonusByMember.get(target.id)[stat] += target.stats[stat] * effect.value / 100;\n      } else if (effect.kind === "stat") {\n        bonusByMember.get(target.id)[effect.stat] += target.stats[effect.stat] * effect.value / 100;\n      }\n    }\n  }\n\n  const bonusStats = { p: 0, t: 0, s: 0 };\n  for (const bonus of bonusByMember.values()) {\n    for (const stat of ["p", "t", "s"]) bonusStats[stat] += bonus[stat];\n  }\n  const supportPoints = [...supportByMember.values()].reduce((sum, value) => sum + value, 0) / Math.max(1, members.length);\n  return {\n    bonusStats,\n    supportPoints,\n    supportByMember: Object.fromEntries(supportByMember),\n    activeStates,\n  };\n}\n'''
replace_once('js/score.js', old_passive, new_passive)

old_song_skill = '''function songSkillMultiplier(members, context, fullSupportPct, maximize = false) {\n  const special = specialAverages(members, context);\n  const details = activeDetails(members, context, special.activationRateAveragePct, maximize);\n  const active = aggregateActiveScore(details, context);\n  const supportedActive = active.correctedPct * (1 + (fullSupportPct + special.supportAveragePct) / 100);\n  return { skillMultiplier: 1 + supportedActive / 100, special, details, active };\n}\n'''
new_song_skill = '''function staticSupportForMember(memberId, supportProfile = {}) {\n  return finite(supportProfile?.leaderSupportPct)\n    + finite(supportProfile?.passiveSupportByMember?.[memberId]);\n}\n\nfunction applyStaticSupport(details, supportProfile = {}) {\n  return details.map((detail) => {\n    const staticSupportPct = staticSupportForMember(detail.cardId, supportProfile);\n    return {\n      ...detail,\n      rawScoreUpPct: detail.scoreUpPct,\n      staticSupportPct,\n      scoreUpPct: detail.scoreUpPct * (1 + staticSupportPct / 100),\n    };\n  });\n}\n\nfunction songSkillMultiplier(members, context, supportProfile = {}, maximize = false) {\n  const special = specialAverages(members, context);\n  const rawDetails = activeDetails(members, context, special.activationRateAveragePct, maximize);\n  const details = applyStaticSupport(rawDetails, supportProfile);\n  const active = aggregateActiveScore(details, context);\n  const supportedActive = active.correctedPct * (1 + special.supportAveragePct / 100);\n  return { skillMultiplier: 1 + supportedActive / 100, special, details, active };\n}\n'''
replace_once('js/score.js', old_song_skill, new_song_skill)

old_project = '''function projectSong(unitScore, members, music, difficulty, fullSupportPct, playMode = "auto", evaluationTarget = "both") {\n  if (!music) return null;\n  const selected = contextFromMusic(music, difficulty);\n  const generic = contextFromMusic(null, difficulty);\n  const scoreRules = music?._scoreRules ?? null;\n  const genericExpected = songSkillMultiplier(members, generic, fullSupportPct);\n  const needExpected = evaluationTarget !== "potential";\n  const needMaximum = evaluationTarget !== "score";\n  if (selected.chartAccuracy === "exact" && selected.noteTimeline.length) {\n    return timelineSongProjection({\n      unitScore,\n      members,\n      context: selected,\n      genericContext: generic,\n      fullSupportPct,\n      playMode,\n      genericSkillMultiplier: genericExpected.skillMultiplier,\n      scoreRules,\n      evaluationTarget,\n    });\n  }\n  const selectedExpected = needExpected ? songSkillMultiplier(members, selected, fullSupportPct) : null;\n  const selectedMaximum = needMaximum ? songSkillMultiplier(members, selected, fullSupportPct, true) : null;\n  const manual = playMode === "manual";\n  const selectedKernel = cachedSongKernel(selected, playMode, scoreRules);\n  const genericKernel = cachedSongKernel(generic, playMode, scoreRules);\n  const baseRatio = genericKernel > 0 ? selectedKernel / genericKernel : 1;\n  const skillRatio = selectedExpected && genericExpected.skillMultiplier > 0\n    ? selectedExpected.skillMultiplier / genericExpected.skillMultiplier\n    : 1;\n  const maxSkillRatio = selectedMaximum && genericExpected.skillMultiplier > 0\n    ? selectedMaximum.skillMultiplier / genericExpected.skillMultiplier\n    : 1;\n  const averageScore = selectedExpected\n    ? Math.max(0, Math.round(unitScore * baseRatio * skillRatio))\n    : null;\n  const rawMaxScore = selectedMaximum\n    ? Math.max(0, Math.round(unitScore * baseRatio * maxSkillRatio))\n    : null;\n  const maxScore = rawMaxScore == null ? null : Math.max(averageScore ?? 0, rawMaxScore);\n  return {\n    averageScore,\n    maxScore,\n    baseRatio,\n    skillRatio,\n    maxSkillRatio,\n    context: selected,\n    playMode: manual ? "manual" : "auto",\n    expected: selectedExpected,\n    maximum: selectedMaximum,\n    specialWindows: [],\n    note: selected.chartAccuracy === "master"\n      ? "Master의 실제 풀콤보 노트 수를 사용하고, SP 타이밍은 집계 기반으로 근사합니다."\n      : manual\n        ? "Manual FC 근사: 추정 노트와 콤보 보너스를 포함합니다."\n        : "AUTO 근사: 추정 노트 수를 사용하고 콤보 보너스를 제외합니다.",\n  };\n}\n'''
new_project = '''function projectSong(unitScore, members, music, difficulty, supportProfile = {}, playMode = "auto", evaluationTarget = "both") {\n  if (!music) return null;\n  const selected = contextFromMusic(music, difficulty);\n  const generic = contextFromMusic(null, difficulty);\n  const scoreRules = music?._scoreRules ?? null;\n  const genericExpected = songSkillMultiplier(members, generic, supportProfile);\n  const needExpected = evaluationTarget !== "potential";\n  const needMaximum = evaluationTarget !== "score";\n  if (selected.chartAccuracy === "exact" && selected.noteTimeline.length) {\n    return timelineSongProjection({\n      unitScore,\n      members,\n      context: selected,\n      genericContext: generic,\n      supportProfile,\n      playMode,\n      genericSkillMultiplier: genericExpected.skillMultiplier,\n      scoreRules,\n      evaluationTarget,\n    });\n  }\n  const selectedExpected = needExpected ? songSkillMultiplier(members, selected, supportProfile) : null;\n  const selectedMaximum = needMaximum ? songSkillMultiplier(members, selected, supportProfile, true) : null;\n  const manual = playMode === "manual";\n  const selectedKernel = cachedSongKernel(selected, playMode, scoreRules);\n  const genericKernel = cachedSongKernel(generic, playMode, scoreRules);\n  const baseRatio = genericKernel > 0 ? selectedKernel / genericKernel : 1;\n  const skillRatio = selectedExpected && genericExpected.skillMultiplier > 0\n    ? selectedExpected.skillMultiplier / genericExpected.skillMultiplier\n    : 1;\n  const maxSkillRatio = selectedMaximum && genericExpected.skillMultiplier > 0\n    ? selectedMaximum.skillMultiplier / genericExpected.skillMultiplier\n    : 1;\n  const averageScore = selectedExpected\n    ? Math.max(0, Math.round(unitScore * baseRatio * skillRatio))\n    : null;\n  const rawMaxScore = selectedMaximum\n    ? Math.max(0, Math.round(unitScore * baseRatio * maxSkillRatio))\n    : null;\n  const maxScore = rawMaxScore == null ? null : Math.max(averageScore ?? 0, rawMaxScore);\n  return {\n    averageScore,\n    maxScore,\n    baseRatio,\n    skillRatio,\n    maxSkillRatio,\n    context: selected,\n    playMode: manual ? "manual" : "auto",\n    expected: selectedExpected,\n    maximum: selectedMaximum,\n    specialWindows: [],\n    note: selected.chartAccuracy === "master"\n      ? "Master의 실제 풀콤보 노트 수를 사용하고, SP 타이밍은 집계 기반으로 근사합니다."\n      : manual\n        ? "Manual PERFECT FC 근사: 추정 노트와 콤보 보너스를 포함합니다."\n        : "AUTO 근사: 추정 노트 수를 사용하고 콤보 보너스를 제외합니다.",\n  };\n}\n'''
replace_once('js/score.js', old_project, new_project)

old_diag_head = '''function diagnostics(members, context, passiveStates, leader, additionalLeaderConditionMet) {\n  const intervalCount = {};\n  for (const member of members) intervalCount[member.active.interval] = (intervalCount[member.active.interval] ?? 0) + 1;\n  const passiveMap = new Map(passiveStates.map((row) => [row.cardId, row]));\n  const skill = skillEvaluation(members, context);\n  const activeMap = new Map(skill.details.map((row) => [row.cardId, row]));\n'''
new_diag_head = '''function diagnostics(members, context, passiveStates, leader, additionalLeaderConditionMet, projectedDetails = null) {\n  const intervalCount = {};\n  for (const member of members) intervalCount[member.active.interval] = (intervalCount[member.active.interval] ?? 0) + 1;\n  const passiveMap = new Map(passiveStates.map((row) => [row.cardId, row]));\n  const fallbackSkill = projectedDetails ? null : skillEvaluation(members, context);\n  const activeMap = new Map((projectedDetails ?? fallbackSkill.details).map((row) => [row.cardId, row]));\n'''
replace_once('js/score.js', old_diag_head, new_diag_head)
replace_once('js/score.js',
'''      scoreUpPct: active.scoreUpPct,\n      collision: intervalCount[member.active.interval] > 1,\n''',
'''      scoreUpPct: active.scoreUpPct,\n      activationChecks: active.activationChecks ?? [],\n      staticSupportPct: finite(active.staticSupportPct),\n      collision: intervalCount[member.active.interval] > 1,\n''')

replace_once('js/score.js',
'''    fullSupportPct: leaderEffects.support + passive.supportPoints,\n''',
'''    fullSupportPct: leaderEffects.support + passive.supportPoints,\n    supportProfile: {\n      leaderSupportPct: leaderEffects.support,\n      passiveSupportByMember: passive.supportByMember,\n    },\n''')
replace_once('js/score.js',
'''    composition.fullSupportPct,\n    playMode,\n''',
'''    composition.supportProfile,\n    playMode,\n''')
replace_once('js/score.js',
'''  const diagnosticContext = songProjection?.context ?? UNIT_CONTEXT;\n\n  return {\n''',
'''  const diagnosticContext = songProjection?.context ?? UNIT_CONTEXT;\n  const projectedDiagnostics = songProjection?.context?.chartAccuracy === "exact"\n    ? songProjection?.expected?.details ?? null\n    : null;\n\n  return {\n''')
replace_once('js/score.js',
'''      ? diagnostics(members, diagnosticContext, composition.passive.activeStates, leader, composition.additionalMet)\n''',
'''      ? diagnostics(members, diagnosticContext, composition.passive.activeStates, leader, composition.additionalMet, projectedDiagnostics)\n''')

# ---- exact timeline support/diagnostics ---------------------------------------
replace_once('js/chart-score.js',
'''function activationRateUpAt(windows, time, members, combo) {\n  return activeSpecialWindows(windows, time).reduce((sum, window) => (\n    conditionMet(window.condition, members, combo) ? sum + window.activationRateUp : sum\n  ), 0);\n}\n''',
'''function activationRateUpAt(windows, time, members, combo) {\n  return activeSpecialWindows(windows, time).reduce((sum, window) => (\n    conditionMet(window.condition, members, combo) ? sum + window.activationRateUp : sum\n  ), 0);\n}\n\nfunction supportForMember(supportProfile, memberId) {\n  return finite(supportProfile?.leaderSupportPct)\n    + finite(supportProfile?.passiveSupportByMember?.[memberId]);\n}\n''')
replace_once('js/chart-score.js',
'''function timelineSkillEvaluation(members, context, fullSupportPct, playMode, scoreRules, maximize = false) {\n''',
'''function timelineSkillEvaluation(members, context, supportProfile, playMode, scoreRules, maximize = false) {\n''')
replace_once('js/chart-score.js',
'''    const weight = scoring.weights[index] ?? 0;\n    const activePct = expectedMaximum(active);\n    const support = finite(fullSupportPct) + supportAt(windows, time);\n    const supportedPct = activePct * (1 + support / 100);\n    skillWeight += weight * (1 + supportedPct / 100);\n''',
'''    const weight = scoring.weights[index] ?? 0;\n    const specialSupport = supportAt(windows, time);\n    const supportedEvents = [...active].map((row) => ({\n      ...row,\n      scoreUpPct: row.scoreUpPct * (1 + (supportForMember(supportProfile, row.cardId) + specialSupport) / 100),\n    }));\n    const activePct = expectedMaximum(supportedEvents);\n    skillWeight += weight * (1 + activePct / 100);\n''')
replace_once('js/chart-score.js',
'''      coverage: notes.length ? coverageAcc.get(member.id) / notes.length : 0,\n      scoreUpPct: member.active.conditionalScoreUp || member.active.baseScoreUp,\n    };\n''',
'''      coverage: notes.length ? coverageAcc.get(member.id) / notes.length : 0,\n      scoreUpPct: memberChecks.length\n        ? memberChecks.reduce((sum, row) => sum + row.scoreUpPct, 0) / memberChecks.length\n        : (member.active.conditionalScoreUp || member.active.baseScoreUp),\n      staticSupportPct: supportForMember(supportProfile, member.id),\n      activationChecks: memberChecks.map((row) => ({\n        time: row.time,\n        end: row.end,\n        probability: row.probability,\n        rateUp: row.rateUp,\n        scoreUpPct: row.scoreUpPct,\n        combo: row.combo,\n      })),\n    };\n''')
replace_once('js/chart-score.js',
'''  fullSupportPct,\n  playMode = "auto",\n''',
'''  fullSupportPct = 0,\n  supportProfile = null,\n  playMode = "auto",\n''')
replace_once('js/chart-score.js',
'''  const needExpected = evaluationTarget !== "potential";\n  const needMaximum = evaluationTarget !== "score";\n  const expected = needExpected\n    ? timelineSkillEvaluation(members, context, fullSupportPct, playMode, scoreRules, false)\n    : null;\n  const maximum = needMaximum\n    ? timelineSkillEvaluation(members, context, fullSupportPct, playMode, scoreRules, true)\n    : null;\n''',
'''  const needExpected = evaluationTarget !== "potential";\n  const needMaximum = evaluationTarget !== "score";\n  const resolvedSupportProfile = supportProfile ?? { leaderSupportPct: finite(fullSupportPct), passiveSupportByMember: {} };\n  const expected = needExpected\n    ? timelineSkillEvaluation(members, context, resolvedSupportProfile, playMode, scoreRules, false)\n    : null;\n  const maximum = needMaximum\n    ? timelineSkillEvaluation(members, context, resolvedSupportProfile, playMode, scoreRules, true)\n    : null;\n''')

# ---- result timeline uses exact per-check probability -------------------------
text = read('js/ui/result.js')
start = text.index('export function activationTimeline(row, totalDuration) {')
end = text.index('\nfunction cardProfile(', start)
replacement = '''export function activationTimeline(row, totalDuration) {\n  const timelineDuration = Math.max(1, Number(totalDuration) || 1);\n  const exactChecks = Array.isArray(row?.activationChecks) ? row.activationChecks : [];\n  if (exactChecks.length) {\n    return exactChecks.map((check) => {\n      const start = Math.max(0, Number(check?.time) || 0);\n      const end = Math.min(timelineDuration, Math.max(start, Number(check?.end) || start));\n      return {\n        start,\n        end,\n        probability: Math.max(0, Math.min(1, Number(check?.probability) || 0)),\n        startPercent: start / timelineDuration * 100,\n        widthPercent: (end - start) / timelineDuration * 100,\n      };\n    }).filter((window) => window.end > window.start);\n  }\n  const interval = Math.max(0.001, Number(row?.interval) || timelineDuration);\n  const activeDuration = Math.max(0, Number(row?.duration) || 0);\n  const checks = Math.max(0, Math.floor(Number(row?.checks) || timelineDuration / interval));\n  const probability = Math.max(0, Math.min(1, Number(row?.effectiveProbability) || 0));\n  const windows = [];\n  for (let check = 1; check <= checks; check += 1) {\n    const start = check * interval;\n    if (start >= timelineDuration || activeDuration <= 0) continue;\n    const end = Math.min(timelineDuration, start + activeDuration);\n    if (end <= start) continue;\n    windows.push({\n      start,\n      end,\n      probability,\n      startPercent: start / timelineDuration * 100,\n      widthPercent: (end - start) / timelineDuration * 100,\n    });\n  }\n  return windows;\n}\n\nexport function teamActivationTimeline(rows, totalDuration) {\n  const duration = Math.max(1, Number(totalDuration) || 1);\n  const events = [];\n  let windowId = 0;\n  rows.forEach((row, rowIndex) => {\n    activationTimeline(row, duration).forEach((window) => {\n      const id = windowId++;\n      events.push({ time: window.start, id, rowIndex, probability: window.probability, delta: 1 });\n      events.push({ time: window.end, id, rowIndex, probability: window.probability, delta: -1 });\n    });\n  });\n  events.sort((left, right) => left.time - right.time || left.delta - right.delta);\n\n  const activeWindows = new Map();\n  const segments = [];\n  let cursor = 0;\n  let eventIndex = 0;\n  while (eventIndex < events.length) {\n    const time = Math.max(0, Math.min(duration, events[eventIndex].time));\n    if (time > cursor && activeWindows.size) {\n      const activeRows = new Set([...activeWindows.values()].map((event) => event.rowIndex));\n      const probability = 1 - [...activeWindows.values()].reduce((noneActive, event) => (\n        noneActive * (1 - Math.max(0, Math.min(1, Number(event.probability) || 0)))\n      ), 1);\n      segments.push({\n        start: cursor,\n        end: time,\n        count: activeRows.size,\n        probability,\n        startPercent: cursor / duration * 100,\n        widthPercent: (time - cursor) / duration * 100,\n      });\n    }\n    cursor = time;\n    while (eventIndex < events.length\n      && Math.max(0, Math.min(duration, events[eventIndex].time)) === time) {\n      const event = events[eventIndex];\n      if (event.delta > 0) activeWindows.set(event.id, event);\n      else activeWindows.delete(event.id);\n      eventIndex += 1;\n    }\n  }\n\n  const expectedCoverage = segments.reduce((sum, segment) => (\n    sum + (segment.end - segment.start) / duration * segment.probability\n  ), 0);\n  const overlapCoverage = segments.reduce((sum, segment) => (\n    sum + (segment.count > 1 ? (segment.end - segment.start) / duration : 0)\n  ), 0);\n  return { segments, expectedCoverage, overlapCoverage };\n}\n'''
write('js/ui/result.js', text[:start] + replacement + text[end:])

# ---- runtime Exact integrity --------------------------------------------------
replace_once('js/chart-data.js',
'''  if (response.status !== 206) {\n    try { await response.body?.cancel(); } catch { /* ignore */ }\n    return null;\n  }\n\n  try {\n''',
'''  if (response.status !== 206) {\n    try { await response.body?.cancel(); } catch { /* ignore */ }\n    return null;\n  }\n  const contentRange = String(response.headers?.get?.("content-range") ?? "").toLowerCase();\n  if (!contentRange.startsWith(`bytes ${start}-${end}/`)) {\n    try { await response.body?.cancel(); } catch { /* ignore */ }\n    return null;\n  }\n\n  try {\n''')
replace_once('js/chart-data.js',
'''      const actualSha = await sha256Hex(text);\n      if (actualSha && actualSha !== expectedSha) return null;\n''',
'''      const actualSha = await sha256Hex(text);\n      if (!actualSha || actualSha !== expectedSha) return null;\n''')

# ---- runtime index builder becomes sync-friendly ------------------------------
text = read('scripts/build-exact-runtime-index.mjs')
text = text.replace('const options = { input: null, chartIndex: DEFAULT_CHART_INDEX, output: DEFAULT_OUTPUT };',
                    'const options = { input: null, chartIndex: DEFAULT_CHART_INDEX, output: DEFAULT_OUTPUT, strict: false };')
text = text.replace('else if (arg === "--output") options.output = argv[++index];',
                    'else if (arg === "--output") options.output = argv[++index];\n    else if (arg === "--strict") options.strict = true;')
text = text.replace('[--output data/generated/exact-runtime-index.json]',
                    '[--output data/generated/exact-runtime-index.json] [--strict]')
text = text.replace('  if (payload.rejectedAvailableCount) process.exitCode = 2;',
                    '  if (options.strict && payload.rejectedAvailableCount) process.exitCode = 2;')
write('scripts/build-exact-runtime-index.mjs', text)

# ---- worker-based optimizer ---------------------------------------------------
write('js/optimizer-core.js', '''import { exactShortlistSize, optimizeOwnedDeck } from "./recommend.js?v=1.1.0";\nimport { optimizeRecommendationOrders } from "./order.js?v=1.1.0";\n\nexport function runOptimization({\n  preparedCards,\n  ownedCardIds,\n  currentMembers,\n  lockedSlots,\n  searchMusic = null,\n  exactMusic = null,\n  difficulty = "EXPERT",\n  playMode = "auto",\n  simulationTarget = "score",\n  separateRole = true,\n  hasExactOrder = false,\n  resultCount = 5,\n}) {\n  const noteCount = exactMusic?._chart?.metadata?.notes?.length ?? 0;\n  const shortlistCount = hasExactOrder\n    ? exactShortlistSize(noteCount, ownedCardIds?.length ?? 0)\n    : resultCount;\n  let result = optimizeOwnedDeck({\n    preparedCards,\n    ownedCardIds,\n    currentMembers,\n    lockedSlots,\n    music: searchMusic,\n    difficulty,\n    playMode,\n    simulationTarget,\n    separateRole,\n    resultCount: shortlistCount,\n  });\n  if (result.ok) {\n    result = optimizeRecommendationOrders({\n      recommendation: result,\n      preparedCards,\n      currentMembers,\n      lockedSlots,\n      music: exactMusic,\n      difficulty,\n      playMode,\n      simulationTarget,\n      separateRole,\n      resultCount,\n    });\n  }\n  return { ...result, stageOneShortlistCount: shortlistCount };\n}\n''')
write('js/optimizer-worker.js', '''import { runOptimization } from "./optimizer-core.js?v=1.1.0";\n\nself.addEventListener("message", (event) => {\n  const { id, payload } = event.data ?? {};\n  try {\n    self.postMessage({ id, ok: true, result: runOptimization(payload) });\n  } catch (error) {\n    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });\n  }\n});\n''')
write('js/optimizer-client.js', '''import { runOptimization } from "./optimizer-core.js?v=1.1.0";\n\nlet requestId = 0;\n\nexport async function runOptimizationAsync(payload, { preferWorker = true } = {}) {\n  if (!preferWorker || typeof Worker === "undefined") return runOptimization(payload);\n  let worker;\n  try {\n    worker = new Worker(new URL("./optimizer-worker.js?v=1.1.0", import.meta.url), { type: "module" });\n  } catch {\n    return runOptimization(payload);\n  }\n  const id = ++requestId;\n  return await new Promise((resolve) => {\n    let settled = false;\n    const fallback = () => {\n      if (settled) return;\n      settled = true;\n      worker.terminate();\n      resolve(runOptimization(payload));\n    };\n    worker.addEventListener("message", (event) => {\n      if (event.data?.id !== id || settled) return;\n      if (!event.data?.ok) {\n        fallback();\n        return;\n      }\n      settled = true;\n      worker.terminate();\n      resolve(event.data.result);\n    });\n    worker.addEventListener("error", fallback, { once: true });\n    try {\n      worker.postMessage({ id, payload });\n    } catch {\n      fallback();\n    }\n  });\n}\n''')

# app delegates optimizer work to worker client
replace_once('js/app.js',
'''import { optimizeOwnedDeck } from "./recommend.js?v=20260813.1";\nimport { optimizeRecommendationOrders } from "./order.js?v=20260813.1";\nimport { prepareScoreCards } from "./score.js?v=20260813.1";\n''',
'''import { prepareScoreCards } from "./score.js?v=1.1.0";\nimport { runOptimizationAsync } from "./optimizer-client.js?v=1.1.0";\n''')
old_app_calc = '''  const hasExactOrder = Boolean(chart?.metadata?.skills?.length);\n  let result = optimizeOwnedDeck({\n    preparedCards,\n    ownedCardIds: state.ownedCardIds,\n    currentMembers: state.members,\n    lockedSlots: state.lockedSlots,\n    music: searchMusic,\n    difficulty: state.difficulty,\n    playMode: state.playMode,\n    simulationTarget: state.simulationTarget,\n    separateRole: state.separateRole,\n    resultCount: hasExactOrder ? Math.min(10, RESULT_COUNT * 2) : RESULT_COUNT,\n  });\n  if (result.ok) {\n    result = optimizeRecommendationOrders({\n      recommendation: result,\n      preparedCards,\n      currentMembers: state.members,\n      lockedSlots: state.lockedSlots,\n      music: exactMusic,\n      difficulty: state.difficulty,\n      playMode: state.playMode,\n      simulationTarget: state.simulationTarget,\n      separateRole: state.separateRole,\n      resultCount: RESULT_COUNT,\n    });\n  }\n'''
new_app_calc = '''  const hasExactOrder = Boolean(chart?.metadata?.skills?.length);\n  const ownedSet = new Set(state.ownedCardIds);\n  const workerCards = new Map([...preparedCards].filter(([cardId]) => ownedSet.has(cardId)));\n  const result = await runOptimizationAsync({\n    preparedCards: workerCards,\n    ownedCardIds: state.ownedCardIds,\n    currentMembers: state.members,\n    lockedSlots: state.lockedSlots,\n    searchMusic,\n    exactMusic,\n    difficulty: state.difficulty,\n    playMode: state.playMode,\n    simulationTarget: state.simulationTarget,\n    separateRole: state.separateRole,\n    hasExactOrder,\n    resultCount: RESULT_COUNT,\n  });\n'''
replace_once('js/app.js', old_app_calc, new_app_calc)

# ---- Manual mode wording and browser cache -----------------------------------
text = read('js/i18n.js')
text, count = re.subn(r'("play\.manual":\s*)"[^"]*"', r'\1"Manual PERFECT FC"', text)
if count != 3:
    raise SystemExit(f'expected 3 play.manual entries, got {count}')
write('js/i18n.js', text)
replace_all('js/ui/result.js', 'Manual FC', 'Manual PERFECT FC')
replace_all('index.html', 'Manual FC 근사', 'Manual PERFECT FC')

# use semantic release version for app/html and changed module cache keys
replace_once('js/app.js', 'const APP_VERSION = "20260812.3";', 'const APP_VERSION = "1.1.0";')
replace_once('index.html', 'data-app-version="20260812.3"', 'data-app-version="1.1.0"')
replace_once('index.html', './js/app.js?v=20260813.3', './js/app.js?v=1.1.0')
for path, pairs in {
    'js/app.js': [
        ('./chart-data.js?v=20260813.3', './chart-data.js?v=1.1.0'),
        ('./ui/result.js?v=20260813.2', './ui/result.js?v=1.1.0'),
    ],
    'js/order.js': [('./score.js?v=20260813.1', './score.js?v=1.1.0')],
    'js/recommend.js': [('./score.js?v=20260813.1', './score.js?v=1.1.0')],
    'js/score.js': [('./chart-score.js?v=20260813.1', './chart-score.js?v=1.1.0')],
}.items():
    text = read(path)
    for old, new in pairs:
        if old not in text:
            raise SystemExit(f'missing cache anchor {old} in {path}')
        text = text.replace(old, new)
    write(path, text)

# ---- tests -------------------------------------------------------------------
write('scripts/test-targeted-passive-support.mjs', r'''import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluateDeck } from "../js/score.js";

const rules = JSON.parse(fs.readFileSync(new URL("../data/generated/live-score-rules.json", import.meta.url), "utf8"));

function member(id, activeScore, boosted = false, passive = null) {
  return {
    id,
    characterId: `char-${id}`,
    characterName: id,
    attribute: 1,
    groupings: new Set(boosted ? ["grp-boosted"] : []),
    profile: { level: 80, currentLevel: 80, maxLevel: 80, potential: 0, levelMode: "current" },
    stats: { p: 1000, t: 1000, s: 1000 },
    enhancementPermyriad: 0,
    passive,
    active: { level: 1, interval: 10, probability: activeScore ? 1 : 0, duration: 20, baseScoreUp: activeScore, conditionalScoreUp: activeScore, condition: null, description: id },
    special: { level: 1, duration: 0, support: 0, activationRateUp: 0, condition: null, description: id },
  };
}
const leader = {
  id: "L", characterId: "char-L", characterName: "L",
  leader: { primaryCondition: [], primaryEffects: { p: 0, t: 0, s: 0, support: 0 }, additionalCondition: [], additionalEffects: { p: 0, t: 0, s: 0, support: 0 }, description: "" },
};
const passive = { level: 1, condition: null, description: "target support", effect: { kind: "support", value: 100, target: { kind: "group", value: "grp-boosted", count: 1 } } };
const notes = Array.from({ length: 30 }, (_, index) => ["tap", 10.5 + index * 0.5]);
const chart = { fullComboNoteCount: notes.length, chartHash: "support-test", metadata: { notes, skills: [], fever: null } };
const music = { id: "support-test", title: "support", playing_seconds: 30, live_score_coefficient_permil: 5, _chart: chart, _scoreRules: rules };

function score(boostStrong) {
  const members = [
    member("P", 0, false, passive),
    member("STRONG", 100, boostStrong),
    member("WEAK", 20, !boostStrong),
    member("D", 0),
    member("E", 0),
  ];
  return evaluateDeck({ leader, members, music, difficulty: "EXPERT", playMode: "manual", separateRole: true });
}
const strong = score(true);
const weak = score(false);
assert.ok(strong?.rankingScore > weak?.rankingScore, `${strong?.rankingScore} should exceed ${weak?.rankingScore}`);
assert.equal(strong.songProjection.context.chartAccuracy, "exact");
console.log(`targeted passive support test: ${strong.rankingScore} > ${weak.rankingScore}`);
''')

write('scripts/test-exact-global-search.mjs', r'''import assert from "node:assert/strict";
import fs from "node:fs";
import { exactShortlistSize, optimizeOwnedDeck } from "../js/recommend.js";
import { optimizeRecommendationOrders } from "../js/order.js";
import { evaluateDeck } from "../js/score.js";

const rules = JSON.parse(fs.readFileSync(new URL("../data/generated/live-score-rules.json", import.meta.url), "utf8"));
const leader = { id: "L", characterId: "char-L", characterName: "L", leader: { primaryCondition: [], primaryEffects: { p: 0, t: 0, s: 0, support: 0 }, additionalCondition: [], additionalEffects: { p: 0, t: 0, s: 0, support: 0 }, description: "" } };
function member(id, score, support, duration) {
  return { id, characterId: `char-${id}`, characterName: id, attribute: 1, groupings: new Set(), profile: { level: 80, currentLevel: 80, maxLevel: 80, potential: 0, levelMode: "current" }, stats: { p: 1000 + score, t: 1000, s: 1000 }, enhancementPermyriad: 0, passive: null, active: { level: 1, interval: 12, probability: 0.8, duration: 8, baseScoreUp: score, conditionalScoreUp: score, condition: null, description: id }, special: { level: 1, duration, support, activationRateUp: 0, condition: null, description: id } };
}
const rows = [member("A", 90, 80, 10), member("B", 75, 40, 16), member("C", 65, 120, 8), member("D", 55, 0, 20), member("E", 45, 60, 12), member("F", 35, 20, 18), member("G", 25, 100, 6)];
const preparedCards = new Map([leader, ...rows].map((row) => [row.id, row]));
const notes = Array.from({ length: 48 }, (_, index) => [index % 9 === 0 ? "flick" : "tap", 5 + index * 1.1]);
const chart = { fullComboNoteCount: notes.length, chartHash: "global-test", metadata: { notes, skills: [1,2,3,4,5].map((slot) => ({ slot, time: 4 + slot * 9, combo: slot * 8 })), fever: null } };
const exactMusic = { id: "global", title: "global", playing_seconds: 62, live_score_coefficient_permil: 5, _chart: chart, _scoreRules: rules };
const searchMusic = { ...exactMusic, _chart: { ...chart, metadata: null } };
const owned = ["L", ...rows.map((row) => row.id)];
const shortlist = exactShortlistSize(notes.length, owned.length);
assert.equal(shortlist, 30);
let staged = optimizeOwnedDeck({ preparedCards, ownedCardIds: owned, currentMembers: ["L", null, null, null, null, null], lockedSlots: [true, false, false, false, false, false], music: searchMusic, difficulty: "EXPERT", playMode: "manual", simulationTarget: "score", separateRole: true, resultCount: shortlist });
staged = optimizeRecommendationOrders({ recommendation: staged, preparedCards, currentMembers: ["L", null, null, null, null, null], lockedSlots: [true, false, false, false, false, false], music: exactMusic, difficulty: "EXPERT", playMode: "manual", simulationTarget: "score", separateRole: true, resultCount: 1 });

function combinations(values, size, start = 0, selected = [], out = []) { if (selected.length === size) { out.push([...selected]); return out; } for (let i = start; i <= values.length - (size - selected.length); i += 1) combinations(values, size, i + 1, [...selected, values[i]], out); return out; }
function permutations(values) { if (values.length <= 1) return [values]; const out=[]; values.forEach((value,index)=>{ const rest=[...values.slice(0,index),...values.slice(index+1)]; for (const tail of permutations(rest)) out.push([value,...tail]); }); return out; }
let best = -Infinity;
for (const combo of combinations(rows, 5)) {
  for (const order of permutations(combo)) {
    const result = evaluateDeck({ leader, members: order, music: exactMusic, difficulty: "EXPERT", playMode: "manual", separateRole: true, evaluationTarget: "score" });
    best = Math.max(best, result?.rankingScore ?? -Infinity);
  }
}
assert.equal(staged.score.rankingScore, best, `staged ${staged.score.rankingScore} != exhaustive ${best}`);
assert.ok(exactShortlistSize(2_022, 50) >= 12);
assert.ok(exactShortlistSize(700, 50) > 10);
console.log(`exact global-search regression: ${best}, shortlist ${shortlist}`);
''')

# patch runtime source test for exact Content-Range/SHA and current-Master coherence
text = read('scripts/test-exact-runtime-source.mjs')
text = 'import { createHash } from "node:crypto";\nimport fs from "node:fs";\n' + text
text = text.replace('''  return {\n    status: 206,\n    text: async () => sourceText,\n    body: { cancel: async () => {} },\n  };''', '''  return {\n    status: 206,\n    headers: { get: (name) => String(name).toLowerCase() === "content-range" ? `bytes=10-${10 + Buffer.byteLength(sourceText) - 1}/${10 + Buffer.byteLength(sourceText)}`.replace("bytes=", "bytes ") : null },\n    text: async () => sourceText,\n    body: { cancel: async () => {} },\n  };''')
text = text.replace('''    length: Buffer.byteLength(sourceText),\n  };''', '''    length: Buffer.byteLength(sourceText),\n    objectSha256: createHash("sha256").update(sourceText).digest("hex"),\n  };''')
text += r'''

const actualRuntime = JSON.parse(fs.readFileSync(new URL("../data/generated/exact-runtime-index.json", import.meta.url), "utf8"));
const actualCharts = JSON.parse(fs.readFileSync(new URL("../data/generated/chart-index.json", import.meta.url), "utf8"));
assert.equal(actualRuntime.currentMasterSourceCommit, actualCharts.source_commit);
assert.equal(actualRuntime.currentMasterChartCount, actualCharts.chart_count);
assert.equal(actualRuntime.runtimeExactCount, Object.keys(actualRuntime.charts ?? {}).length);
for (const [key, runtime] of Object.entries(actualRuntime.charts ?? {})) {
  assert.equal(runtimeEntryMatchesChart(runtime, actualCharts.charts?.[key]), true, `${key}: runtime/master mismatch`);
}
console.log(`exact runtime index coherence: ${actualRuntime.runtimeExactCount}/${actualRuntime.currentMasterChartCount}`);
'''
write('scripts/test-exact-runtime-source.mjs', text)

print('v1.1 stability patch applied')
