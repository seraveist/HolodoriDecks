import { dataAssetRequest } from './data-assets.js?v=1.3.1';

const base = new URL('../data/generated/', import.meta.url);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (obj, key) => record(obj) && Object.hasOwn(obj, key);
function check(condition, message) { if (!condition) throw new Error(`BOARD_DATA: ${message}`); }

/** Validate revision/links before any editor or account profile is constructed. */
export function createBoardCatalog(raw, memory, pack, manifest) {
  check(raw?.format === 'holodori-boards' && raw.version === 1, 'unsupported schema');
  check(memory?.format === 'holodori-memory-bonuses' && memory.version === 1, 'invalid memory table');
  check(pack?.format === 'holodori-board-locale' && pack.version === 1, 'invalid locale');
  for (const value of [raw, memory, pack]) {
    check(value.master_version === manifest.master_version && value.source_commit === manifest.source_commit, 'mixed snapshots');
  }
  check(pack.locale_commit === manifest.locales?.[pack.locale]?.commit, 'locale revision mismatch');
  for (const name of ['characters','resolved','layouts','definitions','effects','targets','passiveTriggers',
    'connectEffects','connectRanges','cards','potentials','conditions','items','relatedSkills']) check(record(raw[name]), `missing ${name}`);
  check(Array.isArray(raw.requiredLangIds) && record(pack.texts), 'missing locale dependencies');
  check(raw.requiredLangIds.every(id => typeof pack.texts[id] === 'string' && pack.texts[id]), 'missing translations');
  const compiled = new Map();
  for (const [id, member] of Object.entries(raw.characters)) {
    check(record(member), 'invalid character');
    if (!member.layoutId) continue;
    check(Array.isArray(raw.layouts[member.layoutId]) && record(raw.resolved[id]), `missing model for ${id}`);
    const nodes = raw.layouts[member.layoutId].map(position => {
      check(Number.isSafeInteger(position.x) && Number.isSafeInteger(position.y), 'invalid coordinate');
      const number = raw.resolved[id][position.id];
      const definition = raw.definitions[position.id]?.[number];
      check(definition && definition.groupId === position.id, `invalid node ${id}/${position.id}`);
      const kind = definition.type.split('_SKILL_TREE_NODE_TYPE_').at(-1);
      const type = raw.nodeTypes[kind];
      check(type, 'unsupported node type');
      const effect = definition.skillTreeEffectId ? raw.effects[definition.skillTreeEffectId] : null;
      check(type === 'S' || effect, 'missing effect');
      return { ...position, type, number, definition, effect };
    });
    check(nodes.length > 0 && new Set(nodes.map(node => node.id)).size === nodes.length, 'duplicate/empty nodes');
    check(new Set(nodes.map(n => `${n.x},${n.y}`)).size === nodes.length, 'duplicate positions');
    check(nodes.length === Object.keys(raw.resolved[id]).length, 'incomplete resolution');
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    compiled.set(id, { id: member.layoutId, nodes, byId: new Map(nodes.map(n => [n.id,n])),
      connectors: nodes.filter(n => n.type === 'S').map(n => n.id),
      bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) } });
  }
  for (const [id, levels] of Object.entries(raw.connectEffects)) {
    check(record(levels) && levels[1], `missing base connect level: ${id}`);
    for (const effect of Object.values(levels)) {
      const cells = raw.connectRanges[effect.skillTreeConnectEffectExtentGroupId];
      check(Array.isArray(cells) && cells.length > 0, 'missing connect range');
      check(cells.every(c => Number.isSafeInteger(c.x) && Number.isSafeInteger(c.y)), 'invalid range coordinate');
      check(Number.isSafeInteger(Number(effect.effectPermilUp)) && Number(effect.effectPermilUp) >= 0, 'invalid boost');
    }
  }
  for (const card of Object.values(raw.cards)) {
    check(!card.connectEffectId || own(raw.connectEffects, card.connectEffectId), 'missing card connect effect');
  }
  check(Array.isArray(memory.rows) && memory.rows.length > 0, 'empty memory rows');
  let previous = 0;
  for (const row of memory.rows) {
    check(Number.isSafeInteger(row.count) && row.count > previous && Number.isSafeInteger(row.parameterPermil) && row.parameterPermil >= 0, 'invalid memory threshold');
    previous = row.count;
  }
  const catalog = {
    raw, memory, pack, masterVersion: raw.master_version, sourceCommit: raw.source_commit,
    has: id => compiled.has(id), board: id => compiled.get(id) ?? null,
    node: (id, nodeId) => compiled.get(id)?.byId.get(nodeId) ?? null,
    canConnect: cardId => Boolean(own(raw.cards, cardId) && raw.cards[cardId].connectEffectId),
    text: (id, fallback = '') => pack.texts[id] ?? fallback,
  };
  return catalog;
}

export async function loadBoardCatalog(manifest, locale = 'ko', fetcher = fetch) {
  if (!['ko','en','ja'].includes(locale)) throw new Error('Unsupported board locale');
  const read = async name => {
    const { url, cache } = dataAssetRequest(new URL(name, base), manifest);
    const response = await fetcher(url, { cache });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
  };
  const [board, memory, pack] = await Promise.all([read('boards.json'),read('memory-bonuses.json'),read(`i18n/boards/${locale}.json`)]);
  return createBoardCatalog(board, memory, pack, manifest);
}

/** Pure board-level information, deliberately never called by score/optimizer. */
export function connectInfo(catalog, cardId, potential = 0) {
  const card = catalog.raw.cards[cardId];
  if (!catalog.canConnect(cardId)) return null;
  let level = 1;
  for (const upgrade of catalog.raw.potentials[card.potentialGroupId] ?? []) {
    if (Number(upgrade.upgradeCount) <= Number(potential)) level = Number(upgrade.value);
  }
  const effect = catalog.raw.connectEffects[card.connectEffectId]?.[level];
  if (!effect) throw new Error('BOARD_DATA: unsupported connect level');
  return { ...effect, level, boostPercent: Number(effect.effectPermilUp) / 10,
    cells: catalog.raw.connectRanges[effect.skillTreeConnectEffectExtentGroupId] };
}

export function memoryBonus(catalog, count) {
  if (count === null) return { status: 'unset', percent: null };
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('INVALID_MEMORY_COUNT');
  const rows = catalog.memory.rows;
  if (count > rows.at(-1).count) return { status: 'unknown', percent: null, knownThrough: rows.at(-1).count };
  const matched = rows.findLast(row => row.count <= count);
  return { status: 'known', percent: (matched?.parameterPermil ?? 0) / 10 };
}

export function boardDescription(catalog, effect, characterName = '') {
  if (!effect) return '';
  const value = Number(effect.value ?? 0);
  const number = n => new Intl.NumberFormat(catalog.pack.locale, { maximumFractionDigits: 6 }).format(n);
  return catalog.text(effect.descriptionLangId, effect.effectType ?? '')
    .replaceAll('[character]', characterName)
    .replaceAll('[value/10]', number(value / 10)).replaceAll('[value]', number(value))
    .replace(/\[\/?highlight\]/g, '').replace(/<\/?color(?:=[^>]*)?>/g, '').trim();
}

/** Exact raw offsets translated to the slot, with no invented rotations or score stacking. */
export function connectRange(catalog, characterId, slotId, cardId, potential) {
  const slot = catalog.node(characterId, slotId), info = connectInfo(catalog, cardId, potential);
  if (!slot || slot.type !== 'S' || !info) return [];
  return info.cells.map(cell => ({ x: slot.x + cell.x, y: slot.y + cell.y }));
}
