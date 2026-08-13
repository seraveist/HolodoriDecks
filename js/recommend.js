import {
  evaluateDeck,
  leaderPotential,
  memberIntrinsicValue,
  memberPotentialValue,
} from "./score.js?v=20260813.1";

const EXACT_CASE_LIMIT = 650_000;
const BEAM_MEMBER_LIMIT = 52;
const BEAM_WIDTH = 360;
const BEAM_SECONDARY_WIDTH = 180;
const DEFAULT_RESULT_COUNT = 5;

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
  heuristics.forEach((heuristic, index) => {
    const width = index === 0 ? BEAM_WIDTH : BEAM_SECONDARY_WIDTH;
    beamCombinations(
      memberBeamPool(memberPool, leader, heuristic),
      size,
      leader,
      fixedMembers,
      heuristic,
      width,
    ).forEach((cards) => candidates.set(cards.map((card) => card.id).sort().join("|"), cards));
  });
  return [...candidates.values()];
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

function keepTopResults(results, candidate, limit) {
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
}) {
  const normalizedResultCount = Math.max(1, Math.min(10, Number(resultCount) || DEFAULT_RESULT_COUNT));
  const normalizedSimulationTarget = ["score", "potential"].includes(simulationTarget)
    ? simulationTarget
    : "score";
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
  for (const leader of leaders) {
    const poolSize = owned.filter((card) => card.id !== leader.id
      && !fixedMemberIds.has(card.id)
      && (!separateRole || card.characterId !== leader.characterId)).length;
    estimatedCases += combinationCount(poolSize, need, EXACT_CASE_LIMIT + 1);
    if (estimatedCases > EXACT_CASE_LIMIT) break;
  }
  const exact = estimatedCases <= EXACT_CASE_LIMIT;
  let evaluatedCount = 0;
  const topResults = [];
  for (const leader of leaders) {
    if (separateRole && fixedMembers.some((member) => member.characterId === leader.characterId)) continue;
    const memberPool = owned.filter((card) => card.id !== leader.id
      && !fixedMemberIds.has(card.id)
      && (!separateRole || card.characterId !== leader.characterId));
    if (memberPool.length < need) continue;
    const candidates = exact
      ? null
      : combinedBeamCandidates(
        memberPool,
        need,
        leader,
        fixedMembers,
        normalizedSimulationTarget,
      );

    const evaluateFill = (fill) => {
      const memberSlotIds = composeMemberIds(fixedMemberIdList, fill);
      const members = memberSlotIds.map((id) => preparedCards.get(id)).filter(Boolean);
      const score = evaluateDeck({ leader, members, music, difficulty, playMode, separateRole, evaluationTarget: normalizedSimulationTarget });
      evaluatedCount += 1;
      if (!score) return;
      const candidate = {
        leader,
        fill,
        memberSlotIds,
        members,
        score,
        rankingValue: recommendationValue(score, normalizedSimulationTarget),
      };
      keepTopResults(topResults, candidate, normalizedResultCount);
    };

    if (exact) forEachCombination(memberPool, need, evaluateFill);
    else candidates.forEach(evaluateFill);
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
    searchMode: exact ? "exact" : "beam",
    fixedCount: locked.filter(Boolean).length,
    eligibleLeaderCount: leaders.length,
  };
}
