/** Real local HTTP server, native localStorage, real generated data and artwork. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchSmokeBrowser } from './smoke-browser-launch.mjs';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(process.env.BROWSER_SMOKE_ROOT || repository);
const python=process.env.PYTHON_BIN || (process.platform==='win32'?'py':'python3');
const pageBuild=spawnSync(python,[path.join(repository,'scripts/build-localized-pages.py'),'--root',root],{encoding:'utf8'});
assert.equal(pageBuild.status,0,pageBuild.stderr);
const port=Number(process.env.BROWSER_SMOKE_PORT || 4188), origin=`http://127.0.0.1:${port}`;
const artifacts=path.resolve(process.env.BOARD_SMOKE_ARTIFACT_DIR || path.join(repository,'.local/board-smoke'));
const read=async name=>JSON.parse(await fs.readFile(path.join(repository,'data/generated',name),'utf8'));
const [allCards,boards]=await Promise.all([read('cards.json'),read('boards.json')]);
const seen=new Set();
const cards=allCards.filter(c=>c.rarity===5 && boards.cards[c.id]?.connectEffectId && !seen.has(c.character_id) && seen.add(c.character_id)).slice(0,8);
const card=cards[0];
const profile={ownedCardIds:cards.map(c=>c.id),ownedCardSettings:Object.fromEntries(cards.map(c=>[c.id,{level:60,potential:0}]))};
const boardKey='holodori-decksim:boards:v1',deckKey='holodori-decksim:v2',oldKey='holodori-decksim:board-ui-preview:v1';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await sleep(80);}throw new Error(label);}
function executable(){
  if(process.env.CHROME_BIN)return process.env.CHROME_BIN;
  for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
    const found=spawnSync('which',[name],{encoding:'utf8'});if(found.status===0)return found.stdout.trim();
  }
  throw new Error('Set CHROME_BIN to a Chrome/Chromium executable');
}
const server=spawn(python,['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let chrome,socket;
try{
  await until(async()=>{try{return(await fetch(origin)).ok;}catch{return false;}},'HTTP server unavailable',10000);
  chrome=await launchSmokeBrowser(executable());
  const debug=new URL(chrome.debuggerUrl);
  const target=await(await fetch(`http://${debug.hostname}:${debug.port}/json/new?about:blank`,{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let sequence=0;const pending=new Map(),errors=[],requests=[],failed=[];
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if(message.method==='Network.requestWillBeSent')requests.push(message.params.request.url);
    if(message.method==='Network.responseReceived' && message.params.response.url.startsWith(origin) && message.params.response.status>=400 && !message.params.response.url.endsWith('/favicon.ico')) failed.push(message.params.response.url);
    if(message.method==='Page.javascriptDialogOpening') command('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});
    if(!message.id)return;const promise=pending.get(message.id);if(!promise)return;
    clearTimeout(promise.timer);pending.delete(message.id);message.error?promise.reject(new Error(message.error.message)):promise.resolve(message.result);
  });
  function command(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},25000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });}
  async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);return result.result?.value;}
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const boardState=()=>evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(boardKey)}))`);
  const loaded=()=>until(()=>evaluate(`Boolean(document.querySelector('#board-tab') && document.querySelector('#music-select')?.options.length>2)`),'app failed to load').catch(async error=>{console.error({errors,failed,body:await evaluate('document.body?.innerText')});throw error;});
  const navigateBoard=async id=>{await evaluate(`location.hash=${JSON.stringify('board/'+id)}`);await until(()=>evaluate(`document.querySelector('#board-detail')?.dataset.characterId===${JSON.stringify(id)} && !document.querySelector('#board-detail')?.hidden && document.querySelectorAll('#board-canvas [data-board-node]').length>0`),'board detail unavailable');await sleep(100);};
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:origin+'/ko/'});await loaded();
  assert.ok(!requests.some(url=>/\/(?:boards|memory-bonuses)\b|i18n-boards/.test(url)),'boards loaded eagerly');
  await evaluate(`localStorage.setItem(${JSON.stringify(deckKey)},${JSON.stringify(JSON.stringify(profile))})`);
  await command('Page.reload',{ignoreCache:true});await loaded();
  await click('#auto-compose');await until(()=>evaluate(`document.querySelectorAll('.recommendation-result-card').length===5`),'unit result unavailable',30000);
  const scoreBefore=await evaluate(`document.querySelector('#recommendation-results').textContent`);
  await click('#board-tab');await until(()=>evaluate(`document.querySelectorAll('.board-member').length===${Object.keys(boards.characters).length}`),'roster unavailable');
  assert.equal(await evaluate(`document.querySelectorAll('.board-member:not(:disabled)').length`),Object.keys(boards.resolved).length);
  await evaluate(`document.querySelector('#board-memory-count').value='31';document.querySelector('#board-memory-count').dispatchEvent(new Event('change'))`);
  assert.match(await evaluate(`document.querySelector('#board-memory-bonus').textContent`),/6\.1%/);
  await navigateBoard('chr-00001');
  await click('#board-canvas [data-board-node="B-001"]');
  assert.doesNotMatch(await evaluate(`document.querySelector('#board-node-detail').textContent`),/\[value|\[character\]/);
  await click('[data-board-action="toggle"]');
  assert.ok((await boardState()).boards['chr-00001'].unlockedNodes.includes('B-001'));
  await click('#board-canvas [data-board-node="S-001"]');await click('[data-board-action="toggle"]');await click('[data-board-action="picker"]');
  assert.equal(await evaluate(`document.querySelectorAll('[data-board-card]').length`),cards.length);
  await click(`[data-board-card="${card.id}"]`);
  assert.equal((await boardState()).boards['chr-00001'].connectors['S-001'],card.id);
  assert.ok(await evaluate(`document.querySelectorAll('.board-range-preview .is-covered').length>0`));
  await fs.mkdir(artifacts,{recursive:true});
  async function screenshot(name){const result=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));}
  await screenshot('master-board-desktop');
  await navigateBoard('chr-00002');await click('#board-canvas [data-board-node="S-002"]');await click('[data-board-action="toggle"]');await click('[data-board-action="picker"]');
  assert.match(await evaluate(`document.querySelector('[data-board-card="${card.id}"] .board-card-state').textContent`),/S-001/);
  await click(`[data-board-card="${card.id}"]`);
  assert.equal(await evaluate(`document.querySelector('#board-transfer').hidden`),false);
  await click('[data-board-action="cancel"]');
  assert.equal((await boardState()).boards['chr-00001'].connectors['S-001'],card.id);
  await click(`[data-board-card="${card.id}"]`);await screenshot('master-connect-picker');await click('[data-board-action="confirm"]');
  const moved=await boardState();assert.equal(moved.boards['chr-00001'].connectors['S-001'],undefined);assert.equal(moved.boards['chr-00002'].connectors['S-002'],card.id);
  assert.equal(await evaluate(`document.querySelector('#recommendation-results').textContent`),scoreBefore,'board edits changed score results');
  await command('Page.reload',{ignoreCache:true});await loaded();await until(()=>evaluate(`document.querySelectorAll('#board-canvas [data-board-node]').length>0`),'board did not restore');
  assert.equal((await boardState()).boards['chr-00002'].connectors['S-002'],card.id);
  await click('#owned-tab');
  await evaluate(`const input=document.querySelector('[data-owned-potential="${card.id}"]');input.value='5';input.dispatchEvent(new Event('change',{bubbles:true}));`);
  await navigateBoard('chr-00002');await click('#board-canvas [data-board-node="S-002"]');
  assert.match(await evaluate(`document.querySelector('#board-node-detail .board-connect-effect').textContent`),/Lv\.2/);
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
  await click('#theme-toggle');await click('[data-board-action="fit"]');
  assert.equal(await evaluate(`document.documentElement.scrollWidth>document.documentElement.clientWidth+1`),false,'mobile page overflow');
  await screenshot('master-board-mobile-dark');
  for(const locale of ['en','ja']){
    await command('Page.navigate',{url:origin+'/'+locale+'/#board/chr-04016'});await loaded();
    await until(()=>evaluate(`document.querySelectorAll('#board-canvas [data-board-node]').length>0`),'localized board missing');
    await click('#board-canvas [data-board-node="Y-001"]');
    const description=await evaluate(`document.querySelector('#board-node-detail .board-effect-description').textContent`);
    assert.doesNotMatch(description,/\[value|\[character\]/);
    assert.equal(await evaluate(`document.documentElement.scrollWidth>document.documentElement.clientWidth+1`),false,locale+' mobile overflow');
  }
  // Explicit preview conversion uses native confirmation; old bytes remain intact.
  const preview=JSON.stringify({format:'holodori-board-ui-preview',version:1,layoutId:'tree-model-001-ui-reference-v1',memoryCount:10,boards:{'chr-00001':{unlockedNodes:['B-001'],connectors:{}}}});
  await evaluate(`localStorage.setItem(${JSON.stringify(oldKey)},${JSON.stringify(preview)})`);
  await click('[data-board-action="back"]');await click('[data-board-action="migrate"]');
  assert.equal((await boardState()).memoryCount,10);
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(oldKey)})`),preview);
  assert.equal((await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(deckKey)}))`)).ownedCardIds.length,cards.length);
  assert.deepEqual(errors,[],'uncaught browser errors');assert.deepEqual(failed,[],'failed local asset requests');
  console.log('board browser: real assets/storage; lazy data, models, nodes, memory, Connect move/cancel, awakening, persistence, migration, KO/EN/JA, mobile dark and score isolation OK');
} finally {
  try{socket?.close();}catch{}
  try{await chrome?.close();}finally{server.kill('SIGTERM');}
}
