// Card-list sorting does not need the recommendation or scoring engine.
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
