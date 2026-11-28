import { exactShortlistSize, MAX_RESULT_COUNT, optimizeOwnedDeck } from "./recommend.js?v=1.3.1";
import { optimizeRecommendationOrders } from "./order.js?v=1.3.1";

const CLOSE_SCORE_MARGIN = 0.01;

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

  const finalCount = Math.max(1, Math.min(MAX_RESULT_COUNT, Math.round(Number(resultCount) || 5)));
  const songSelected = Boolean(exactMusic);
  const noteCount = exactMusic?._chart?.metadata?.notes?.length
    ?? exactMusic?._chart?.fullComboNoteCount
    ?? searchMusic?._chart?.fullComboNoteCount
    ?? 0;
  const shortlistCount = songSelected
    ? Math.max(finalCount, exactShortlistSize(noteCount, ownedCardIds?.length ?? 0))
    : finalCount;
  const canExpandShortlist = Boolean(exactMusic?._chart?.metadata?.notes?.length
    && exactMusic._chart.metadata.skills?.length && shortlistCount < MAX_RESULT_COUNT);

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
    resultCount: canExpandShortlist ? MAX_RESULT_COUNT : shortlistCount,
    exactTotalCaseLimit: 120_000,
    retainOrderBounds: !songSelected,
  });
  let shortlistExpanded = false;
  if (result.ok && canExpandShortlist && result.results.length > shortlistCount) {
    const finalSlot = result.results[finalCount - 1].rankingValue;
    const firstOutside = result.results[shortlistCount].rankingValue;
    shortlistExpanded = firstOutside >= finalSlot * (1 - CLOSE_SCORE_MARGIN);
    if (!shortlistExpanded) result = { ...result, results: result.results.slice(0, shortlistCount) };
  }
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
      resultCount: finalCount,
    });
  }
  return { ...result, stageOneShortlistCount, shortlistExpanded };
}
