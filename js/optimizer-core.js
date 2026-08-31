import { exactShortlistSize, optimizeOwnedDeck } from "./recommend.js?v=1.1.1";
import { optimizeRecommendationOrders } from "./order.js?v=1.1.2";

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
  // Keep the compatibility flag in the payload, but order optimization is now
  // required for every selected song because limited-target passives can depend
  // on member position even when Exact SP metadata is unavailable.
  void hasExactOrder;

  const songSelected = Boolean(exactMusic);
  const noteCount = exactMusic?._chart?.metadata?.notes?.length
    ?? exactMusic?._chart?.fullComboNoteCount
    ?? searchMusic?._chart?.fullComboNoteCount
    ?? 0;
  const shortlistCount = songSelected
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
