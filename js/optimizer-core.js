import { exactShortlistSize, optimizeOwnedDeck } from "./recommend.js?v=1.1.1";
import { optimizeRecommendationOrders } from "./order.js?v=1.1.0";

export function runOptimization({
  preparedCards,
  ownedCardIds,
  currentMembers,
  lockedSlots,
  searchMusic = null,
  exactMusic = null,
  difficulty = "EXPERT",
  playMode = "auto",
  simulationTarget = "score",
  separateRole = true,
  hasExactOrder = false,
  resultCount = 5,
}) {
  const noteCount = exactMusic?._chart?.metadata?.notes?.length ?? 0;
  const shortlistCount = hasExactOrder
    ? exactShortlistSize(noteCount, ownedCardIds?.length ?? 0)
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
  return { ...result, stageOneShortlistCount: shortlistCount };
}
