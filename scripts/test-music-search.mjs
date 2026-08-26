import assert from "node:assert/strict";
import {
  compareMusicAlphabetical,
  musicMatchesQuery,
  normalizeMusicSearch,
} from "../js/ui/music.js";

const songs = [
  {
    id: "m-b",
    title: "粛聖!! ロリ神レクイエム☆",
    singer_name: "Test B",
    search: {
      sort_key: "Shukusei Loli Kami Requiem",
      aliases: ["粛聖!! ロリ神レクイエム☆", "シュクセイ ロリカミ レクイエム", "shukusei loli kami requiem", "슈쿠세이 로리카미 레퀴엠", "숙성 로리신 레퀴엠"],
    },
  },
  {
    id: "m-a",
    title: "BANZAI☆MANKAI",
    singer_name: "Test A",
    search: {
      sort_key: "Banzai Mankai",
      aliases: ["BANZAI☆MANKAI", "banzai mankai"],
    },
  },
];

assert.equal(normalizeMusicSearch("BANZAI☆ MANKAI"), normalizeMusicSearch("banzai-mankai"));
assert.equal(normalizeMusicSearch("モグモグ"), normalizeMusicSearch("もぐもぐ"));
assert.equal(musicMatchesQuery(songs[0], "shukusei"), true);
assert.equal(musicMatchesQuery(songs[0], "슈쿠세이"), true);
assert.equal(musicMatchesQuery(songs[0], "숙성"), true);
assert.equal(musicMatchesQuery(songs[0], "粛聖"), true);
assert.equal(musicMatchesQuery(songs[0], "m-b"), true);
assert.deepEqual([...songs].sort(compareMusicAlphabetical).map((song) => song.id), ["m-a", "m-b"]);

console.log("[music-search] multilingual aliases and romanized sorting OK");
