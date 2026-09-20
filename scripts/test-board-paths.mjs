import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBoardCatalog } from '../js/board-data.js';
import { emptyBoardState, toggleBoardNode, assignConnector, validateBoardState } from '../js/board-state.js';
import { planBoardNodeChange, planBoardCategoryChange, boardCategoryStatus, applyBoardNodePlan } from '../js/board-paths.js';
const read = name => JSON.parse(readFileSync(new URL('../data/generated/'+name, import.meta.url),'utf8'));
const catalog = createBoardCatalog(read('boards.json'),read('memory-bonuses.json'),read('i18n/boards/ko.json'),read('manifest.json'));
const id = 'chr-00001';
const plan = (state,node,action='auto',member=id) => planBoardNodeChange(state,member,node,catalog,action);
const apply = (state,node,action='auto',member=id) => applyBoardNodePlan(state,plan(state,node,action,member),catalog);
const empty = () => emptyBoardState(catalog);
const selected = state => state.boards[id].unlockedNodes;

test('distant top cell selects the entire central route and requires confirmation',()=>{
  const state=empty(), change=plan(state,'R-055');
  assert.equal(change.needsConfirmation,true); assert.equal(change.added.length,13);
  assert.deepEqual(change.path,['S-001','R-001','R-002','R-005','R-006','R-007','R-008','S-002','R-021','R-049','R-050','R-051','R-052','R-055']);
  assert.deepEqual(applyBoardNodePlan(state,change,catalog).boards[id].unlockedNodes,change.path.slice(1));
  assert.deepEqual(state,empty());
});
test('one adjacent cell toggles immediately; selecting the origin alone needs no confirmation',()=>{
  assert.equal(plan(empty(),'S-001').needsConfirmation,false);
  let state=apply(empty(),'S-001');
  assert.equal(plan(state,'B-001').needsConfirmation,false);
  state=apply(state,'B-001'); assert.equal(plan(state,'B-001').needsConfirmation,false);
  assert.deepEqual(selected(apply(state,'B-001')),['S-001']);
});
test('cutting the upper stem removes disconnected descendants and their Connect placement',()=>{
  let state=apply(empty(),'R-055'); state=apply(state,'B-002');
  const card=Object.keys(catalog.raw.cards).find(card=>catalog.canConnect(card));
  state=assignConnector(state,{characterId:id,slotId:'S-002'},card,new Set([card]),catalog);
  const change=plan(state,'R-008');
  assert.equal(change.needsConfirmation,true); assert.equal(change.removed.length,8);
  assert.deepEqual(change.removedCards,[{slotId:'S-002',cardId:card}]);
  const next=applyBoardNodePlan(state,change,catalog);
  assert.ok(selected(next).includes('B-002')); assert.ok(selected(next).includes('R-007'));
  assert.ok(!selected(next).includes('R-055')); assert.deepEqual(next.boards[id].connectors,{});
  assert.equal(state.boards[id].connectors['S-002'],card);
});
test('an alternate selected route preserves cells beyond the removed cell',()=>{
  let state=apply(empty(),'R-022'); state=apply(state,'R-009','select'); state=apply(state,'R-021','select');
  const change=plan(state,'R-021');
  assert.deepEqual(change.removed,['R-021']);
  assert.ok(selected(applyBoardNodePlan(state,change,catalog)).includes('R-022'));
});
test('existing selected routes are reused before adding new cells',()=>{
  const state=apply(empty(),'R-022');
  assert.deepEqual(plan(state,'R-023').added,['R-023']);
});
test('legacy isolated selected cell is connected when clicked, without erasing unrelated legacy input',()=>{
  let state=toggleBoardNode(empty(),id,'R-055',catalog);
  state=toggleBoardNode(state,id,'Y-031',catalog);
  const change=plan(state,'R-055');
  assert.equal(change.action,'select'); assert.equal(change.added.length,12);
  const next=applyBoardNodePlan(state,change,catalog);
  assert.ok(selected(next).includes('R-055')); assert.ok(selected(next).includes('Y-031'));
  assert.deepEqual(validateBoardState(state,catalog),state);
});
test('the central Connect selection is independent of paths anchored at the origin',()=>{
  let state=apply(empty(),'R-055'); state=apply(state,'S-001'); state=apply(state,'B-002','select','chr-00002'); state.memoryCount=20;
  const next=apply(state,'S-001','remove');
  assert.deepEqual(selected(next),selected(state).filter(id=>id!=='S-001')); assert.deepEqual(next.boards['chr-00002'],state.boards['chr-00002']);
  assert.equal(next.memoryCount,20);
});
test('screenshot-style legacy upper path with empty central Connect still cascades on stem removal',()=>{
  const state=apply(empty(),'R-055');
  assert.ok(!selected(state).includes('S-001'));
  const change=plan(state,'R-008');
  assert.equal(change.action,'remove'); assert.equal(change.removed.length,8);
  assert.ok(selected(applyBoardNodePlan(state,change,catalog)).includes('R-007'));
});
test('confirmation cannot apply stale or modified plans',()=>{
  const state=apply(empty(),'S-001'), change=plan(state,'R-055');
  assert.throws(()=>applyBoardNodePlan(apply(state,'B-001'),change,catalog),/BOARD_PATH_CHANGED/);
  assert.throws(()=>applyBoardNodePlan(state,{...change,added:['R-055']},catalog),/BOARD_PATH_CHANGED/);
});
test('every cell in all four original layouts has an orthogonal shortest path from origin',()=>{
  const layouts=new Set();
  for(const member of Object.keys(catalog.raw.resolved)) {
    const model=catalog.board(member); if(layouts.has(model.id))continue; layouts.add(model.id);
    const origin=model.nodes.find(n=>n.x===0&&n.y===0), distances=new Map([[origin.id,0]]), queue=[origin];
    for(const node of queue) for(const other of model.nodes) {
      if(Math.abs(node.x-other.x)+Math.abs(node.y-other.y)!==1||distances.has(other.id))continue;
      distances.set(other.id,distances.get(node.id)+1); queue.push(other);
    }
    assert.equal(distances.size,model.nodes.length);
    for(const node of model.nodes) {
      const change=plan(empty(),node.id,'select',member);
      assert.equal(change.path.length,distances.get(node.id)+1);
      assert.equal(change.path[0],origin.id); assert.equal(change.path.at(-1),node.id);
      for(let i=1;i<change.path.length;i++) {
        const a=model.byId.get(change.path[i-1]),b=model.byId.get(change.path[i]);
        assert.equal(Math.abs(a.x-b.x)+Math.abs(a.y-b.y),1);
      }
    }
  }
  assert.equal(layouts.size,4);
});
test('invalid member or cell cannot produce a change',()=>{
  assert.throws(()=>plan(empty(),'missing'),/INVALID_NODE/);
  assert.throws(()=>plan(empty(),'B-001','select','missing'),/INVALID_NODE/);
});

const categoryPlan=(state,type,action='select',member=id)=>planBoardCategoryChange(state,member,type,catalog,action);
test('all four categories select every cell with required paths across all four layouts',()=>{
  const layouts=new Set();
  for(const member of Object.keys(catalog.raw.resolved)) {
    const model=catalog.board(member);if(layouts.has(model.id))continue;layouts.add(model.id);
    for(const type of ['R','B','G','Y']) {
      const initial=empty(),change=categoryPlan(initial,type,'select',member);
      assert.ok(change.needsConfirmation);assert.deepEqual(initial,empty());
      const next=applyBoardNodePlan(initial,change,catalog);
      const wanted=model.nodes.filter(n=>n.type===type);
      assert.equal(boardCategoryStatus(next,member,catalog)[type].complete,true);
      assert.equal(boardCategoryStatus(next,member,catalog)[type].selected,wanted.length);
      assert.ok(!next.boards[member].unlockedNodes.includes('S-001'));
      assert.ok(change.added.every(id=>[type,'S'].includes(model.byId.get(id).type)));
      assert.deepEqual(next.boards[member].connectors,{});
      assert.equal(categoryPlan(next,type,'select',member).needsConfirmation,false);
    }
  }
});
test('category removal preserves the other three fields and central Connect placement',()=>{
  let state=empty();
  for(const type of ['R','B','G','Y'])state=applyBoardNodePlan(state,categoryPlan(state,type),catalog);
  state=apply(state,'S-001');
  const card=Object.keys(catalog.raw.cards).find(card=>catalog.canConnect(card));
  state=assignConnector(state,{characterId:id,slotId:'S-001'},card,new Set([card]),catalog);
  for(const type of ['R','B','G','Y']) {
    const change=categoryPlan(state,type,'remove'),next=applyBoardNodePlan(state,change,catalog);
    assert.equal(boardCategoryStatus(next,id,catalog)[type].selected,0);
    for(const other of ['R','B','G','Y'].filter(x=>x!==type))assert.equal(boardCategoryStatus(next,id,catalog)[other].complete,true);
    assert.equal(next.boards[id].connectors['S-001'],card);
    assert.ok(change.removed.every(id=>[type,'S'].includes(catalog.node('chr-00001',id).type)));
  }
});
test('category removal reports and atomically clears its disconnected Connect card',()=>{
  let state=applyBoardNodePlan(empty(),categoryPlan(empty(),'R'),catalog);
  const card=Object.keys(catalog.raw.cards).find(card=>catalog.canConnect(card));
  state=assignConnector(state,{characterId:id,slotId:'S-002'},card,new Set([card]),catalog);
  const change=categoryPlan(state,'R','remove');
  assert.deepEqual(change.removedCards,[{slotId:'S-002',cardId:card}]);
  assert.equal(change.removed.length,64);
  const next=applyBoardNodePlan(state,change,catalog);
  assert.deepEqual(next.boards[id].connectors,{});assert.deepEqual(selected(next),[]);
  assert.equal(state.boards[id].connectors['S-002'],card);
});
test('batch plans reject Connect category, stale inputs, tampering, and perform no work on empty categories',()=>{
  assert.throws(()=>categoryPlan(empty(),'S'),/INVALID_NODE/);
  assert.throws(()=>categoryPlan(empty(),'unknown'),/INVALID_NODE/);
  assert.throws(()=>categoryPlan(empty(),'R','auto'),/INVALID_NODE/);
  const change=categoryPlan(empty(),'R');
  assert.throws(()=>applyBoardNodePlan(apply(empty(),'B-001'),change,catalog),/BOARD_PATH_CHANGED/);
  assert.throws(()=>applyBoardNodePlan(empty(),{...change,added:[]},catalog),/BOARD_PATH_CHANGED/);
  assert.equal(categoryPlan(empty(),'G','remove').needsConfirmation,false);
  assert.deepEqual(boardCategoryStatus(empty(),id,catalog).R,{selected:0,total:63,complete:false});
});
test('bulk select repairs missing paths even when all category cells were already selected',()=>{
  let state=applyBoardNodePlan(empty(),categoryPlan(empty(),'R'),catalog);
  state=toggleBoardNode(state,id,'S-002',catalog);
  assert.equal(boardCategoryStatus(state,id,catalog).R.complete,false);
  assert.equal(boardCategoryStatus(state,id,catalog).R.selected,63);
  const change=categoryPlan(state,'R');assert.deepEqual(change.added,['S-002']);
  assert.equal(boardCategoryStatus(applyBoardNodePlan(state,change,catalog),id,catalog).R.complete,true);
});
