#!/usr/bin/env node
/*
 * js/audio-list.js 를 다시 만든다.
 *
 *   사용법:  node tools/make-audio-list.js
 *
 * 아래 AUDIO_DIRS 에 적힌 폴더들을 훑어 <대주제 폴더>/<영어 단어>.mp3 목록을 만든다.
 * 녹음 파일을 넣거나 뺀 뒤, 또는 폴더를 새로 추가한 뒤 이 스크립트를 다시 실행하면 된다.
 * 같은 단어가 여러 폴더에 있으면 먼저 적힌 폴더가 쓰인다.
 */
const fs = require("fs");
const path = require("path");

const AUDIO_DIRS = ["audio_260824", "audio_260915_추가117"];

const root = path.resolve(__dirname, "..");
const sources = [];
for (const dir of AUDIO_DIRS) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) { console.error("폴더가 없습니다: " + dir); process.exit(1); }
  const index = {};
  for (const folder of fs.readdirSync(abs).sort()) {
    const folderAbs = path.join(abs, folder);
    if (!fs.statSync(folderAbs).isDirectory()) continue;
    const files = fs.readdirSync(folderAbs)
      .filter(n => n.toLowerCase().endsWith(".mp3"))
      .map(n => n.slice(0, -4))
      .sort((a, b) => a.localeCompare(b));
    if (files.length) index[folder] = files;
  }
  sources.push({ dir, index });
  console.log(dir + ": " + Object.values(index).flat().length + "개");
}

const out =
  "/* 자동 생성 파일 — 직접 고치지 마세요. 녹음 파일을 넣거나 뺀 뒤 node tools/make-audio-list.js 를 다시 실행하세요. */\n" +
  "/* 정답 음성 파일: <폴더>/<대주제>/<영어 단어>.mp3 */\n" +
  "const WORD_AUDIO_SOURCES = " + JSON.stringify(sources) + ";\n";
fs.writeFileSync(path.join(root, "js", "audio-list.js"), out, "utf8");
console.log("js/audio-list.js 를 새로 만들었습니다 (합계 " +
  sources.reduce((n, s) => n + Object.values(s.index).flat().length, 0) + "개)");
