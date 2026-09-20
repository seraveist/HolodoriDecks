import { exactShortlistSize, optimizeOwnedDeck } from "./recommend.js?v=1.3.1";
import { optimizeRecommendationOrders } from "./order.js?v=1.3.1";

export function runOptimization({
  preparedCards,
  accountBonuses = null,
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
  // Keep the compatibility flag in the payload. Every result now receives one
  // representative order, with a common potential-score reference if no song
  // is selected and the existing song-specific goal otherwise.
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
    accountBonuses,
    ownedCardIds,
    currentMembers,
    lockedSlots,
    music: searchMusic,
    difficulty,
    playMode,
    simulationTarget,
    separateRole,
    resultCount: shortlistCount,
    exactTotalCaseLimit: 120_000,
    retainOrderBounds: !songSelected,
  });
  const stageOneShortlistCount = result.results?.length ?? 0;
  if (result.ok) {
    result = optimizeRecommendationOrders({
      recommendation: result,
      accountBonuses,
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
  return { ...result, stageOneShortlistCount };
}
