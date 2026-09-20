import { evaluateDeck, prepareDeckComposition } from "./score.js?v=1.3.1";
import { ORDER_REFERENCE, ORDER_REFERENCE_MUSIC } from "./order-reference.js?v=1.3.1";

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function rankingValue(score, simulationTarget) {
  return simulationTarget === "potential"
    ? finite(score?.potentialRankingScore)
    : finite(score?.rankingScore);
}

function compareResults(left, right) {
  return right.rankingValue - left.rankingValue
    || finite(right.score?.rankingScore) - finite(left.score?.rankingScore)
    || finite(right.score?.unitScore) - finite(left.score?.unitScore)
    || left.members.join("|").localeCompare(right.members.join("|"));
}

function compareOrders(left, right, generic) {
  // Generic units retain their normal ranking; only their representative order
  // is selected by the common chart's potential score, for either search goal.
  return (generic ? right._orderPotential - left._orderPotential : 0)
    || compareResults(left, right);
}

function compositionKey(result) {
  const leaderId = result?.members?.[0] ?? "";
  const memberIds = result?.members?.slice?.(1, 6) ?? [];
  return `${leaderId}::${[...memberIds].sort().join("|")}`;
}

export function dedupeRecommendationResults(results = []) {
  const bestByComposition = new Map();
  for (const result of results) {
    const key = compositionKey(result);
    const previous = bestByComposition.get(key);
    if (!previous || compareResults(result, previous) < 0) bestByComposition.set(key, result);
  }
  return [...bestByComposition.values()].sort(compareResults);
}

function permutations(values) {
  if (values.length <= 1) return [values];
  const result = [];
  const used = Array(values.length).fill(false);
  const current = [];
  function visit() {
    if (current.length === values.length) {
      result.push([...current]);
      return;
    }
    for (let index = 0; index < values.length; index += 1) {
      if (used[index]) continue;
      used[index] = true;
      current.push(values[index]);
      visit();
      current.pop();
      used[index] = false;
    }
  }
  visit();
  return result;
}

function orderableMemberIds(result) {
  return result.members.slice(1, 6);
}

export function optimizeRecommendationOrders({
  recommendation,
  accountBonuses = null,
  preparedCards,
  currentMembers,
  lockedSlots,
  music,
  difficulty = "EXPERT",
  playMode = "auto",
  simulationTarget = "score",
  separateRole = true,
  resultCount = 5,
}) {
  // Member presets are inclusion constraints, not positional locks. Compare all
  // 5! orders per composition, using a shared reference when no song is chosen.
  void currentMembers;
  void lockedSlots;

  if (!recommendation?.ok) return recommendation;

  const generic = !music;
  const orderMusic = music ?? ORDER_REFERENCE_MUSIC;
  const exactSkills = music?._chart?.metadata?.skills;
  const chartMode = generic ? "reference" : Array.isArray(exactSkills) && exactSkills.length > 0 ? "exact" : "estimated";
  let evaluatedCount = 0;
  const orderedCandidates = [];
  const compositions = dedupeRecommendationResults(recommendation.results);

  for (const result of compositions) {
    // Generic search provides a true maximum over all unit-score-relevant
    // orders. Once that bound cannot improve TOP K, no further SP permutations
    // can promote this composition. Song shortlists have no such bound.
    if (generic && Number.isFinite(result.orderScoreUpperBound)
      && orderedCandidates.length >= resultCount) {
      const cutoff = [...orderedCandidates].sort(compareResults)[resultCount - 1];
      if (result.orderScoreUpperBound < cutoff.rankingValue
        || (result.orderScoreUpperBound === cutoff.rankingValue
          && result.orderUnitUpperBound <= cutoff.score.unitScore)) continue;
    }
    const leader = preparedCards.get(result.members[0]);
    if (!leader) continue;
    const selectedMemberIds = orderableMemberIds(result);
    if (selectedMemberIds.length !== 5 || new Set(selectedMemberIds).size !== 5) continue;
    let best = null;

    for (const memberIds of permutations(selectedMemberIds)) {
      const members = memberIds.map((id) => preparedCards.get(id));
      if (members.some((member) => !member)) continue;

      // Passive target selection can be order-sensitive when target stats tie.
      // Rebuild the composition for every permutation; reusing the composition
      // prepared for the first order leaks its passive target map into later orders.
      const preparedComposition = prepareDeckComposition({ leader, members, separateRole, accountBonuses });
      if (!preparedComposition) continue;

      const score = evaluateDeck({
        leader,
        accountBonuses,
        members,
        music: orderMusic,
        difficulty: generic ? "EXPERT" : difficulty,
        playMode,
        separateRole,
        evaluationTarget: generic ? "potential" : simulationTarget,
        preparedComposition,
      });
      evaluatedCount += 1;
      if (!score) continue;

      const candidate = {
        members: [leader.id, ...memberIds],
        score,
        rankingValue: generic
          ? finite(simulationTarget === "potential" ? score.potentialUnitScore : score.unitScore)
          : rankingValue(score, simulationTarget),
        _orderPotential: generic ? score.potentialRankingScore : null,
        _preparedComposition: preparedComposition,
        ...(generic ? { orderEvaluation: {
          basis: "reference",
          referenceId: ORDER_REFERENCE.id,
          target: "potential",
          potentialScore: score.potentialRankingScore,
          duration: ORDER_REFERENCE.duration,
          noteCount: ORDER_REFERENCE.noteCount,
          playMode,
          specialWindows: score.songProjection.specialWindows,
        } } : {}),
      };
      if (!best || compareOrders(candidate, best, generic) < 0) best = candidate;
    }
    if (best) orderedCandidates.push(best);
  }

  const dedupedCandidates = dedupeRecommendationResults(orderedCandidates);
  const finalResults = dedupedCandidates.slice(0, Math.max(1, resultCount)).map((result) => {
    const leader = preparedCards.get(result.members[0]);
    const members = result.members.slice(1).map((id) => preparedCards.get(id));
    const score = evaluateDeck({
      leader,
      accountBonuses,
      members,
      music,
      difficulty,
      playMode,
      separateRole,
      includeDiagnostics: true,
      evaluationTarget: "both",
      preparedComposition: result._preparedComposition,
    });
    const { _preparedComposition, _orderPotential, ...publicResult } = result;
    return {
      ...publicResult,
      score,
      rankingValue: rankingValue(score, simulationTarget),
    };
  }).sort(compareResults);

  if (!finalResults.length) return recommendation;
  return {
    ...recommendation,
    results: finalResults,
    members: finalResults[0].members,
    score: finalResults[0].score,
    orderOptimization: {
      mode: "exact",
      chartMode,
      target: generic ? "potential" : simulationTarget,
      evaluatedCount,
      shortlistedCount: compositions.length,
    },
  };
}
