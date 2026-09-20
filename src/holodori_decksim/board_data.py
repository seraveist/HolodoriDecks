"""Lossless, version-aligned board catalogs. No deck/score evaluation lives here."""
from __future__ import annotations

import copy
import json
import re
from typing import Any

BOARD_SCHEMA_VERSION = 1
BOARD_FILES = (
    'SkillTreeNodePosition.json', 'SkillTreeNode.json', 'SkillTreeEffect.json',
    'SkillTreeEffectTarget.json', 'SkillTreeEffectPassiveTrigger.json',
    'SkillTreeEffectValueLimit.json', 'SkillTreeConnectEffect.json',
    'SkillTreeConnectEffectExtent.json', 'PosterCollectEffect.json',
    'Condition.json', 'Item.json', 'CharacterGrouping.json',
    'CharacterLevel.json', 'SkillTreePoint.json', 'LiveActiveSkill.json',
)
BOARD_LANGUAGE_FILES = (
    'LangSkillTreeEffect', 'LangGeneratedSkillTreeEffect',
    'LangGeneratedSkillTreeEffectTarget', 'LangGeneratedSkillTreeEffectPassiveTrigger',
    'LangGeneratedSkillTreeConnectEffect', 'LangCondition', 'LangItem',
    'LangCharacterGrouping', 'LangSkillTreePoint',
    'LangGeneratedLiveActiveSkillLevel', 'LangGeneratedLiveActiveSkillEffect',
    'LangGeneratedLiveSkillTrigger',
)
NODE_TYPES = {'LEADER': 'R', 'CARD': 'B', 'ALL_MEMBER': 'G', 'CONTENT': 'Y', 'CONNECTION': 'S'}
KNOWN_EFFECTS = set('''ALL_PARAMETER_UP ALL_PARAMETER_UP_PERMIL_UP
ALL_PARAMETER_UP_FOR_CHARACTER_GROUPING PERFORMANCE_UP TECHNIQUE_UP SENSE_UP
PERFORMANCE_UP_PERMIL_UP TECHNIQUE_UP_PERMIL_UP SENSE_UP_PERMIL_UP LIFE_UP
LIVE_ACTIVE_SKILL_EFFECT_UP_PERMIL_UP LIVE_ACTIVE_SKILL_ACTIVATION_PROBABILITY_UP_PERMIL_UP
LIVE_ACTIVE_SKILL_COOL_TIME_SHORTEN_PERMIL_UP LIVE_DECK_LEADER_ACTIVE_SKILL_ADDITION
LIVE_DECK_LEADER_ACTIVE_SKILL_LEVEL_UP LIVE_REWARD_CARD_EXP_QUANTITY_UP_PERMIL_UP
LIVE_REWARD_QUANTITY_UP_PERMIL_UP MINI_GAME_REWARD_QUANTITY_UP_PERMIL_UP
WORK_REWARD_QUANTITY_UP_PERMIL_UP
LIVE_SCORE_BONUS_ADD_PERMIL_UP_BY_MUSIC_SKILL_TREE_CHARACTER_AND_MUSIC_SINGER_TYPE'''.split())


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(f'board data: {message}')


def integer(value: Any, label: str, minimum: int | None = None) -> int:
    require(not isinstance(value, bool) and isinstance(value, (int, str)), f'{label}: expected integer')
    require(bool(re.fullmatch(r'-?\d+', str(value))), f'{label}: invalid integer')
    result = int(value)
    require(abs(result) <= 2**53 - 1, f'{label}: unsafe JavaScript integer')
    require(minimum is None or result >= minimum, f'{label}: below minimum')
    return result


def rows(contents: dict[str, str], filename: str) -> list[dict[str, Any]]:
    raw = json.loads(contents[filename])
    require(isinstance(raw, list), f'{filename}: expected rows')
    result = []
    for row in raw:
        require(isinstance(row, dict) and isinstance(row.get('data'), dict), f'{filename}: invalid row')
        data = copy.deepcopy(row['data'])
        # Master omits protobuf defaults (not missing foreign keys). Preserve keys
        # supplied by the outer envelope, including zero-valued coordinates.
        for key, value in row.items():
            if key == 'data':
                continue
            parts = key.split('_')
            camel = parts[0] + ''.join(part.capitalize() for part in parts[1:])
            if camel in data:
                # Outer protobuf enum numbers correspond to named inner enums.
                if not (isinstance(value, int) and isinstance(data[camel], str) and '_' in data[camel]):
                    require(str(data[camel]) == str(value), f'{filename}: conflicting {camel}')
            else:
                data[camel] = value
        result.append(data)
    return result


def index(data: list[dict[str, Any]], key: str = 'id') -> dict[str, dict[str, Any]]:
    result = {}
    for row in data:
        value = row.get(key)
        require(isinstance(value, str) and bool(value), f'missing {key}')
        require(value not in result, f'duplicate {key}: {value}')
        result[value] = row
    return dict(sorted(result.items()))


def groups(data: list[dict[str, Any]], key: str = 'groupId', number: str = 'number') -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in data:
        group = row.get(key)
        require(isinstance(group, str) and bool(group), f'missing {key}')
        value = str(integer(row.get(number), f'{group}.{number}', 1))
        items = result.setdefault(group, {})
        require(value not in items, f'duplicate {group}/{value}')
        items[value] = row
    return {group: dict(sorted(items.items(), key=lambda pair: int(pair[0]))) for group, items in sorted(result.items())}


def resolve_variant(variants: dict[str, Any], character: str) -> dict[str, Any]:
    specific = [row for row in variants.values() if character in row.get('characterIds', [])]
    common = [row for row in variants.values() if not row.get('characterIds')]
    candidates = specific or common
    require(len(candidates) == 1, f'ambiguous/missing node variant for {character}: {len(candidates)} candidates')
    return candidates[0]


def language_ids(value: Any) -> set[str]:
    if isinstance(value, dict):
        result: set[str] = set()
        for key, item in value.items():
            if key.endswith('LangId') and isinstance(item, str) and item:
                result.add(item)
            else:
                result.update(language_ids(item))
        return result
    if isinstance(value, list):
        return set().union(*(language_ids(item) for item in value)) if value else set()
    return set()


def build_board_data(snapshot: dict[str, Any], character_ids: set[str], card_ids: set[str]) -> tuple[dict[str, Any], dict[str, Any]]:
    contents = snapshot['contents']
    get = lambda name: rows(contents, name + '.json')
    source = {'source_repository': 'HolodoriDB/holodori-db-kor-diff',
              'source_commit': snapshot['upstream_commit'], 'master_version': snapshot['master_version']}
    raw_characters = index(get('Character'))
    raw_cards = index(get('Card'))
    definitions = groups(get('SkillTreeNode'))
    layouts: dict[str, list[dict[str, Any]]] = {}
    for row in get('SkillTreeNodePosition'):
        node = {'id': row['skillTreeNodeGroupId'],
                'x': integer(row.get('positionX', 0), 'positionX'),
                'y': integer(row.get('positionY', 0), 'positionY')}
        layouts.setdefault(row['groupId'], []).append(node)
    for nodes in layouts.values():
        nodes.sort(key=lambda row: row['id'])
    members, resolved = {}, {}
    for character in sorted(character_ids):
        raw = raw_characters[character]
        model = raw.get('skillTreeNodePositionGroupId')
        members[character] = {'layoutId': model, 'pointId': raw.get('skillTreePointId'),
                              'levelGroupId': raw.get('characterLevelGroupId')}
        if not model:
            continue  # Unavailable in this Master; do not fabricate another member's board.
        require(model in layouts, f'{character}: missing layout {model}')
        resolved[character] = {}
        for node in layouts[model]:
            require(node['id'] in definitions, f'unknown node {node["id"]}')
            row = resolve_variant(definitions[node['id']], character)
            resolved[character][node['id']] = row['number']
    ranges: dict[str, list[dict[str, int]]] = {}
    for row in get('SkillTreeConnectEffectExtent'):
        ranges.setdefault(row['groupId'], []).append({
            'x': integer(row.get('positionX', 0), 'range X'), 'y': integer(row.get('positionY', 0), 'range Y')})
    for cells in ranges.values():
        cells.sort(key=lambda row: (row['x'], row['y']))
    effects = index(get('SkillTreeEffect'))
    targets = index(get('SkillTreeEffectTarget'))
    passive = groups(get('SkillTreeEffectPassiveTrigger'))
    connections = groups(get('SkillTreeConnectEffect'), 'id', 'level')
    limits = {}
    for row in get('SkillTreeEffectValueLimit'):
        key = row['skillTreeEffectType']
        require(key not in limits, f'duplicate limit {key}')
        integer(row['limit'], 'effect limit', 0)
        limits[key] = row['limit']
    condition_ids = {row[key] for variants in definitions.values() for row in variants.values()
                     for key in ('viewConditionGroupId', 'unlockConditionGroupId') if row.get(key)}
    conditions = {key: group for key, group in groups(get('Condition')).items() if key in condition_ids}
    item_ids = {r['resourceId'] for group in definitions.values() for row in group.values()
                for r in row.get('consumptions', []) if r.get('resourceType', '').endswith('_ITEM')}
    item_ids.update(resource for effect in effects.values() if effect.get('resourceType', '').endswith('_ITEM')
                    for resource in effect.get('resourceIds', []))
    items = {key: row for key, row in index(get('Item')).items() if key in item_ids}
    grouping_ids = {r['characterGroupingId'] for r in targets.values() if r.get('characterGroupingId')}
    grouping_ids.update(r['characterGroupingId'] for group in passive.values() for r in group.values() if r.get('characterGroupingId'))
    groupings = {key: row for key, row in index(get('CharacterGrouping')).items() if key in grouping_ids}
    skill_ids = {r['liveActiveSkillId'] for r in effects.values() if r.get('liveActiveSkillId')}
    all_levels = groups(get('LiveActiveSkillLevel'), 'liveActiveSkillId', 'level')
    related_skills = {key: all_levels[key] for key in sorted(skill_ids) if key in all_levels}
    active_ids = {r['liveActiveSkillEffectGroupId'] for group in related_skills.values() for r in group.values()}
    trigger_ids = {r['liveSkillTriggerGroupId'] for group in related_skills.values() for r in group.values() if r.get('liveSkillTriggerGroupId')}
    active_effects = {key: rows for key, rows in groups(get('LiveActiveSkillEffect')).items() if key in active_ids}
    triggers = {key: rows for key, rows in groups(get('LiveSkillTrigger')).items() if key in trigger_ids}
    raw_potentials = get('CardPotential')
    potentials: dict[str, list[dict[str, Any]]] = {}
    for row in raw_potentials:
        if row['effectType'].endswith('_SKILL_TREE_CONNECT_EFFECT_LEVEL_UP'):
            potentials.setdefault(row['groupId'], []).append(row)
    for group in potentials.values():
        group.sort(key=lambda r: r['upgradeCount'])
    board_cards = {key: {'characterId': raw_cards[key]['characterId'],
                         'connectEffectId': raw_cards[key].get('skillTreeConnectEffectId'),
                         'potentialGroupId': raw_cards[key].get('cardPotentialGroupId')}
                   for key in sorted(card_ids)}
    point_ids = {r['pointId'] for r in members.values() if r['pointId']}
    level_ids = {r['levelGroupId'] for r in members.values() if r['levelGroupId']}
    result = {'format': 'holodori-boards', 'version': BOARD_SCHEMA_VERSION, **source,
              'characters': members, 'layouts': dict(sorted(layouts.items())), 'definitions': definitions,
              'resolved': resolved, 'effects': effects, 'targets': targets, 'passiveTriggers': passive,
              'limits': limits, 'connectEffects': connections, 'connectRanges': dict(sorted(ranges.items())),
              'cards': board_cards, 'potentials': dict(sorted(potentials.items())),
              'conditions': conditions, 'items': items, 'groupings': groupings,
              'points': {k: v for k, v in index(get('SkillTreePoint')).items() if k in point_ids},
              'characterLevels': {k: v for k, v in groups(get('CharacterLevel'), 'groupId', 'level').items() if k in level_ids},
              'relatedSkills': related_skills, 'activeEffects': active_effects, 'liveTriggers': triggers,
              'nodeTypes': NODE_TYPES,
              'capabilities': {'scoreIntegration': True, 'rangeCoordinates': 'source-relative',
                               'placementRules': 'owned-card-id-unique', 'pathPrerequisitesVerified': False}}
    result['unknownEffectTypes'] = sorted({r['effectType'] for r in effects.values()
        if r['effectType'].split('_SKILL_TREE_EFFECT_TYPE_')[-1] not in KNOWN_EFFECTS})
    result['requiredLangIds'] = sorted(language_ids(result))
    memory_rows = []
    for row in get('PosterCollectEffect'):
        memory_rows.append({'count': integer(row['threshold'], 'memory count', 1),
                            'parameterPermil': integer(row['liveDeckAllParameterUpPermilUp'], 'memory bonus', 0)})
    memory = {'format': 'holodori-memory-bonuses', 'version': 1, **source,
              'rows': sorted(memory_rows, key=lambda row: row['count'])}
    validate_board_data(result, memory, character_ids, card_ids)
    return result, memory


def validate_board_data(board: dict[str, Any], memory: dict[str, Any], character_ids: set[str], card_ids: set[str]) -> dict[str, int]:
    require(board.get('format') == 'holodori-boards' and board.get('version') == 1, 'unsupported catalog')
    require(memory.get('format') == 'holodori-memory-bonuses' and memory.get('version') == 1, 'unsupported memory table')
    for data in (board, memory):
        require(bool(re.fullmatch('[0-9a-f]{40}', data.get('source_commit', ''))), 'invalid source commit')
        require(bool(re.fullmatch('[0-9a-f]{64}', data.get('master_version', ''))), 'invalid master revision')
    require((board['master_version'], board['source_commit']) == (memory['master_version'], memory['source_commit']), 'mixed revisions')
    require(set(board['characters']) == character_ids, 'character coverage mismatch')
    require(set(board['cards']) == card_ids, 'card coverage mismatch')
    require(bool(board['layouts']), 'empty layouts')
    for model, nodes in board['layouts'].items():
        require(bool(nodes), f'{model}: empty layout')
        require(len({n['id'] for n in nodes}) == len(nodes), f'{model}: duplicate node IDs')
        require(len({(n['x'], n['y']) for n in nodes}) == len(nodes), f'{model}: duplicate positions')
        for node in nodes:
            require(node['id'] in board['definitions'], f'{model}: unknown node')
            integer(node['x'], 'x'); integer(node['y'], 'y')
    for group_id, variants in board['definitions'].items():
        require(bool(variants), f'{group_id}: empty definitions')
        for number, node in variants.items():
            require(node.get('groupId') == group_id and str(node.get('number')) == number, 'node identity mismatch')
            require(set(node.get('characterIds', [])) <= character_ids, f'{group_id}: unknown character override')
            kind = node.get('type', '').split('_SKILL_TREE_NODE_TYPE_')[-1]
            require(kind in NODE_TYPES, f'{group_id}: unknown node type {kind}')
            if kind != 'CONNECTION':
                require(node.get('skillTreeEffectId') in board['effects'], f'{group_id}: missing effect')
            for key in ('viewConditionGroupId', 'unlockConditionGroupId'):
                if node.get(key): require(node[key] in board['conditions'], f'{group_id}: missing {key}')
            integer(node.get('consumptionSkillTreePointQuantity', 0), 'points', 0)
            for cost in node.get('consumptions', []):
                integer(cost['quantity'], 'cost', 0)
                if cost.get('resourceType', '').endswith('_ITEM'):
                    require(cost['resourceId'] in board['items'], f'{group_id}: unknown item')
    for cid, character in board['characters'].items():
        model = character['layoutId']
        if not model:
            require(cid not in board['resolved'], f'{cid}: fabricated board')
            continue
        require(model in board['layouts'], f'{cid}: missing model')
        choices = board['resolved'].get(cid, {})
        require(set(choices) == {n['id'] for n in board['layouts'][model]}, f'{cid}: node coverage mismatch')
        for node, number in choices.items():
            require(resolve_variant(board['definitions'][node], cid)['number'] == number, f'{cid}/{node}: incorrect variant')
        for key, table in [('pointId', 'points'), ('levelGroupId', 'characterLevels')]:
            if character[key]: require(character[key] in board[table], f'{cid}: missing {table}')
    for key, effect in board['effects'].items():
        if 'value' in effect: integer(effect['value'], f'{key}.value')
        for field, table in [('skillTreeEffectTargetId','targets'), ('skillTreeEffectPassiveTriggerGroupId','passiveTriggers'), ('liveActiveSkillId','relatedSkills')]:
            if effect.get(field): require(effect[field] in board[table], f'{key}: missing {field}')
    for target in board['targets'].values():
        if target.get('characterId'): require(target['characterId'] in character_ids, 'unknown target character')
        if target.get('characterGroupingId'): require(target['characterGroupingId'] in board['groupings'], 'unknown target grouping')
    for group in board['passiveTriggers'].values():
        for trigger in group.values():
            require(set(trigger.get('characterIds', [])) <= character_ids, 'unknown trigger character')
            if trigger.get('characterGroupingId'): require(trigger['characterGroupingId'] in board['groupings'], 'unknown trigger grouping')
    for effect_id, levels in board['connectEffects'].items():
        require('1' in levels, f'{effect_id}: missing base level')
        for level, effect in levels.items():
            require(effect['id'] == effect_id and str(effect['level']) == level, 'connect identity mismatch')
            require(effect['skillTreeConnectEffectExtentGroupId'] in board['connectRanges'], 'missing connect range')
            integer(effect['effectPermilUp'], 'connect boost', 0)
    for name, cells in board['connectRanges'].items():
        require(bool(cells) and len({(c['x'],c['y']) for c in cells}) == len(cells), f'{name}: duplicate/empty range')
        for cell in cells:
            integer(cell['x'], 'range x'); integer(cell['y'], 'range y')
    for card_id, card in board['cards'].items():
        effect = card['connectEffectId']
        require(card['characterId'] in character_ids, f'{card_id}: unknown character')
        if not effect: continue
        require(effect in board['connectEffects'], f'{card_id}: missing connect effect')
        for potential in board['potentials'].get(card['potentialGroupId'], []):
            require(str(potential['value']) in board['connectEffects'][effect], f'{card_id}: missing awakening level')
    for levels in board['relatedSkills'].values():
        for level in levels.values():
            require(level['liveActiveSkillEffectGroupId'] in board['activeEffects'], 'missing board active effect')
            if level.get('liveSkillTriggerGroupId'): require(level['liveSkillTriggerGroupId'] in board['liveTriggers'], 'missing board active trigger')
    require(board['requiredLangIds'] == sorted(language_ids({k:v for k,v in board.items() if k != 'requiredLangIds'})), 'language dependency mismatch')
    previous = 0
    for row in memory['rows']:
        count = integer(row['count'], 'threshold', 1)
        require(count > previous, 'unordered/duplicate memory thresholds')
        integer(row['parameterPermil'], 'memory value', 0)
        previous = count
    require(bool(memory['rows']), 'empty memory table')
    return {'characters': len(board['resolved']), 'unavailable_characters': len(character_ids)-len(board['resolved']),
            'layouts': len(board['layouts']), 'layout_nodes': sum(map(len, board['layouts'].values())),
            'node_groups': len(board['definitions']), 'node_definitions': sum(map(len,board['definitions'].values())),
            'effects': len(board['effects']), 'connect_effects': len(board['connectEffects']),
            'connect_levels': sum(map(len,board['connectEffects'].values())), 'connect_ranges': len(board['connectRanges']),
            'related_skills': len(board['relatedSkills']), 'memory_thresholds': len(memory['rows'])}


def board_change_reasons(previous: dict[str, Any] | None, current: dict[str, Any], previous_memory: dict[str, Any] | None, memory: dict[str, Any]) -> list[str]:
    """Changing existing board semantics always requires review, even at equal counts."""
    reasons = []
    if not previous:
        reasons.append('board catalog first introduction requires manual review')
    else:
        for table in ('characters','layouts','definitions','resolved','effects','targets','passiveTriggers','limits',
                      'connectEffects','connectRanges','cards','potentials','conditions','relatedSkills','activeEffects','liveTriggers',
                      'groupings','points','characterLevels'):
            old, new = previous.get(table, {}), current.get(table, {})
            removed = set(old) - set(new)
            changed = {k for k in old.keys() & new.keys() if old[k] != new[k]}
            if removed or changed:
                reasons.append(f'board {table}: removed {len(removed)}, changed {len(changed)} existing entries')
        if len(current.get('resolved', {})) - len(previous.get('resolved', {})) > 12:
            reasons.append('unusually large board roster growth')
    if previous_memory and previous_memory.get('rows') != memory.get('rows'):
        reasons.append('memory bonus thresholds changed')
    if current.get('unknownEffectTypes'):
        reasons.append('unknown board effects require implementation review: ' + ', '.join(current['unknownEffectTypes']))
    return reasons
