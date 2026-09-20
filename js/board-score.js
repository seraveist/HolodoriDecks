import { connectInfo, connectRange, memoryBonus } from './board-data.js?v=1.3.1';
import { validateBoardState, reconcileBoardOwnership } from './board-state.js?v=1.3.1';

const suffix = (value, marker) => String(value ?? '').split(marker).at(-1);
const STATS = ['p', 't', 's'];
const STAT_TYPES = { PERFORMANCE: ['p'], TECHNIQUE: ['t'], SENSE: ['s'], ALL_PARAMETER: STATS };
const RATE = 'LIVE_ACTIVE_SKILL_ACTIVATION_PROBABILITY_UP_PERMIL_UP';
const FREQUENCY = 'LIVE_ACTIVE_SKILL_COOL_TIME_SHORTEN_PERMIL_UP';
const SUPPORT = 'LIVE_ACTIVE_SKILL_EFFECT_UP_PERMIL_UP';
const SONG_BONUS = 'LIVE_SCORE_BONUS_ADD_PERMIL_UP_BY_MUSIC_SKILL_TREE_CHARACTER_AND_MUSIC_SINGER_TYPE';
const CACHE = new WeakMap();

// Shared by the editor and compiler; never replace the catalog's raw effects.
export function boostedBoardEffects(catalog, owner, board, settings = {}) {
  const coverage = new Map();
  for (const [slotId, cardId] of Object.entries(board?.connectors ?? {}).sort()) {
    const potential = settings[cardId]?.potential ?? 0;
    const connect = connectInfo(catalog, cardId, potential);
    for (const cell of connectRange(catalog, owner, slotId, cardId, potential)) {
      const key = `${cell.x},${cell.y}`;
      // Current masks cannot overlap between slots. Fail closed if that changes.
      if (coverage.has(key)) throw new Error('BOARD_CONNECT_OVERLAP');
      coverage.set(key, Number(connect.effectPermilUp));
    }
  }
  return new Map(catalog.board(owner).nodes.filter(n => n.effect).map(node => [node.id,
    { ...node.effect, value: Number(node.effect.value ?? 0) * (1000 + (coverage.get(`${node.x},${node.y}`) ?? 0)) / 1000 }]));
}

// Compile only selected Master nodes. Keep full precision until each displayed
// score/stat bucket is rounded; a node's one-decimal label is not its input.
export function compileBoardProfile(catalog, state, { characters, ownedCardIds, ownedCardSettings = {} }) {
  const clean = reconcileBoardOwnership(validateBoardState(state, catalog), new Set(ownedCardIds)).state;
  const memory = memoryBonus(catalog, clean.memoryCount);
  if (memory.status === 'unknown') throw new Error('BOARD_MEMORY_UNKNOWN');
  const effects = [];
  const groups = Object.fromEntries(characters.map(c => [c.id, [...(c.grouping_ids ?? [])]]));
  for (const [owner, board] of Object.entries(clean.boards).sort()) {
    const boosted = boostedBoardEffects(catalog, owner, board, ownedCardSettings);
    for (const nodeId of [...board.unlockedNodes].sort()) {
      const effect = boosted.get(nodeId);
      if (!effect) continue;
      const type = suffix(effect.effectType, '_SKILL_TREE_EFFECT_TYPE_');
      const role = suffix(effect.characterTriggerType, '_SKILL_TREE_EFFECT_CHARACTER_TRIGGER_TYPE_');
      if (role === 'WORK' || type.includes('REWARD')) continue;
      // AUTO / ALL PERFECT do not model misses or a changing life gauge.
      if (['LIFE_UP', 'LIVE_DECK_LEADER_ACTIVE_SKILL_ADDITION', 'LIVE_DECK_LEADER_ACTIVE_SKILL_LEVEL_UP'].includes(type)) continue;
      const statType = type.replace('_FOR_CHARACTER_GROUPING', '').replace(/_UP(?:_PERMIL_UP)?$/, '');
      if (!STAT_TYPES[statType] && ![RATE, FREQUENCY, SUPPORT, SONG_BONUS].includes(type)) throw new Error('BOARD_EFFECT_UNSUPPORTED');
      const value = Number(effect.value);
      if (!Number.isFinite(value) || value < 0) throw new Error('BOARD_EFFECT_UNSUPPORTED');
      const rawTarget = catalog.raw.targets[effect.skillTreeEffectTargetId];
      const target = rawTarget ? suffix(rawTarget.type, '_SKILL_TREE_EFFECT_TARGET_TYPE_') : 'ALL';
      const targets = characters.filter(c => target === 'ALL'
        || (target === 'SKILL_TREE_CHARACTER' && c.id === owner)
        || (target === 'CHARACTER' && c.id === rawTarget.characterId)
        || (target === 'CHARACTER_GROUPING' && c.grouping_ids?.includes(rawTarget.characterGroupingId))).map(c => c.id);
      if (!['ALL', 'SKILL_TREE_CHARACTER', 'CHARACTER', 'CHARACTER_GROUPING'].includes(target)
        || !['ALWAYS', 'SET_LIVE_LEADER'].includes(role)) throw new Error('BOARD_EFFECT_UNSUPPORTED');
      if ([SUPPORT, SONG_BONUS].includes(type) && target !== 'ALL') throw new Error('BOARD_EFFECT_UNSUPPORTED');
      const conditions = Object.values(catalog.raw.passiveTriggers[effect.skillTreeEffectPassiveTriggerGroupId] ?? {}).map(c => ({
        type: suffix(c.type, '_SKILL_TREE_EFFECT_PASSIVE_TRIGGER_TYPE_'),
        characterId: c.characterId, group: c.characterGroupingId,
        singerType: suffix(c.musicSingerType, '_MUSIC_SINGER_TYPE_'),
      }));
      if (conditions.some(c => !['MUSIC_CHARACTER', 'MUSIC_CHARACTER_GROUPING', 'MUSIC_SKILL_TREE_CHARACTER',
        'MUSIC_SKILL_TREE_CHARACTER_AND_MUSIC_SINGER_TYPE'].includes(c.type))) throw new Error('BOARD_CONDITION_UNSUPPORTED');
      effects.push({ owner, nodeId, type, role, targets, conditions, value });
    }
  }
  return { version: 1, memoryPct: memory.percent ?? 0, effects, groups };
}

function matchesCondition(condition, owner, music, groups) {
  if (!music) return false;
  const singers = music.character_ids ?? [];
  const singerType = suffix(music.music_singer_type, '_MUSIC_SINGER_TYPE_');
  switch (condition.type) {
    case 'MUSIC_CHARACTER': return singers.includes(condition.characterId);
    case 'MUSIC_CHARACTER_GROUPING': return singers.some(id => groups[id]?.includes(condition.group));
    case 'MUSIC_SKILL_TREE_CHARACTER': return singers.includes(owner);
    case 'MUSIC_SKILL_TREE_CHARACTER_AND_MUSIC_SINGER_TYPE':
      // ALL songs have an empty singer list in Master. Their ALL node explicitly
      // applies to the whole-song category, independently of the board owner.
      return singerType === condition.singerType && (singerType === 'ALL' || singers.includes(owner));
    default: throw new Error('BOARD_CONDITION_UNSUPPORTED');
  }
}

function emptyMember() {
  return { activationRatePct: 0, activationFrequencyPct: 0,
    flat: { p: 0, t: 0, s: 0 }, percent: { p: 0, t: 0, s: 0 } };
}

// One resolution per leader/song, shared by all candidate combinations and orders.
// The DTO contains no DOM or catalog references and survives Worker cloning.
export function resolveBoardProfile(profile, leaderId, music = null) {
  if (!profile) return null;
  if (profile.version !== 1) throw new Error('BOARD_PROFILE_UNSUPPORTED');
  let cache = CACHE.get(profile);
  if (!cache) { cache = new Map(); CACHE.set(profile, cache); }
  const key = JSON.stringify([leaderId, music?.id, music?.music_singer_type, music?.character_ids]);
  if (cache.has(key)) return cache.get(key);
  const result = { memberBoards: {}, leaderBoardSupportPct: 0, directScorePct: 0, memoryPct: profile.memoryPct };
  for (const effect of profile.effects) {
    if (effect.role === 'SET_LIVE_LEADER' && effect.owner !== leaderId) continue;
    if (!effect.conditions.every(c => matchesCondition(c, effect.owner, music, profile.groups))) continue;
    if (effect.type === SUPPORT) { result.leaderBoardSupportPct += effect.value / 10; continue; }
    if (effect.type === SONG_BONUS) { result.directScorePct += effect.value / 10; continue; }
    for (const id of effect.targets) {
      const member = result.memberBoards[id] ??= emptyMember();
      if (effect.type === RATE) member.activationRatePct += effect.value / 10;
      else if (effect.type === FREQUENCY) member.activationFrequencyPct += effect.value / 10;
      else {
        const statType = effect.type.replace('_FOR_CHARACTER_GROUPING', '').replace(/_UP(?:_PERMIL_UP)?$/, '');
        const percentage = effect.type.endsWith('_PERMIL_UP');
        for (const stat of STAT_TYPES[statType]) member[percentage ? 'percent' : 'flat'][stat] += effect.value / (percentage ? 10 : 1);
      }
    }
  }
  if (cache.size >= 256) cache.clear();
  cache.set(key, result);
  return result;
}

export function boardStatBonuses(members, bonuses = {}) {
  const board = { p: 0, t: 0, s: 0 }, memory = { p: 0, t: 0, s: 0 };
  for (const member of members) {
    const inputs = bonuses.memberBoards?.[member.characterId];
    for (const stat of STATS) {
      board[stat] += Math.ceil((inputs?.flat?.[stat] ?? 0) + member.stats[stat] * (inputs?.percent?.[stat] ?? 0) / 100 - 1e-8);
      memory[stat] += Math.ceil(member.stats[stat] * (bonuses.memoryPct ?? 0) / 100 - 1e-8);
    }
  }
  return { board, memory };
}
