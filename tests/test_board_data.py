"""Exercise the committed real Master graph and failure cases without networking."""
import copy
import json
from pathlib import Path

import pytest
from holodori_decksim.board_data import (
    BOARD_FILES, build_board_data, validate_board_data, resolve_variant,
    board_change_reasons, rows,
)
from holodori_decksim.sources import MASTER_FILES

ROOT = Path(__file__).resolve().parents[1]
def load(name):
    return json.loads((ROOT / 'data/generated' / name).read_text(encoding='utf-8'))

@pytest.fixture
def catalog():
    return load('boards.json'), load('memory-bonuses.json')

def validate(board, memory):
    return validate_board_data(board, memory, {x['id'] for x in load('characters.json')}, {x['id'] for x in load('cards.json')})

def test_real_graph_and_manifest_agree(catalog):
    b,m = catalog
    assert validate(b,m) == load('manifest.json')['board_counts']
    assert b['source_commit'] == load('manifest.json')['source_commit']
    assert set(BOARD_FILES) <= set(MASTER_FILES)
    for row in load('characters.json'):
        assert row['board_layout_id'] == b['characters'][row['id']]['layoutId']
    for row in load('cards.json'):
        assert row['connect_effect_id'] == b['cards'][row['id']]['connectEffectId']


def test_four_models_have_distinct_real_layouts(catalog):
    b,_ = catalog
    a = {x['id']:(x['x'],x['y']) for x in b['layouts']['tree-model-001']}
    c = {x['id']:(x['x'],x['y']) for x in b['layouts']['tree-model-002']}
    assert a['B-001'] == (-1,0) and c['B-001'] == (1,0)
    assert a['S-001'] == (0,0)
    assert b['resolved']['chr-04016']['Y-001'] == 2
    assert b['resolved']['chr-00001']['Y-001'] == 1


def test_absent_master_models_are_not_fabricated(catalog):
    b,_ = catalog
    for member,definition in b['characters'].items():
        if not definition['layoutId']: assert member not in b['resolved']


def test_variants_require_unique_specific_or_common():
    common={'number':1};specific={'number':2,'characterIds':['a']}
    assert resolve_variant({'1':common,'2':specific},'a') == specific
    assert resolve_variant({'1':common,'2':specific},'b') == common
    with pytest.raises(ValueError): resolve_variant({'2':specific},'b')
    with pytest.raises(ValueError): resolve_variant({'1':common,'2':specific,'3':specific},'a')

@pytest.mark.parametrize('mutation',[
    lambda b,m: b['effects'].clear(),
    lambda b,m: b['layouts']['tree-model-001'].append(b['layouts']['tree-model-001'][0]),
    lambda b,m: b['conditions'].clear(),
    lambda b,m: b['relatedSkills'].clear(),
    lambda b,m: b['connectRanges'].clear(),
    lambda b,m: m['rows'].append(m['rows'][0]),
    lambda b,m: m.update(source_commit='a'*40),
    lambda b,m: b['resolved']['chr-04016'].update({'Y-001':1}),
])
def test_broken_dependencies_fail_closed(catalog,mutation):
    b,m = catalog;mutation(b,m)
    with pytest.raises(ValueError): validate(b,m)


def test_connect_nodes_may_omit_effect_and_cost(catalog):
    b,m = catalog
    assert 'skillTreeEffectId' not in b['definitions']['S-001']['1']
    assert b['definitions']['S-001']['1'].get('consumptionSkillTreePointQuantity',0) == 0
    validate(b,m)


def test_locales_are_complete_versioned_and_hashed(catalog):
    b,_ = catalog
    for lang in ('ko','en','ja'):
        pack=load(f'i18n/boards/{lang}.json')
        assert pack['master_version'] == b['master_version']
        assert pack['locale_commit'] == load('manifest.json')['locales'][lang]['commit']
        assert set(pack['texts']) == set(b['requiredLangIds'])
        assert all(pack['texts'].values())
        assert all(len(value)==64 for value in pack['input_hashes'].values())


def test_envelope_zero_and_enum_names_are_preserved():
    source={'p.json':json.dumps([{'position_x':0,'data':{'positionY':-1}},
      {'skill_tree_effect_type':19,'data':{'skillTreeEffectType':'SkillTreeEffectType_SOME_ENUM'}}])}
    result=rows(source,'p.json')
    assert result[0]['positionX']==0
    assert result[1]['skillTreeEffectType']=='SkillTreeEffectType_SOME_ENUM'


def test_board_gate_checks_semantics_not_just_counts(catalog):
    b,m = catalog
    assert board_change_reasons(b,b,m,m)==[]
    changed=copy.deepcopy(b);key=next(iter(changed['effects']));changed['effects'][key]['value']='999'
    assert any('effects' in reason for reason in board_change_reasons(b,changed,m,m))
    assert board_change_reasons(None,b,None,m)
    changed=copy.deepcopy(b);changed['unknownEffectTypes']=['new-effect']
    assert any('unknown' in reason for reason in board_change_reasons(b,changed,m,m))


def test_normalizer_roundtrip_is_deterministic_and_does_not_mutate_inputs(catalog):
    b,m=catalog
    tables={
      'Character':[{'id':cid,'skillTreeNodePositionGroupId':v['layoutId'],'skillTreePointId':v['pointId'],
                    'characterLevelGroupId':v['levelGroupId']} for cid,v in b['characters'].items()],
      'Card':[{'id':cid,'characterId':v['characterId'],'skillTreeConnectEffectId':v['connectEffectId'],
               'cardPotentialGroupId':v['potentialGroupId']} for cid,v in b['cards'].items()],
      'SkillTreeNodePosition':[{'groupId':gid,'skillTreeNodeGroupId':n['id'],'positionX':n['x'],'positionY':n['y']}
                              for gid,ns in b['layouts'].items() for n in ns],
      'SkillTreeNode':[n for ns in b['definitions'].values() for n in ns.values()],
      'SkillTreeEffect':list(b['effects'].values()),'SkillTreeEffectTarget':list(b['targets'].values()),
      'SkillTreeEffectPassiveTrigger':[n for ns in b['passiveTriggers'].values() for n in ns.values()],
      'SkillTreeEffectValueLimit':[{'skillTreeEffectType':k,'limit':v} for k,v in b['limits'].items()],
      'SkillTreeConnectEffect':[n for ns in b['connectEffects'].values() for n in ns.values()],
      'SkillTreeConnectEffectExtent':[{'groupId':k,'positionX':n['x'],'positionY':n['y']} for k,ns in b['connectRanges'].items() for n in ns],
      'Condition':[n for ns in b['conditions'].values() for n in ns.values()],
      'Item':list(b['items'].values()),'CharacterGrouping':list(b['groupings'].values()),
      'LiveActiveSkillLevel':[n for ns in b['relatedSkills'].values() for n in ns.values()],
      'LiveActiveSkillEffect':[n for ns in b['activeEffects'].values() for n in ns.values()],
      'LiveSkillTrigger':[n for ns in b['liveTriggers'].values() for n in ns.values()],
      'CardPotential':[n for ns in b['potentials'].values() for n in ns],
      'SkillTreePoint':list(b['points'].values()),
      'CharacterLevel':[n for ns in b['characterLevels'].values() for n in ns.values()],
      'PosterCollectEffect':[{'threshold':n['count'],'liveDeckAllParameterUpPermilUp':n['parameterPermil']} for n in m['rows']],
    }
    snapshot={'contents':{k+'.json':json.dumps([{'data':v} for v in values]) for k,values in tables.items()},
              'upstream_commit':b['source_commit'],'master_version':b['master_version']}
    before=copy.deepcopy(snapshot)
    first=build_board_data(snapshot,set(b['characters']),set(b['cards']))
    second=build_board_data(snapshot,set(b['characters']),set(b['cards']))
    assert first==second==catalog
    assert snapshot==before
