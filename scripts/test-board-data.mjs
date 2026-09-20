import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBoardCatalog, connectInfo, connectRange, memoryBonus, boardDescription, loadBoardCatalog } from '../js/board-data.js';
import { emptyBoardState, toggleBoardNode, assignConnector, migrateBoardPreview, validateBoardState, BOARD_STORAGE_KEY, PREVIEW_STORAGE_KEY } from '../js/board-state.js';
const read=name=>JSON.parse(readFileSync(new URL('../data/generated/'+name,import.meta.url),'utf8'));
const raw=read('boards.json'), memory=read('memory-bonuses.json'), manifest=read('manifest.json');
const pack=read('i18n/boards/ko.json');
const catalog=createBoardCatalog(raw,memory,pack,manifest);
const cards=read('cards.json');
const card=cards.find(c=>catalog.canConnect(c.id) && c.rarity===5);
const owned=new Set([card.id]);

test('every available member resolves all original model nodes',()=>{
  assert.equal(Object.keys(raw.resolved).length,manifest.board_counts.characters);
  for(const id of Object.keys(raw.resolved)) assert.equal(catalog.board(id).nodes.length,Object.keys(raw.resolved[id]).length);
  for(const [id,v] of Object.entries(raw.characters)) if(!v.layoutId) assert.equal(catalog.has(id),false);
});
test('all three languages expand character and value placeholders',()=>{
  for(const locale of ['ko','en','ja']) {
    const c=createBoardCatalog(raw,memory,read(`i18n/boards/${locale}.json`),manifest);
    for(const node of c.board('chr-00001').nodes) {
      const description=boardDescription(c,node.effect,'MEMBER');
      assert.doesNotMatch(description,/\[value|\[character\]|\[\/?highlight\]/);
    }
  }
});
test('real model differences and specific FUWAMOCO overrides survive',()=>{
  assert.equal(catalog.node('chr-00001','B-001').x,-1);
  assert.equal(catalog.node('chr-00002','B-001').x,1);
  assert.equal(catalog.node('chr-04016','Y-001').number,2);
  assert.equal(catalog.node('chr-00001','Y-001').number,1);
});
test('mixed core, board, and locale snapshots are rejected',()=>{
  assert.throws(()=>createBoardCatalog({...raw,source_commit:'a'.repeat(40)},memory,pack,manifest),/mixed/);
  assert.throws(()=>createBoardCatalog(raw,memory,{...pack,locale_commit:'a'.repeat(40)},manifest),/locale revision/);
  assert.throws(()=>createBoardCatalog(raw,memory,{...pack,texts:{}},manifest),/translations/);
});
test('memory uses table values, preserves blank/zero and does not invent >max',()=>{
  assert.equal(memoryBonus(catalog,null).status,'unset');
  assert.equal(memoryBonus(catalog,0).percent,0);
  assert.equal(memoryBonus(catalog,30).percent,6);
  assert.equal(memoryBonus(catalog,31).percent,6.1);
  assert.equal(memoryBonus(catalog,50).percent,8);
  assert.equal(memoryBonus(catalog,memory.rows.at(-1).count+1).status,'unknown');
  assert.throws(()=>memoryBonus(catalog,-1),/MEMORY/);
});
test('connect base and awakened levels are different rows, not ID overwrites',()=>{
  const base=connectInfo(catalog,card.id,4), awakened=connectInfo(catalog,card.id,5);
  assert.equal(base.level,1);assert.equal(awakened.level,2);
  assert.ok(awakened.boostPercent>base.boostPercent);
  assert.deepEqual(connectInfo(catalog,card.id,0),base);
});
test('range uses original slot-relative geometry without fabricated transformations',()=>{
  const info=connectInfo(catalog,card.id,0), slot=catalog.node('chr-00001','S-003');
  assert.deepEqual(connectRange(catalog,'chr-00001','S-003',card.id,0),info.cells.map(c=>({x:slot.x+c.x,y:slot.y+c.y})));
});
test('preview does not validate as production; explicit migration reports unsupported boards',()=>{
  const absent=Object.keys(raw.characters).find(id=>!catalog.has(id));
  const preview={format:'holodori-board-ui-preview',version:1,layoutId:'tree-model-001-ui-reference-v1',memoryCount:31,
    boards:{'chr-00001':{unlockedNodes:['B-001','S-001'],connectors:{'S-001':card.id}},[absent]:{unlockedNodes:['B-001'],connectors:{}}}};
  const text=JSON.stringify(preview);
  assert.throws(()=>validateBoardState(preview,catalog),/INVALID_BOARD_FILE/);
  const migrated=migrateBoardPreview(text,catalog,owned);
  assert.equal(migrated.state.memoryCount,31);assert.equal(migrated.issues.length,1);
  assert.equal(migrated.state.boards['chr-00001'].connectors['S-001'],card.id);
  assert.equal(JSON.stringify(preview),text);
  assert.notEqual(BOARD_STORAGE_KEY,PREVIEW_STORAGE_KEY);
});
test('a missing or changed model never silently validates an old selection',()=>{
  const state=toggleBoardNode(emptyBoardState(catalog),'chr-00001','B-001',catalog);
  state.boards['chr-00001'].layoutId='fake';
  assert.throws(()=>validateBoardState(state,catalog),/BOARD_PROFILE_REVIEW/);
});
test('lazy loader requests only the matching board bundle and supports public hash paths',async()=>{
  const files={'boards.json':raw,'memory-bonuses.json':memory,'i18n/boards/ko.json':pack};const urls=[];
  const loaded=await loadBoardCatalog(manifest,'ko',async url=>{
    urls.push(String(url));const name=decodeURIComponent(new URL(url).pathname).split('/data/generated/')[1];
    return {ok:true,json:async()=>files[name]};
  });
  assert.equal(loaded.masterVersion,catalog.masterVersion);assert.equal(urls.length,3);
  await assert.rejects(loadBoardCatalog(manifest,'ko',async()=>({ok:false,status:404})),/404/);
});
test('board edits cannot mutate the production card objects or score definitions',()=>{
  const before=JSON.stringify(cards);
  let state=toggleBoardNode(emptyBoardState(catalog),'chr-00001','S-001',catalog);
  state=assignConnector(state,{characterId:'chr-00001',slotId:'S-001'},card.id,owned,catalog);
  connectInfo(catalog,card.id,5);assert.equal(JSON.stringify(cards),before);
  assert.equal(raw.capabilities.scoreIntegration,true);
});
