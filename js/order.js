import { evaluateDeck, prepareDeckComposition } from "./score.js?v=1.1.0";

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function rankingValue(score, simulationTarget) {
  return simulationTarget === "potential"
    ? finite(score?.potentialRankingScore)
    : finite(score?.rankingScore);
}

function compareResults(left, right) {
  return right.rankingValue - left.rankingValue
    || finite(right.score?.rankingScore) - finite(left.score?.rankingScore)
    || finite(right.score?.unitScore) - finite(left.score?.unitScore);
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
  void currentMembers;
  void lockedSlots;

  const exactSkills = music?._chart?.metadata?.skills;
  if (!recommendation?.ok || !Array.isArray(exactSkills) || exactSkills.length === 0) {
    if (recommendation?.ok) {
      recommendation.results = dedupeRecommendationResults(recommendation.results).slice(0, resultCount);
      recommendation.members = recommendation.results[0]?.members ?? recommendation.members;
      recommendation.score = recommendation.results[0]?.score ?? recommendation.score;
      recommendation.orderOptimization = { mode: "skipped", evaluatedCount: 0, shortlistedCount: recommendation.results.length };
    }
    return recommendation;
  }

  let evaluatedCount = 0;
  const orderedCandidates = [];
  for (const result of recommendation.results) {
    const leader = preparedCards.get(result.members[0]);
    if (!leader) continue;
    const selectedMemberIds = orderableMemberIds(result);
    const selectedMembers = selectedMemberIds.map((id) => preparedCards.get(id));
    if (selectedMembers.some((member) => !member)) continue;
    const preparedComposition = prepareDeckComposition({ leader, members: selectedMembers, separateRole });
    if (!preparedComposition) continue;
    let best = null;
    for (const memberIds of permutations(selectedMemberIds)) {
      const members = memberIds.map((id) => preparedCards.get(id));
      if (members.some((member) => !member)) continue;
      const score = evaluateDeck({
        leader,
        members,
        music,
        difficulty,
        playMode,
        separateRole,
        evaluationTarget: simulationTarget,
        preparedComposition,
      });
      evaluatedCount += 1;
      if (!score) continue;
      const candidate = {
        members: [leader.id, ...memberIds],
        score,
        rankingValue: rankingValue(score, simulationTarget),
        _preparedComposition: preparedComposition,
      };
      if (!best || compareResults(candidate, best) < 0) best = candidate;
    }
    if (best) orderedCandidates.push(best);
  }

  const dedupedCandidates = dedupeRecommendationResults(orderedCandidates);
  const finalResults = dedupedCandidates.slice(0, Math.max(1, resultCount)).map((result) => {
    const leader = preparedCards.get(result.members[0]);
    const members = result.members.slice(1).map((id) => preparedCards.get(id));
    const score = evaluateDeck({
      leader,
      members,
      music,
      difficulty,
      playMode,
      separateRole,
      includeDiagnostics: true,
      evaluationTarget: "both",
      preparedComposition: result._preparedComposition,
    });
    const { _preparedComposition, ...publicResult } = result;
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
      evaluatedCount,
      shortlistedCount: recommendation.results.length,
    },
  };
}
