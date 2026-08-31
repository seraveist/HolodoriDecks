import {
  evaluateDeck,
  leaderPotential,
  memberIntrinsicValue,
  memberPotentialValue,
} from "./score.js?v=1.1.0";

const EXACT_CASE_LIMIT = 60_000;
const MEMBER_PRUNE_THRESHOLD = 36;
const FOUR_STAR_VALUE_LIMIT = 12;
const FOUR_STAR_SYNERGY_LIMIT = 18;
const REFINE_LEADER_LIMIT = 8;
const REFINE_FOUR_STAR_ANCHORS = 6;
const BEAM_MEMBER_LIMIT = 52;
const BEAM_WIDTH = 360;
const BEAM_SECONDARY_WIDTH = 180;
const DEFAULT_RESULT_COUNT = 5;
const MAX_RESULT_COUNT = 30;

const CONCEPT_STAT = Object.freeze({
  performance: "p",
  technique: "t",
  sense: "s",
});

export function cardPower(card) {
  const levels = card?.growth?.levels ?? [];
  return levels.reduce((highest, level) => {
    const value = Number(level?.parameterBaseValue) || 0;
    return Math.max(highest, value);
  }, 0);
}

export function compareByPower(left, right) {
  return cardPower(right) - cardPower(left)
    || Number(right.rarity) - Number(left.rarity)
    || Number(left.order) - Number(right.order);
}

export function rankOwnedCards(cards, ownedCardIds) {
  const owned = new Set(ownedCardIds);
  return cards.filter((card) => owned.has(card.id)).sort(compareByPower);
}

function combinationCount(total, selected, cap = Number.MAX_SAFE_INTEGER) {
  if (selected < 0 || total < selected) return 0;
  const k = Math.min(selected, total - selected);
  let value = 1;
  for (let index = 1; index <= k; index += 1) {
    value = value * (total - k + index) / index;
    if (value >= cap) return cap;
  }
  return Math.round(value);
}

function forEachCombination(rows, size, callback) {
  if (size === 0) {
    callback([]);
    return 1;
  }
  if (size < 0 || rows.length < size) return 0;
  const selected = [];
  let count = 0;
  function visit(start) {
    if (selected.length === size) {
      count += 1;
      callback([...selected]);
      return;
    }
    const remaining = size - selected.length;
    for (let index = start; index <= rows.length - remaining; index += 1) {
      selected.push(rows[index]);
      visit(index + 1);
      selected.pop();
    }
  }
  visit(0);
  return count;
}

function composeMemberIds(requiredMemberIds, fill) {
  return [...requiredMemberIds, ...fill.map((card) => card.id)];
}

function memberConditionProgress(condition, selected) {
  if (!condition || !["attribute", "group"].includes(condition.kind)) return 0;
  const matched = selected.filter((member) => condition.kind === "attribute"
    ? member.attribute === condition.value
    : member.groupings.has(condition.value)).length;
  return Math.min(matched, condition.count) / Math.max(1, condition.count);
}

function conceptMemberValue(member, concept) {
  if (concept === "potential") return memberPotentialValue(member);
  const stat = CONCEPT_STAT[concept];
  return stat ? member.stats[stat] : memberIntrinsicValue(member);
}

function conceptLeaderPotential(leader, concept) {
  const stat = CONCEPT_STAT[concept];
  if (!stat) return leaderPotential(leader);
  return leader.leader.primaryEffects[stat] + leader.leader.additionalEffects[stat];
}

function partialHeuristic(leader, selected, concept) {
  let value = selected.reduce((sum, member) => sum + conceptMemberValue(member, concept), 0);
  for (const condition of leader.leader.primaryCondition) {
    value += memberConditionProgress(condition, selected) * 24_000;
  }
  for (const member of selected) {
    value += memberConditionProgress(member.passive?.condition, selected) * 2_400;
  }
  return value + conceptLeaderPotential(leader, concept) * 250;
}

function relevantToLeader(member, leader) {
  return [...leader.leader.primaryCondition, ...leader.leader.additionalCondition].some((condition) => (
    condition.kind === "attribute"
      ? member.attribute === condition.value
      : condition.kind === "group" && member.groupings.has(condition.value)
  ));
}

function memberRarity(member) {
  const rarity = Number(member?.raw?.rarity);
  return Number.isFinite(rarity) && rarity > 0 ? rarity : 5;
}

function memberMatchesStaticCondition(member, condition) {
  if (condition?.kind === "attribute") return member.attribute === condition.value;
  if (condition?.kind === "group") return member.groupings.has(condition.value);
  return false;
}

function targetMatchesMember(target, member) {
  if (!target || target.kind === "all") return true;
  if (target.kind === "attribute") return member.attribute === target.value;
  if (target.kind === "group") return member.groupings.has(target.value);
  return false;
}

function fourStarSynergyValue(member, leader, coreMembers) {
  let value = 0;
  if (relevantToLeader(member, leader)) value += 100_000;

  for (const core of coreMembers) {
    if (memberMatchesStaticCondition(member, core.passive?.condition)) value += 8_000;
  }

  const passive = member.passive;
  if (passive?.effect) {
    const targetCount = coreMembers.filter((core) => targetMatchesMember(passive.effect.target, core)).length;
    value += Number(passive.effect.value || 0) * Math.max(1, targetCount) * 120;
    if (!passive.condition) value += 2_000;
    else {
      const currentMatches = coreMembers.filter((core) => memberMatchesStaticCondition(core, passive.condition)).length;
      value += Math.min(currentMatches, Number(passive.condition.count) || 1) * 1_200;
    }
  }

  value += Number(member.special?.support || 0) * 80;
  value += Number(member.special?.activationRateUp || 0) * 40;
  return value;
}

export function memberCandidatePool(pool, leader, fixedMembers = [], concept = "score") {
  if (pool.length <= MEMBER_PRUNE_THRESHOLD) return [...pool];

  const highRarity = pool.filter((member) => memberRarity(member) >= 5);
  const fourStars = pool.filter((member) => memberRarity(member) === 4);
  if (!fourStars.length) return [...pool];

  const selected = new Map(highRarity.map((member) => [member.id, member]));
  const coreMembers = [...fixedMembers, ...highRarity];
  const byValue = [...fourStars].sort((left, right) => (
    conceptMemberValue(right, concept) - conceptMemberValue(left, concept)
  ));
  byValue.slice(0, FOUR_STAR_VALUE_LIMIT).forEach((member) => selected.set(member.id, member));

  const bySynergy = [...fourStars].sort((left, right) => (
    fourStarSynergyValue(right, leader, coreMembers) - fourStarSynergyValue(left, leader, coreMembers)
      || conceptMemberValue(right, concept) - conceptMemberValue(left, concept)
  ));
  bySynergy.slice(0, FOUR_STAR_SYNERGY_LIMIT).forEach((member) => selected.set(member.id, member));

  fourStars.filter((member) => relevantToLeader(member, leader))
    .forEach((member) => selected.set(member.id, member));

  return pool.filter((member) => selected.has(member.id));
}

function memberBeamPool(pool, leader, concept) {
  const ranked = [...pool].sort((left, right) => conceptMemberValue(right, concept) - conceptMemberValue(left, concept));
  const selected = new Map(ranked.slice(0, BEAM_MEMBER_LIMIT).map((member) => [member.id, member]));
  ranked.filter((member) => relevantToLeader(member, leader)).slice(0, 18)
    .forEach((member) => selected.set(member.id, member));
  return [...selected.values()];
}

function beamCombinations(pool, size, leader, fixedMembers, concept, width = BEAM_WIDTH) {
  if (size === 0) return [[]];
  let beams = [{ selected: [], start: 0, score: partialHeuristic(leader, fixedMembers, concept) }];
  for (let depth = 0; depth < size; depth += 1) {
    const expanded = [];
    for (const beam of beams) {
      const remaining = size - depth;
      for (let index = beam.start; index <= pool.length - remaining; index += 1) {
        const selected = [...beam.selected, pool[index]];
        expanded.push({
          selected,
          start: index + 1,
          score: partialHeuristic(leader, [...fixedMembers, ...selected], concept),
        });
      }
    }
    expanded.sort((left, right) => right.score - left.score);
    beams = expanded.slice(0, width);
  }
  return beams.map((beam) => beam.selected);
}

function combinedBeamCandidates(memberPool, size, leader, fixedMembers, concept) {
  const heuristics = concept === "potential"
    ? ["potential", "score", "performance", "technique", "sense"]
    : ["score", "performance", "technique", "sense"];
  const candidates = new Map();
  const addCandidates = (pool, widthScale = 1) => {
    if (pool.length < size) return;
    heuristics.forEach((heuristic, index) => {
      const baseWidth = index === 0 ? BEAM_WIDTH : BEAM_SECONDARY_WIDTH;
      const width = Math.max(1, Math.round(baseWidth * widthScale));
      beamCombinations(
        memberBeamPool(pool, leader, heuristic),
        size,
        leader,
        fixedMembers,
        heuristic,
        width,
      ).forEach((cards) => candidates.set(cards.map((card) => card.id).sort().join("|"), cards));
    });
  };

  addCandidates(memberPool);
  const highRarityPool = memberPool.filter((member) => memberRarity(member) >= 5);
  if (highRarityPool.length >= size && highRarityPool.length < memberPool.length) {
    addCandidates(highRarityPool, 0.75);
  }
  return [...candidates.values()];
}

export function exactShortlistSize(noteCount = 0, ownedCount = 0) {
  const notes = Math.max(0, Number(noteCount) || 0);
  const owned = Math.max(0, Number(ownedCount) || 0);
  if (owned > 0 && owned <= 18) return MAX_RESULT_COUNT;
  if (notes >= 1_600) return 12;
  if (notes >= 1_200) return 16;
  if (notes >= 800) return 20;
  return 24;
}

export function recommendationValue(score, simulationTarget = "score") {
  return simulationTarget === "potential"
    ? Number(score.potentialRankingScore) || 0
    : Number(score.rankingScore) || 0;
}

function compareResults(left, right) {
  return right.rankingValue - left.rankingValue
    || right.score.rankingScore - left.score.rankingScore
    || right.score.unitScore - left.score.unitScore;
}

function resultCompositionKey(candidate) {
  const leaderId = candidate.leader?.id ?? candidate.members?.[0] ?? "";
  const memberIds = candidate.memberSlotIds ?? candidate.members?.slice?.(1) ?? [];
  return `${leaderId}::${[...memberIds].sort().join("|")}`;
}

function memberSetKey(memberIds) {
  return [...memberIds].sort().join("|");
}

function keepTopResults(results, candidate, limit) {
  const key = resultCompositionKey(candidate);
  const duplicateIndex = results.findIndex((row) => resultCompositionKey(row) === key);
  if (duplicateIndex >= 0) {
    if (compareResults(candidate, results[duplicateIndex]) >= 0) return;
    results[duplicateIndex] = candidate;
    results.sort(compareResults);
    return;
  }
  if (results.length < limit) {
    results.push(candidate);
    results.sort(compareResults);
    return;
  }
  if (compareResults(candidate, results.at(-1)) >= 0) return;
  results[results.length - 1] = candidate;
  results.sort(compareResults);
}

export function optimizeOwnedDeck({
  preparedCards,
  ownedCardIds,
  currentMembers,
  lockedSlots,
  music = null,
  difficulty = "EXPERT",
  playMode = "auto",
  simulationTarget = "score",
  separateRole = true,
  resultCount = DEFAULT_RESULT_COUNT,
  exactCaseLimit = EXACT_CASE_LIMIT,
}) {
  const normalizedResultCount = Math.max(1, Math.min(MAX_RESULT_COUNT, Number(resultCount) || DEFAULT_RESULT_COUNT));
  const normalizedSimulationTarget = ["score", "potential"].includes(simulationTarget)
    ? simulationTarget
    : "score";
  const normalizedExactCaseLimit = Math.max(1, Math.round(Number(exactCaseLimit) || EXACT_CASE_LIMIT));
  const owned = ownedCardIds.map((id) => preparedCards.get(id)).filter(Boolean);
  const locked = Array.from({ length: 6 }, (_, index) => Boolean(lockedSlots?.[index] && currentMembers?.[index]));
  const fixedMemberIdList = currentMembers.slice(1, 6).filter((id, index) => locked[index + 1] && id);
  const fixedMemberIds = new Set(fixedMemberIdList);
  const fixedMembers = fixedMemberIdList.map((id) => preparedCards.get(id)).filter(Boolean);
  const fixedLeader = locked[0] ? preparedCards.get(currentMembers[0]) : null;

  if (owned.length < 6) {
    return { ok: false, reason: "리더 1장과 멤버 5장을 구성하려면 보유 카드가 최소 6장 필요합니다." };
  }

  if (fixedMemberIds.size !== fixedMemberIdList.length) {
    return { ok: false, reason: "같은 카드를 멤버 슬롯에 두 번 고정할 수 없습니다." };
  }
  if (separateRole && fixedLeader && fixedMembers.some((card) => card.characterId === fixedLeader.characterId)) {
    return { ok: false, reason: "리더/멤버 분리 조건 때문에 고정 리더와 같은 홀로멤을 멤버로 사용할 수 없습니다." };
  }

  let leaders = fixedLeader
    ? [fixedLeader]
    : owned.filter((card) => !fixedMemberIds.has(card.id));
  if (!leaders.length) {
    return { ok: false, reason: "리더로 사용할 수 있는 보유 카드가 없습니다." };
  }
  const need = 5 - fixedMembers.length;
  if (need < 0) return { ok: false, reason: "고정 멤버가 5장을 초과했습니다." };

  let estimatedCases = 0;
  let exactLeaderCount = 0;
  let beamLeaderCount = 0;
  let prunedLeaderCount = 0;
  let processedLeaderCount = 0;
  let prunedMemberCount = 0;
  let rawMemberCount = 0;
  let evaluatedCount = 0;
  let refinementEvaluatedCount = 0;
  const topResults = [];
  const leaderBestValues = new Map();
  const leaderSearchState = new Map();

  const evaluateFill = (leader, fill, refinement = false) => {
    const memberSlotIds = composeMemberIds(fixedMemberIdList, fill);
    const members = memberSlotIds.map((id) => preparedCards.get(id)).filter(Boolean);
    if (members.length !== 5) return;
    const score = evaluateDeck({
      leader,
      members,
      music,
      difficulty,
      playMode,
      separateRole,
      evaluationTarget: normalizedSimulationTarget,
    });
    evaluatedCount += 1;
    if (refinement) refinementEvaluatedCount += 1;
    if (!score) return;
    const candidate = {
      leader,
      fill,
      memberSlotIds,
      members,
      score,
      rankingValue: recommendationValue(score, normalizedSimulationTarget),
    };
    const previous = leaderBestValues.get(leader.id);
    if (previous == null || candidate.rankingValue > previous) {
      leaderBestValues.set(leader.id, candidate.rankingValue);
    }
    keepTopResults(topResults, candidate, normalizedResultCount);
  };

  for (const leader of leaders) {
    if (separateRole && fixedMembers.some((member) => member.characterId === leader.characterId)) continue;
    const rawMemberPool = owned.filter((card) => card.id !== leader.id
      && !fixedMemberIds.has(card.id)
      && (!separateRole || card.characterId !== leader.characterId));
    if (rawMemberPool.length < need) continue;

    const rawLeaderCases = combinationCount(rawMemberPool.length, need, normalizedExactCaseLimit + 1);
    const shouldPrune = rawLeaderCases > normalizedExactCaseLimit;
    const memberPool = shouldPrune
      ? memberCandidatePool(rawMemberPool, leader, fixedMembers, normalizedSimulationTarget)
      : rawMemberPool;
    const leaderCases = combinationCount(memberPool.length, need, normalizedExactCaseLimit + 1);
    const leaderExact = leaderCases <= normalizedExactCaseLimit;
    processedLeaderCount += 1;
    if (shouldPrune && memberPool.length < rawMemberPool.length) prunedLeaderCount += 1;
    rawMemberCount += rawMemberPool.length;
    prunedMemberCount += memberPool.length;
    estimatedCases += leaderCases;
    if (leaderExact) exactLeaderCount += 1;
    else beamLeaderCount += 1;
    leaderSearchState.set(leader.id, { leader, rawMemberPool, memberPool, leaderExact, shouldPrune });

    if (leaderExact) {
      forEachCombination(memberPool, need, (fill) => evaluateFill(leader, fill));
    } else {
      combinedBeamCandidates(
        memberPool,
        need,
        leader,
        fixedMembers,
        normalizedSimulationTarget,
      ).forEach((fill) => evaluateFill(leader, fill));
    }
  }

  const refineLeaderIds = [...leaderBestValues.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, REFINE_LEADER_LIMIT)
    .map(([leaderId]) => leaderId);
  let refinedLeaderCount = 0;

  for (const leaderId of refineLeaderIds) {
    const state = leaderSearchState.get(leaderId);
    if (!state || (state.leaderExact && !state.shouldPrune)) continue;
    const { leader, rawMemberPool, memberPool } = state;
    const highRarityPool = rawMemberPool.filter((member) => memberRarity(member) >= 5);
    const highRarityCases = combinationCount(highRarityPool.length, need, normalizedExactCaseLimit + 1);
    if (highRarityCases > normalizedExactCaseLimit || highRarityPool.length < need) continue;

    refinedLeaderCount += 1;
    forEachCombination(highRarityPool, need, (fill) => evaluateFill(leader, fill, true));

    const fourStars = memberPool.filter((member) => memberRarity(member) === 4);
    if (!fourStars.length || need <= 0) continue;
    const anchors = topResults
      .filter((candidate) => candidate.leader.id === leader.id)
      .slice(0, REFINE_FOUR_STAR_ANCHORS);
    const seenSwaps = new Set();
    for (const anchor of anchors) {
      for (let replaceIndex = 0; replaceIndex < anchor.fill.length; replaceIndex += 1) {
        for (const fourStar of fourStars) {
          if (anchor.memberSlotIds.includes(fourStar.id)) continue;
          const swapped = [...anchor.fill];
          swapped[replaceIndex] = fourStar;
          const ids = composeMemberIds(fixedMemberIdList, swapped);
          if (new Set(ids).size !== ids.length) continue;
          const key = memberSetKey(ids);
          if (seenSwaps.has(key)) continue;
          seenSwaps.add(key);
          evaluateFill(leader, swapped, true);
        }
      }
    }
  }

  if (!topResults.length) {
    return {
      ok: false,
      reason: "고정 프리셋과 리더 발동 조건을 함께 만족하는 편성을 찾지 못했습니다.",
      evaluatedCount,
    };
  }

  const results = topResults.map((result) => {
    const score = evaluateDeck({
      leader: result.leader,
      members: result.members,
      music,
      difficulty,
      playMode,
      separateRole,
      includeDiagnostics: true,
    });
    return {
      members: [result.leader.id, ...result.memberSlotIds],
      score,
      rankingValue: recommendationValue(score, normalizedSimulationTarget),
    };
  }).sort(compareResults);
  return {
    ok: true,
    results,
    members: results[0].members,
    score: results[0].score,
    simulationTarget: normalizedSimulationTarget,
    evaluatedCount,
    searchMode: beamLeaderCount === 0 && prunedLeaderCount === 0
      ? "exact"
      : exactLeaderCount === 0 ? "beam" : "hybrid",
    fixedCount: locked.filter(Boolean).length,
    eligibleLeaderCount: leaders.length,
    exactLeaderCount,
    beamLeaderCount,
    prunedLeaderCount,
    refinedLeaderCount,
    refinementEvaluatedCount,
    estimatedCases,
    averageRawMemberPool: processedLeaderCount ? rawMemberCount / processedLeaderCount : 0,
    averagePrunedMemberPool: processedLeaderCount ? prunedMemberCount / processedLeaderCount : 0,
  };
}
