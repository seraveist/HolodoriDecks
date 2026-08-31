import fs from "node:fs";
import { prepareScoreCards } from "../js/card-prepare.js";
import { evaluateDeck } from "../js/score.js";

const cards = JSON.parse(fs.readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
const characters = JSON.parse(fs.readFileSync(new URL("../data/generated/characters.json", import.meta.url), "utf8"));
const music = JSON.parse(fs.readFileSync(new URL("../data/generated/music.json", import.meta.url), "utf8"));
const chartIndex = JSON.parse(fs.readFileSync(new URL("../data/generated/chart-index.json", import.meta.url), "utf8"));
const rules = JSON.parse(fs.readFileSync(new URL("../data/generated/live-score-rules.json", import.meta.url), "utf8"));
const masterRefs = JSON.parse(fs.readFileSync(new URL("../data/generated/master_refs.json", import.meta.url), "utf8"));
const charactersById = new Map(characters.map((row) => [row.id, row]));
const settings = Object.fromEntries(cards.map((card) => {
  const maxLevel = Math.max(1, ...(card.growth?.levels ?? []).map((row) => Number(row.level) || 1));
  return [card.id, { level: maxLevel, potential: 0 }];
}));
const prepared = prepareScoreCards(cards, charactersById, settings, { levelMode: "max", masterRefs });

const leader = prepared.get("card-00001-4-cmmn-0000-00");
const memberIds = [
  "card-00018-5-uniq-0004-00",
  "card-00021-5-uniq-0064-00",
  "card-00022-5-uniq-0018-00",
  "card-06002-5-uniq-0058-00",
  "card-06004-5-uniq-0060-00",
];
const song = music.find((row) => row.id === "m0008");
const chart = chartIndex.charts?.["m0008:EXPERT"];
const songContext = { ...song, _chart: { ...chart, metadata: null }, _scoreRules: rules };

function permutations(values) {
  if (values.length <= 1) return [values];
  const result = [];
  values.forEach((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const tail of permutations(rest)) result.push([value, ...tail]);
  });
  return result;
}

const rows = permutations(memberIds).map((order) => {
  const members = order.map((id) => prepared.get(id));
  const score = evaluateDeck({
    leader,
    members,
    music: songContext,
    difficulty: "EXPERT",
    playMode: "auto",
    separateRole: true,
    evaluationTarget: "score",
    includeDiagnostics: true,
  });
  return {
    order,
    rankingScore: score.rankingScore,
    unitScore: score.unitScore,
    passiveSupport: score.passiveSupportByMember,
    scoreBonusPct: score.scoreBonusPct,
  };
}).sort((a, b) => b.rankingScore - a.rankingScore || b.unitScore - a.unitScore);

const distinct = [...new Set(rows.map((row) => row.rankingScore))];
console.log(JSON.stringify({
  song: "m0008:EXPERT",
  composition: memberIds,
  permutations: rows.length,
  distinctRankingScores: distinct,
  best: rows[0],
  worst: rows.at(-1),
}, null, 2));
