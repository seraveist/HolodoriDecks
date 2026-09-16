import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BOARD_LANGUAGE_FILES = [
  'LangSkillTreeEffect', 'LangGeneratedSkillTreeEffect', 'LangGeneratedSkillTreeEffectTarget',
  'LangGeneratedSkillTreeEffectPassiveTrigger', 'LangGeneratedSkillTreeConnectEffect',
  'LangCondition', 'LangItem', 'LangCharacterGrouping', 'LangSkillTreePoint',
  'LangGeneratedLiveActiveSkillLevel', 'LangGeneratedLiveActiveSkillEffect', 'LangGeneratedLiveSkillTrigger',
];
export function makeBoardLocale(board, locale, config, inputs) {
  const all = {};
  for (const [name, text] of Object.entries(inputs)) {
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) throw new Error(`Invalid board language rows: ${name}`);
    for (const row of rows) {
      const id = row?.data?.id ?? row?.id;
      const value = row?.data?.text;
      if (!id || typeof value !== 'string' || !value.trim()) continue;
      if (Object.hasOwn(all, id) && all[id] !== value) throw new Error(`Conflicting translation: ${id}`);
      all[id] = value;
    }
  }
  const missing = board.requiredLangIds.filter(id => !Object.hasOwn(all, id));
  if (missing.length) throw new Error(`${locale}: missing board translations: ${missing.slice(0, 10).join(', ')}`);
  return {
    format: 'holodori-board-locale', version: 1, locale,
    master_version: board.master_version, source_commit: board.source_commit,
    locale_commit: config.commit,
    input_hashes: Object.fromEntries(Object.entries(inputs).sort().map(([name, text]) => [name, createHash('sha256').update(text).digest('hex')])),
    texts: Object.fromEntries(board.requiredLangIds.map(id => [id, all[id]])),
  };
}
export async function buildBoardI18n({ generated = path.join(root, 'data/generated'), fetcher = fetch } = {}) {
  const read = async name => JSON.parse(await readFile(path.join(generated, name), 'utf8'));
  const [manifest, board] = await Promise.all([read('manifest.json'), read('boards.json')]);
  if (board.source_commit !== manifest.source_commit || board.master_version !== manifest.master_version) throw new Error('Mixed board/core snapshots');
  const results = {};
  // Finish all language validation before replacing any language pack.
  for (const [locale, config] of Object.entries(manifest.locales)) {
    const request = async name => {
      const response = await fetcher(`https://raw.githubusercontent.com/${config.repository}/${config.commit}/${name}`);
      if (!response.ok) throw new Error(`${locale}/${name}: HTTP ${response.status}`);
      return response.text();
    };
    if ((await request('version.txt')).trim() !== board.master_version) throw new Error(`${locale}: Master mismatch`);
    const inputs = {};
    for (const name of BOARD_LANGUAGE_FILES) {
      const filename = `${name}_${config.suffix}.json`;
      inputs[filename] = await request(filename);
    }
    results[locale] = makeBoardLocale(board, locale, config, inputs);
  }
  await mkdir(path.join(generated, 'i18n/boards'), { recursive: true });
  for (const [locale, pack] of Object.entries(results)) {
    await writeFile(path.join(generated, 'i18n/boards', `${locale}.json`), JSON.stringify(pack) + '\n');
  }
  console.log(`[board-i18n] ${Object.keys(results).join('/')} · ${board.requiredLangIds.length} required strings per locale`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildBoardI18n();
}
