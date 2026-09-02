#!/usr/bin/env node
/*
 * 게임 자가점검 — 파일 검사
 *
 * 브라우저 없이 게임 폴더를 훑어 배포 후 문제가 될 만한 것을 찾습니다.
 *
 *   사용법:  node check-files.js [게임폴더]      (생략하면 현재 폴더)
 *   결과 파일로 받기:  JSON_OUT=result.json node check-files.js ./game
 *
 * 외부 라이브러리를 쓰지 않습니다. 자유롭게 사용·수정·재배포하셔도 됩니다.
 * 검사 항목은 아래 ── 1. ~ ── 8. 로 나뉘어 있으니 필요에 맞게 빼거나 더하세요.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || '.');
const OUT = [];
let errCount = 0, warnCount = 0;

if (!fs.existsSync(ROOT)) {
  console.error('검사할 폴더를 찾지 못했습니다: ' + ROOT);
  process.exit(1);
}
if (!fs.statSync(ROOT).isDirectory()) {
  console.error('검사 대상은 폴더여야 합니다: ' + ROOT);
  process.exit(1);
}

const C = {
  red: s => '\x1b[31m' + s + '\x1b[0m',
  yel: s => '\x1b[33m' + s + '\x1b[0m',
  grn: s => '\x1b[32m' + s + '\x1b[0m',
  dim: s => '\x1b[90m' + s + '\x1b[0m',
  bold: s => '\x1b[1m' + s + '\x1b[0m',
};

function report(level, title, detail, items) {
  if (level === 'ERR') errCount++;
  if (level === 'WARN') warnCount++;
  const tag = level === 'ERR' ? C.red('[문제]') : level === 'WARN' ? C.yel('[확인]') : C.grn('[정상]');
  console.log('\n' + tag + ' ' + C.bold(title));
  if (detail) console.log('       ' + detail);
  if (items && items.length) {
    items.slice(0, 15).forEach(x => console.log('       · ' + x));
    if (items.length > 15) console.log(C.dim('       … 외 ' + (items.length - 15) + '건'));
  }
  OUT.push({ level, title, detail, items: items || [] });
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function relativeKey(ref, baseDir) {
  const absolute = path.resolve(baseDir, ref);
  return path.relative(ROOT, absolute).replace(/\\/g, '/').toLowerCase();
}

// ─────────────────────────────────────────────
console.log(C.bold('\n게임 자가점검 — 파일 검사'));
console.log(C.dim('대상: ' + ROOT));

const files = walk(ROOT);
const htmlFiles = files.filter(f => f.toLowerCase().endsWith('.html'));
if (!htmlFiles.length) {
  console.log(C.red('\nHTML 파일을 찾지 못했습니다. 게임 폴더를 지정해 주세요.'));
  process.exit(1);
}

// 실제 파일 목록 (소문자 → 원본명)
const onDisk = new Map();
files.forEach(f => onDisk.set(path.relative(ROOT, f).replace(/\\/g, '/').toLowerCase(), path.relative(ROOT, f).replace(/\\/g, '/')));

for (const htmlPath of htmlFiles) {
  const rel = path.relative(ROOT, htmlPath).replace(/\\/g, '/');
  const src = fs.readFileSync(htmlPath, 'utf8');
  const analyzedSrc = src.replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, '');
  console.log('\n' + C.bold('━'.repeat(58)));
  console.log(C.bold('  ' + rel) + C.dim('  (' + Math.round(src.length / 1024) + 'KB)'));
  console.log(C.bold('━'.repeat(58)));

  // ── 1. 참조하는 파일이 실제로 있는가 (대소문자 포함) ──
  const refs = new Set();
  // src="...", href="..." 중 로컬 파일
  for (const m of analyzedSrc.matchAll(/(?:src|href)\s*=\s*["']([^"'#?]+)["']/g)) {
    const v = m[1].trim();
    if (!v || /^(https?:|data:|blob:|mailto:|javascript:|#|\/\/)/i.test(v)) continue;
    refs.add(v.replace(/^\.\//, ''));
  }
  // 코드 안에서 조립되는 파일명: "xxx.png" / 'xxx.mp3' 리터럴
  for (const m of analyzedSrc.matchAll(/["'`]([\w][\w .\-]*\.(?:png|jpe?g|gif|webp|svg|mp3|wav|m4a|ogg|json))["'`]/gi)) {
    refs.add(m[1].trim());
  }

  const missing = [], caseWrong = [];
  const htmlDir = path.dirname(htmlPath);
  for (const r of refs) {
    const key = relativeKey(r, htmlDir);
    if (onDisk.has(key)) {
      const actual = onDisk.get(key);
      if (actual !== r && path.basename(actual) !== path.basename(r)) continue;
      if (actual !== r) caseWrong.push(r + '  →  실제 파일: ' + actual);
    } else {
      missing.push(r);
    }
  }

  if (caseWrong.length) {
    report('ERR', '파일명 대소문자가 실제 파일과 다릅니다 (' + caseWrong.length + '건)',
      '윈도우·맥에서는 정상으로 보이지만 리눅스 서버(GitHub Pages 등)에 올리면 파일을 찾지 못합니다.', caseWrong);
  }
  if (missing.length) {
    report('WARN', '코드가 찾는 파일이 폴더에 없습니다 (' + missing.length + '건)',
      '코드에서 이름을 조합해 만드는 경우 정상일 수 있습니다. 목록을 보고 판단해 주세요.', missing);
  }
  if (!caseWrong.length && !missing.length) {
    report('OK', '참조하는 파일이 모두 존재합니다', '검사한 참조 ' + refs.size + '건');
  }

  // ── 2. 첫 로딩 용량 ──
  const b64 = [...src.matchAll(/data:([a-z/+.-]+);base64,([A-Za-z0-9+/=]{200,})/gi)];
  const b64Bytes = b64.reduce((n, m) => n + Math.floor(m[2].length * 3 / 4), 0);
  const eager = [];
  for (const m of src.matchAll(/<(audio|video|img)[^>]*>/gi)) {
    const tag = m[0];
    const s2 = (tag.match(/src\s*=\s*["']([^"']+)["']/) || [])[1];
    if (!s2 || /^data:/.test(s2)) continue;
    const isLazy = /loading\s*=\s*["']lazy/.test(tag) || /preload\s*=\s*["'](none|metadata)/.test(tag);
    if (!isLazy) {
      const f = onDisk.get(relativeKey(s2, htmlDir));
      if (f) eager.push({ name: s2, bytes: fs.statSync(path.join(ROOT, f)).size });
    }
  }
  // 같은 파일이 여러 번 나와도 실제로는 한 번만 받으므로 중복 제거
  const seenEager = new Set();
  const eagerUniq = eager.filter(e => (seenEager.has(e.name) ? false : seenEager.add(e.name)));
  eager.length = 0; eagerUniq.forEach(e => eager.push(e));
  const eagerBytes = eager.reduce((n, e) => n + e.bytes, 0);
  const first = src.length + eagerBytes;
  const kb = n => (n / 1024).toFixed(0) + 'KB';

  if (first > 3 * 1024 * 1024) {
    report('WARN', '첫 화면에서 받는 양이 ' + kb(first) + '입니다',
      '모바일 데이터에서 첫 로딩이 느릴 수 있습니다.',
      [
        'HTML 자체: ' + kb(src.length) + (b64Bytes ? '  (그중 파일 내장분 ' + kb(b64Bytes) + ', ' + Math.round(b64Bytes / src.length * 100) + '%)' : ''),
        ...eager.map(e => '즉시 내려받음: ' + e.name + '  ' + kb(e.bytes)),
      ]);
    if (b64Bytes > src.length * 0.5) {
      report('WARN', '파일 안에 내장된 이미지·소리가 전체의 ' + Math.round(b64Bytes / src.length * 100) + '%입니다',
        '밖으로 분리하면 용량이 줄고, 재방문 시 브라우저가 따로 저장해 두어 다시 받지 않습니다.');
    }
  } else {
    report('OK', '첫 로딩 용량 ' + kb(first), 'HTML ' + kb(src.length) + (eagerBytes ? ' + 즉시 내려받기 ' + kb(eagerBytes) : ''));
  }

  // ── 3. 외부 의존 ──
  const ext = new Set();
  // 태그 속성 / CSS @import / CSS url() / 코드 안의 주소 모두 확인
  for (const m of analyzedSrc.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"'\/]+)/gi)) ext.add(m[1]);
  for (const m of analyzedSrc.matchAll(/@import\s+url\(\s*["']?(https?:\/\/[^"')\/]+)/gi)) ext.add(m[1]);
  for (const m of analyzedSrc.matchAll(/url\(\s*["']?(https?:\/\/[^"')\/]+)/gi)) ext.add(m[1]);
  for (const m of analyzedSrc.matchAll(/["'`](https?:\/\/[^"'`\/]+)\/[^"'`]*["'`]/gi)) ext.add(m[1]);
  if (ext.size) {
    report('WARN', '외부 서버에서 받아오는 것이 있습니다 (' + ext.size + '곳)',
      '외부 접속이 막힌 학교망에서는 화면이 깨질 수 있습니다. 화면 전환이나 글꼴이 여기에 의존하면 특히 위험합니다.',
      [...ext]);
  } else {
    report('OK', '외부 의존 없음', '오프라인에서도 그대로 동작합니다.');
  }

  // ── 4. 타이머 정리 ──
  const setT = (analyzedSrc.match(/setTimeout\s*\(/g) || []).length;
  const setI = (analyzedSrc.match(/setInterval\s*\(/g) || []).length;
  const clrT = (analyzedSrc.match(/clearTimeout\s*\(/g) || []).length;
  const clrI = (analyzedSrc.match(/clearInterval\s*\(/g) || []).length;
  if (setT > 0 && clrT === 0) {
    report('WARN', 'setTimeout ' + setT + '곳을 쓰는데 clearTimeout이 한 번도 없습니다',
      '화면을 나가거나 게임을 다시 시작할 때 예약된 작업이 취소되지 않으면, 엉뚱한 화면에서 소리가 나거나 진행이 어긋날 수 있습니다.');
  } else {
    report('OK', '타이머 정리', 'setTimeout ' + setT + ' / clearTimeout ' + clrT + ' · setInterval ' + setI + ' / clearInterval ' + clrI);
  }

  // ── 5. 키보드 포커스 표시 ──
  const hasFocusStyle = /:focus(-visible)?\s*\{/.test(analyzedSrc);
  const killsOutline = /outline\s*:\s*(none|0)/.test(analyzedSrc) || /all\s*:\s*unset/.test(analyzedSrc);
  if (!hasFocusStyle) {
    report('WARN', '키보드로 이동할 때 어디가 선택됐는지 표시하는 스타일이 없습니다',
      (killsOutline ? '게다가 브라우저 기본 테두리를 지우는 설정이 있습니다. ' : '') +
      '키보드만 쓰는 사용자는 화면 변화 없이 조작하게 됩니다.');
  } else {
    report('OK', '키보드 포커스 표시 있음');
  }

  // ── 6. 음성 읽기 방어 ──
  if (/speechSynthesis/.test(analyzedSrc)) {
    const picksVoice = /getVoices\s*\(/.test(analyzedSrc);
    const waitsVoices = /voiceschanged/.test(analyzedSrc);
    const msgs = [];
    if (!picksVoice) msgs.push('영어 목소리를 직접 고르지 않습니다 (언어만 지정)');
    if (!waitsVoices) msgs.push('목소리 목록이 늦게 도착할 때 다시 시도하는 처리가 없습니다');
    if (msgs.length) {
      report('WARN', '기기 음성 읽기(TTS) 방어 처리가 부족합니다',
        '기기에 해당 언어 음성이 없으면 다른 언어 음성으로 읽힙니다. 소리 파일을 쓰는 경우에는 해당 없습니다.', msgs);
    } else {
      report('OK', '음성 읽기 방어 처리 있음');
    }
  }

  // ── 7. 코드로 조합하는 파일명 ──
  const EXT = /\.(png|jpe?g|gif|webp|svg|mp3|wav|m4a|ogg)$/i;
  const dynPat = [...analyzedSrc.matchAll(/`[^`\n]{0,60}\$\{[^}]{1,60}\}[^`\n]{0,30}\.(?:png|jpe?g|gif|webp|svg|mp3|wav|m4a|ogg)`/gi)]
    .map(m => m[0].slice(0, 72));
  if (dynPat.length) {
    const assets = files.map(f => path.basename(f)).filter(n => EXT.test(n));
    const upper = assets.filter(n => /[A-Z]/.test(n));
    const items = [...new Set(dynPat)];
    if (upper.length) {
      items.push('');
      items.push('대문자가 들어간 파일 ' + upper.length + '개 — 조합 결과와 어긋나기 쉽습니다: '
        + upper.slice(0, 6).join(', ') + (upper.length > 6 ? ' …' : ''));
    }
    report('WARN', '파일 이름을 코드에서 조합합니다',
      '데이터에 적힌 글자로 파일명을 만들고 있습니다. 데이터와 실제 파일명의 대소문자·띄어쓰기가 다르면 '
      + '윈도우·맥에서는 멀쩡히 보이지만 리눅스 서버(GitHub Pages 등)에서는 그림이 깨집니다. '
      + '내 컴퓨터에서는 절대 재현되지 않으니, 실제 서버에 올린 뒤 해당 화면을 꼭 확인해 주세요.', items);
  }

  // ── 8. 중복 id ──
  const ids = [...analyzedSrc.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map(m => m[1]);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dup.length) {
    report('ERR', '같은 id가 여러 번 쓰였습니다', 'id는 화면에서 하나만 있어야 합니다. 코드가 엉뚱한 요소를 집을 수 있습니다.', [...new Set(dup)]);
  }
}

// ─────────────────────────────────────────────
console.log('\n' + C.bold('━'.repeat(58)));
console.log(C.bold('  요약') + '   ' +
  (errCount ? C.red('문제 ' + errCount + '건') : C.grn('문제 없음')) + '   ' +
  (warnCount ? C.yel('확인 필요 ' + warnCount + '건') : ''));
console.log(C.bold('━'.repeat(58)));
console.log(C.dim('\n[문제] 는 배포 후 실제로 깨지는 것, [확인] 은 상황에 따라 문제가 되는 것입니다.'));
console.log(C.dim('게임을 실제로 조작하며 하는 검사는 probe.js 를 참고해 주세요.\n'));

if (process.env.JSON_OUT) fs.writeFileSync(process.env.JSON_OUT, JSON.stringify(OUT, null, 2));
