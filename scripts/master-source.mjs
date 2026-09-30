// Compatibility reader shared by the locale and chart builders.
// Python uses the protobuf descriptor for full enum/type validation during sync.
const DATABASE = 'holodori-net/android-database';
const languages = { Kor: 'kor', Eng: 'eng', Jpn: 'jpn' };
const manifests = new WeakMap();

export function legacyRow(row) {
  const camel = name => name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const convert = value => {
    if (Array.isArray(value)) return value.map(convert);
    if (value && typeof value === 'object') {
      if (typeof value.name === 'string' && Number.isInteger(value.number)) return value.name;
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [camel(key), convert(item)]));
    }
    return value;
  };
  return { ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    value && typeof value === 'object' && Number.isInteger(value.number) ? value.number : value])), data: convert(row) };
}

export async function masterText(repository, commit, filename, fetcher = fetch) {
  const request = async name => {
    const response = await fetcher(`https://raw.githubusercontent.com/${repository}/${commit}/${name}`);
    if (!response.ok) throw new Error(`${repository}/${name}: HTTP ${response.status}`);
    return response.text();
  };
  // Older snapshots are still supported for archived builds and isolated fixtures.
  if (repository !== DATABASE) return request(filename);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('An immutable master commit is required');
  if (!manifests.has(fetcher)) manifests.set(fetcher, new Map());
  const cache = manifests.get(fetcher);
  if (!cache.has(commit)) cache.set(commit, request('manifest.json').then(JSON.parse));
  const manifest = await cache.get(commit);
  if (manifest.schemaVersion !== 1) throw new Error('Unsupported Android master schema');
  if (filename === 'version.txt') return manifest.masterVersion;
  const locale = /^(Lang.+)_(Kor|Eng|Jpn)\.json$/.exec(filename);
  const source = locale ? `languages/${languages[locale[2]]}/${locale[1]}.json` : `tables/${filename}`;
  const entry = manifest.files.find(item => item.path === source);
  if (!entry) throw new Error(`Master manifest is missing ${source}`);
  const rows = JSON.parse(await request(source));
  if (!Array.isArray(rows) || rows.length !== entry.rows) throw new Error(`Master row count mismatch: ${source}`);
  return JSON.stringify(rows.map(legacyRow));
}
