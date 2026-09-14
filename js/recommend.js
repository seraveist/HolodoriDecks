import {
  evaluateDeck,
  leaderPotential,
  memberIntrinsicValue,
  memberPotentialValue,
} from "./score.js?v=1.3.0";
import { unitScoreOrders } from "./search-order-bounds.js";

const EXACT_CASE_LIMIT = 60_000;
const MEMBER_PRUNE_THRESHOLD = 36;
const FOUR_STAR_VALUE_LIMIT = 12;
const FOUR_STAR_SYNERGY_LIMIT = 18;
const REFINE_LEADER_LIMIT = 8;
const REFINE_FOUR_STAR_ANCHORS = 6;
const REFINE_LOCAL_ANCHORS = 20;
const REFINE_LOCAL_ROUNDS = 2;
const EXPLORE_LOCAL_ANCHORS = 8;
const REFINE_BEAM_SCALE = 4;
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

function memberCharacterKey(member) {
  const characterId = String(member?.characterId ?? "");
  return characterId || `card:${String(member?.id ?? "")}`;
}

function hasDuplicateMemberCharacters(members) {
  const keys = (members ?? []).map(memberCharacterKey);
  return new Set(keys).size !== keys.length;
}

function combinationCountByCharacter(rows, selected, cap = Number.MAX_SAFE_INTEGER) {
  if (selected < 0) return 0;
  if (selected === 0) return 1;
  const variantCounts = new Map();
  for (const row of rows) {
    const key = memberCharacterKey(row);
    variantCounts.set(key, (variantCounts.get(key) ?? 0) + 1);
  }
  if (variantCounts.size < selected) return 0;

  const ways = Array(selected + 1).fill(0);
  ways[0] = 1;
  for (const variants of variantCounts.values()) {
    for (let count = selected; count >= 1; count -= 1) {
      ways[count] = Math.min(cap, ways[count] + ways[count - 1] * variants);
    }
  }
  return Math.min(cap, Math.round(ways[selected]));
}

function forEachCombination(rows, size, callback, fixedMembers = []) {
  if (size === 0) {
    callback([]);
    return 1;
  }
  if (size < 0 || rows.length < size) return 0;
  const selected = [];
  const usedCharacters = new Set(fixedMembers.map(memberCharacterKey));
  let count = 0;
  function visit(start) {
    if (selected.length === size) {
      count += 1;
      callback([...selected]);
      return;
    }
    const remaining = size - selected.length;
    for (let index = start; index <= rows.length - remaining; index += 1) {
      const row = rows[index];
      const characterKey = memberCharacterKey(row);
      if (usedCharacters.has(characterKey)) continue;
      usedCharacters.add(characterKey);
      selected.push(row);
      visit(index + 1);
      selected.pop();
      usedCharacters.delete(characterKey);
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

function bestVariantsByCharacter(pool, concept) {
  const best = new Map();
  for (const member of pool) {
    const key = memberCharacterKey(member);
    const current = best.get(key);
    if (!current || conceptMemberValue(member, concept) > conceptMemberValue(current, concept)) {
      best.set(key, member);
    }
  }
  return [...best.values()];
}

function expandSelectedCharacterVariants(pool, selectedMembers) {
  const selectedCharacters = new Set([...selectedMembers].map(memberCharacterKey));
  return pool.filter((member) => selectedCharacters.has(memberCharacterKey(member)));
}

export function memberCandidatePool(pool, leader, fixedMembers = [], concept = "score") {
  if (pool.length <= MEMBER_PRUNE_THRESHOLD) return [...pool];

  const highRarity = pool.filter((member) => memberRarity(member) >= 5);
  const fourStars = pool.filter((member) => memberRarity(member) === 4);
  if (!fourStars.length) return [...pool];

  const selected = new Map(highRarity.map((member) => [member.id, member]));
  const coreMembers = [...fixedMembers, ...bestVariantsByCharacter(highRarity, concept)];
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

  return expandSelectedCharacterVariants(pool, selected.values());
}

export function memberBeamPool(pool, leader, concept) {
  const grouped = new Map();
  for (const member of pool) {
    const key = memberCharacterKey(member);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(member);
  }

  const characters = [...grouped.entries()].map(([key, variants]) => ({
    key,
    variants,
    bestValue: Math.max(...variants.map((member) => conceptMemberValue(member, concept))),
    relevant: variants.some((member) => relevantToLeader(member, leader)),
  })).sort((left, right) => right.bestValue - left.bestValue || left.key.localeCompare(right.key));

  const selectedCharacters = new Set(
    characters.slice(0, BEAM_MEMBER_LIMIT).map((entry) => entry.key),
  );
  characters.filter((entry) => entry.relevant)
    .slice(0, 18)
    .forEach((entry) => selectedCharacters.add(entry.key));

  return pool.filter((member) => selectedCharacters.has(memberCharacterKey(member)));
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
        if (hasDuplicateMemberCharacters([...fixedMembers, ...selected])) continue;
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

function combinedBeamCandidates(memberPool, size, leader, fixedMembers, concept, widthScale = 1) {
  const heuristics = concept === "potential"
    ? ["potential", "score", "performance", "technique", "sense"]
    : ["score", "performance", "technique", "sense"];
  const candidates = new Map();
  const addCandidates = (pool, scale = 1) => {
    if (pool.length < size) return;
    heuristics.forEach((heuristic, index) => {
      const baseWidth = index === 0 ? BEAM_WIDTH : BEAM_SECONDARY_WIDTH;
      const width = Math.max(1, Math.round(baseWidth * scale));
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

  addCandidates(memberPool, widthScale);
  const highRarityPool = memberPool.filter((member) => memberRarity(member) >= 5);
  if (highRarityPool.length >= size && highRarityPool.length < memberPool.length) {
    addCandidates(highRarityPool, 0.75 * widthScale);
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
  exactTotalCaseLimit = Infinity,
  retainOrderBounds = false,
}) {
  const normalizedResultCount = Math.max(1, Math.min(MAX_RESULT_COUNT, Number(resultCount) || DEFAULT_RESULT_COUNT));
  retainOrderBounds = retainOrderBounds && !music;
  const normalizedSimulationTarget = ["score", "potential"].includes(simulationTarget)
    ? simulationTarget
    : "score";
  let normalizedExactCaseLimit = Math.max(1, Math.round(Number(exactCaseLimit) || EXACT_CASE_LIMIT));
  // Selection/import order is not a search signal. Use the catalog's stable
  // order and set semantics so toggling ownership cannot change the beam path.
  const ownedIds = new Set(ownedCardIds);
  const owned = [...preparedCards.values()].filter((card) => ownedIds.has(card.id));
  const locked = Array.from({ length: 6 }, (_, index) => Boolean(lockedSlots?.[index] && currentMembers?.[index]));
  const fixedMemberIdList = currentMembers.slice(1, 6).filter((id, index) => locked[index + 1] && id);
  const fixedMemberIds = new Set(fixedMemberIdList);
  const fixedMembers = fixedMemberIdList.map((id) => preparedCards.get(id)).filter(Boolean);
  const fixedMemberCharacters = new Set(fixedMembers.map(memberCharacterKey));
  const fixedLeader = locked[0] ? preparedCards.get(currentMembers[0]) : null;

  if (owned.length < 6) {
    return { ok: false, reason: "리더 1장과 멤버 5장을 구성하려면 보유 카드가 최소 6장 필요합니다." };
  }

  if (fixedMemberIds.size !== fixedMemberIdList.length) {
    return { ok: false, reason: "같은 카드를 멤버 슬롯에 두 번 고정할 수 없습니다." };
  }
  if (hasDuplicateMemberCharacters(fixedMembers)) {
    return { ok: false, reason: "같은 홀로멤의 다른 카드를 멤버 슬롯에 동시에 고정할 수 없습니다." };
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
  // Bound the cost of the entire request, not just each individual leader.
  normalizedExactCaseLimit = Math.min(normalizedExactCaseLimit,
    Math.max(1, Math.floor(exactTotalCaseLimit / leaders.length)));

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
  const leaderCandidateResults = new Map();
  const seenByLeader = new Map();
  const orderCandidates = new Map();
  const constantOrderCandidates = [];
  const guaranteedValues = [];
  let orderCutoff = -Infinity;
  let lastPrunedCutoff = -Infinity;

  const evaluateFill = (leader, fill, refinement = false) => {
    const memberSlotIds = composeMemberIds(fixedMemberIdList, fill);
    const members = memberSlotIds.map((id) => preparedCards.get(id)).filter(Boolean);
    if (members.length !== 5 || hasDuplicateMemberCharacters(members)) return;
    const key = memberSetKey(memberSlotIds);
    const seen = seenByLeader.get(leader.id) ?? new Set();
    // In the generic bounded search all score-relevant orders are evaluated.
    // Song search retains ordered keys because its first-stage timing differs.
    const evaluationKey = retainOrderBounds ? key : memberSlotIds.join("|");
    if (seen.has(evaluationKey)) return;
    seen.add(evaluationKey);
    seenByLeader.set(leader.id, seen);
    const evaluate = (orderedMembers) => evaluateDeck({
      leader,
      members: orderedMembers,
      music,
      difficulty,
      playMode,
      separateRole,
      evaluationTarget: normalizedSimulationTarget,
    });
    let score = null;
    let bestMembers = members;
    let lowerBound = Infinity;
    let unitLowerBound = Infinity;
    let unitUpperBound = -Infinity;
    for (const order of retainOrderBounds ? unitScoreOrders(members) : [members]) {
      const next = evaluate(order);
      evaluatedCount += 1;
      if (refinement) refinementEvaluatedCount += 1;
      if (!next) continue;
      const value = recommendationValue(next, normalizedSimulationTarget);
      lowerBound = Math.min(lowerBound, value);
      unitLowerBound = Math.min(unitLowerBound, next.unitScore);
      unitUpperBound = Math.max(unitUpperBound, next.unitScore);
      if (!score || value > recommendationValue(score, normalizedSimulationTarget)) {
        score = next;
        bestMembers = order;
      }
    }
    if (!score) return;
    const candidate = {
      leader,
      fill,
      memberSlotIds: bestMembers.map((member) => member.id),
      members: bestMembers,
      score,
      orderUnitUpperBound: unitUpperBound,
      rankingValue: recommendationValue(score, normalizedSimulationTarget),
    };
    const previous = leaderBestValues.get(leader.id);
    if (previous == null || candidate.rankingValue > previous) {
      leaderBestValues.set(leader.id, candidate.rankingValue);
    }
    const leaderResults = leaderCandidateResults.get(leader.id) ?? [];
    keepTopResults(leaderResults, candidate, Math.max(normalizedResultCount, REFINE_LOCAL_ANCHORS));
    leaderCandidateResults.set(leader.id, leaderResults);
    keepTopResults(topResults, candidate, normalizedResultCount);
    if (retainOrderBounds) {
      // Every representative is at least this composition's minimum score.
      // Discard only when even its maximum cannot reach the current TOP K.
      if (guaranteedValues.length < normalizedResultCount || lowerBound > guaranteedValues.at(-1)) {
        guaranteedValues.push(lowerBound);
        guaranteedValues.sort((a, b) => b - a);
        guaranteedValues.length = Math.min(guaranteedValues.length, normalizedResultCount);
        if (guaranteedValues.length === normalizedResultCount) orderCutoff = guaranteedValues.at(-1);
      }
      if (lowerBound === candidate.rankingValue && unitLowerBound === unitUpperBound) {
        // Their final rank is known, even though the SP order is not.
        keepTopResults(constantOrderCandidates, candidate, normalizedResultCount);
      } else if (candidate.rankingValue >= orderCutoff) {
        orderCandidates.set(`${leader.id}::${key}`, candidate);
      }
      if (orderCandidates.size > 1000 && orderCutoff > lastPrunedCutoff) {
        lastPrunedCutoff = orderCutoff;
        for (const [candidateKey, row] of orderCandidates) {
          if (row.rankingValue < orderCutoff) orderCandidates.delete(candidateKey);
        }
      }
    }
  };

  for (const leader of leaders) {
    if (separateRole && fixedMembers.some((member) => member.characterId === leader.characterId)) continue;
    const rawMemberPool = owned.filter((card) => card.id !== leader.id
      && !fixedMemberIds.has(card.id)
      && !fixedMemberCharacters.has(memberCharacterKey(card))
      && (!separateRole || card.characterId !== leader.characterId));
    if (rawMemberPool.length < need) continue;

    const rawLeaderCases = combinationCountByCharacter(rawMemberPool, need, normalizedExactCaseLimit + 1);
    const shouldPrune = rawLeaderCases > normalizedExactCaseLimit;
    const memberPool = shouldPrune
      ? memberCandidatePool(rawMemberPool, leader, fixedMembers, normalizedSimulationTarget)
      : rawMemberPool;
    const leaderCases = combinationCountByCharacter(memberPool, need, normalizedExactCaseLimit + 1);
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
      forEachCombination(memberPool, need, (fill) => evaluateFill(leader, fill), fixedMembers);
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

  const exploreReplacements = (state, anchorCount) => {
    const { leader, rawMemberPool } = state;
    for (let round = 0; round < REFINE_LOCAL_ROUNDS; round += 1) {
      const anchors = [...(leaderCandidateResults.get(leader.id) ?? [])].slice(0, anchorCount);
      const before = evaluatedCount;
      for (const anchor of anchors) {
        for (let index = 0; index < anchor.fill.length; index += 1) {
          for (const replacement of rawMemberPool) {
            if (anchor.memberSlotIds.includes(replacement.id)) continue;
            const swapped = [...anchor.fill];
            swapped[index] = replacement;
            evaluateFill(leader, swapped, true);
          }
        }
      }
      if (evaluatedCount === before) break;
    }
  };

  // Initial beam rank is not a bound on a leader's best deck. Give every
  // non-exhaustive leader a real-score neighborhood search before selecting
  // which leaders receive the wider, more expensive beam pass.
  let exploredLeaderCount = 0;
  for (const state of leaderSearchState.values()) {
    if (state.leaderExact && !state.shouldPrune) continue;
    exploredLeaderCount += 1;
    exploreReplacements(state, EXPLORE_LOCAL_ANCHORS);
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
    const highRarityCases = combinationCountByCharacter(highRarityPool, need, normalizedExactCaseLimit + 1);

    refinedLeaderCount += 1;
    combinedBeamCandidates(
      rawMemberPool,
      need,
      leader,
      fixedMembers,
      normalizedSimulationTarget,
      REFINE_BEAM_SCALE,
    ).forEach((fill) => evaluateFill(leader, fill, true));

    if (highRarityPool.length >= need && highRarityCases <= normalizedExactCaseLimit) {
      forEachCombination(highRarityPool, need, (fill) => evaluateFill(leader, fill, true), fixedMembers);
    }

    if (need <= 0) continue;
    exploreReplacements(state, REFINE_LOCAL_ANCHORS);

    const fourStars = memberPool.filter((member) => memberRarity(member) === 4);
    if (!fourStars.length) continue;
    const fourStarAnchors = [...(leaderCandidateResults.get(leader.id) ?? [])]
      .slice(0, REFINE_FOUR_STAR_ANCHORS);
    const seenFourStarSwaps = new Set();
    for (const anchor of fourStarAnchors) {
      for (let replaceIndex = 0; replaceIndex < anchor.fill.length; replaceIndex += 1) {
        for (const fourStar of fourStars) {
          if (anchor.memberSlotIds.includes(fourStar.id)) continue;
          const swapped = [...anchor.fill];
          swapped[replaceIndex] = fourStar;
          const ids = composeMemberIds(fixedMemberIdList, swapped);
          if (new Set(ids).size !== ids.length) continue;
          if (hasDuplicateMemberCharacters([...fixedMembers, ...swapped])) continue;
          const key = memberSetKey(ids);
          if (seenFourStarSwaps.has(key)) continue;
          seenFourStarSwaps.add(key);
          evaluateFill(leader, swapped, true);
        }
      }
    }
  }

  // Strong member sets discovered under one leader must also get a chance
  // under the other eligible leaders, including leaders whose own beam followed
  // a different synergy path. Presets and character exclusions still apply.
  const sharedFills = new Map();
  for (const rows of leaderCandidateResults.values()) {
    for (const row of rows.slice(0, REFINE_LOCAL_ANCHORS)) {
      sharedFills.set(memberSetKey(row.fill.map((member) => member.id)), row.fill);
    }
  }
  for (const state of leaderSearchState.values()) {
    if (state.leaderExact && !state.shouldPrune) continue;
    const eligible = new Set(state.rawMemberPool.map((member) => member.id));
    for (const fill of sharedFills.values()) {
      if (fill.every((member) => eligible.has(member.id))) evaluateFill(state.leader, fill, true);
    }
  }

  if (!topResults.length) {
    return {
      ok: false,
      reason: "고정 프리셋을 만족하는 유효한 편성을 찾지 못했습니다.",
      evaluatedCount,
    };
  }

  const finalists = retainOrderBounds
    ? [...orderCandidates.values(), ...constantOrderCandidates]
      .filter((row) => row.rankingValue >= orderCutoff).sort(compareResults)
    : topResults;
  const results = finalists.map((result) => {
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
      ...(retainOrderBounds ? { orderScoreUpperBound: result.rankingValue,
        orderUnitUpperBound: result.orderUnitUpperBound } : {}),
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
    exploredLeaderCount,
    refinementEvaluatedCount,
    estimatedCases,
    averageRawMemberPool: processedLeaderCount ? rawMemberCount / processedLeaderCount : 0,
    averagePrunedMemberPool: processedLeaderCount ? prunedMemberCount / processedLeaderCount : 0,
  };
}
