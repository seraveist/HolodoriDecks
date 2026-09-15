// Only the transport representation changes; consumers receive the original rows.
const FORMAT = "holodori-cards";
const TABLE_FIELDS = ["levels", "level_limits", "potential_effects"];

export function encodeCards(cards) {
  if (!Array.isArray(cards)) throw new TypeError("Cards must be an array");
  const tables = Object.fromEntries(TABLE_FIELDS.map(field => [field, []]));
  const indexes = Object.fromEntries(TABLE_FIELDS.map(field => [field, new Map()]));
  const rows = cards.map(card => {
    if (!card || typeof card !== "object" || Array.isArray(card)) throw new TypeError("Invalid card");
    if (!card.growth) return { ...card };
    const growth = { ...card.growth };
    for (const field of TABLE_FIELDS) {
      if (!Array.isArray(growth[field])) continue;
      const key = JSON.stringify(growth[field]);
      if (!indexes[field].has(key)) {
        indexes[field].set(key, tables[field].length);
        tables[field].push(growth[field]);
      }
      growth[field] = indexes[field].get(key);
    }
    return { ...card, growth };
  });
  return { format: FORMAT, version: 1, cards: rows, tables };
}

export function decodeCards(payload) {
  // Repository data and portable previews retain the original array format.
  if (Array.isArray(payload)) return payload;
  if (payload?.format !== FORMAT || payload.version !== 1
    || !Array.isArray(payload.cards) || !payload.tables
    || !TABLE_FIELDS.every(field => Array.isArray(payload.tables[field]))) {
    throw new TypeError("Unsupported card data format");
  }
  return payload.cards.map(card => {
    if (!card || typeof card !== "object" || Array.isArray(card)) throw new TypeError("Invalid card");
    if (!card.growth) return { ...card };
    const growth = { ...card.growth };
    for (const field of TABLE_FIELDS) {
      if (!Object.hasOwn(growth, field)) continue;
      const index = growth[field];
      if (!Number.isSafeInteger(index) || index < 0
        || !Array.isArray(payload.tables[field][index])) {
        throw new TypeError(`Invalid growth table reference: ${field}`);
      }
      // Do not introduce shared mutable rows between different cards.
      growth[field] = structuredClone(payload.tables[field][index]);
    }
    return { ...card, growth };
  });
}
