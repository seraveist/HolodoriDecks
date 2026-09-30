import assert from 'node:assert/strict';
import { legacyRow, masterText } from './master-source.mjs';

assert.deepEqual(legacyRow({music_id: 'm0001', difficulty_type: {name: 'EXPERT', number: 4}, value: '9007199254740993'}), {
  music_id: 'm0001', difficulty_type: 4, value: '9007199254740993',
  data: {musicId: 'm0001', difficultyType: 'EXPERT', value: '9007199254740993'},
});
const commit = 'a'.repeat(40), version = 'b'.repeat(64), seen = [];
const files = ['kor', 'eng', 'jpn'].map(language => ({path: `languages/${language}/LangCard.json`, rows: 1}));
const fetcher = async url => {
  seen.push(url);
  return {ok: true, text: async () => JSON.stringify(url.endsWith('/manifest.json')
    ? {schemaVersion: 1, masterVersion: version, files} : [{id: 'card-name', text: 'Name'}])};
};
for (const suffix of ['Kor','Eng','Jpn']) {
  const rows = JSON.parse(await masterText('holodori-net/android-database', commit, `LangCard_${suffix}.json`, fetcher));
  assert.equal(rows[0].data.text, 'Name');
}
assert.equal(await masterText('holodori-net/android-database', commit, 'version.txt', fetcher), version);
assert.equal(seen.filter(url => url.endsWith('/manifest.json')).length, 1);
assert.ok(seen.every(url => url.includes(`/${commit}/`)));
await assert.rejects(masterText('holodori-net/android-database', 'main', 'Card.json', fetcher), /immutable/);
await assert.rejects(masterText('holodori-net/android-database', commit, 'Missing.json', fetcher), /missing/);
const badCount = async url => ({ok: true, text: async () => JSON.stringify(url.endsWith('/manifest.json')
  ? {schemaVersion: 1, files: [{path: 'tables/Card.json', rows: 2}]} : [{id: 'one'}])});
await assert.rejects(masterText('holodori-net/android-database', commit, 'Card.json', badCount), /row count/);
console.log('master source: immutable locale alignment, row counts, enums and int64 preservation passed');
