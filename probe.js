/* ============================================================
 *  게임 자가점검 — 조작 검사
 *
 *  1) 게임을 브라우저에서 엽니다
 *  2) F12 → Console 탭 → 이 파일 내용을 통째로 붙여넣고 Enter
 *  3) 게임을 평소처럼 해봅니다 (특히 중간에 나가기·다시 시작을 섞어서)
 *  4) Console 에  점검('2일차_1회차_이름')  처럼 라벨을 넣어서 치고 Enter
 *     → 결과가 콘솔에 뜨는 동시에 그 이름으로 json 파일이 자동 다운로드됩니다 (캡처 불필요)
 *
 *  게임 코드를 고칠 필요는 없습니다 — 새로고침하면 setTimeout 등을 가로챈 감시 코드
 *  자체는 사라지지만(그래서 3번을 다시 해야 합니다), 그 전까지 기록된 오류·의심스러운
 *  타이머·새로고침 횟수 같은 "증거"는 sessionStorage에 저장되어 새로고침 후에도
 *  이어집니다. 즉 체크리스트 중간에 새로고침이 여러 번 끼어도, 맨 마지막에 한 번
 *  점검()을 실행하면 그 전 구간에서 있었던 일까지 전부 포함된 json이 나옵니다.
 *  (같은 탭을 닫거나 새 탭에서 열면 완전히 새 세션으로 취급되어 초기화됩니다.)
 *
 *  외부 라이브러리를 쓰지 않습니다. 자유롭게 사용·수정·재배포하셔도 됩니다.
 *  판단 기준(개수 임계값 등)은 점검() 함수 안에서 조정하시면 됩니다.
 * ============================================================ */
(function () {
  if (window.__gameProbe) { console.log('%c이미 켜져 있습니다. 게임을 해보신 뒤 점검() 을 입력하세요.', 'color:#888'); return; }

  /* ── 세션 전체에 걸쳐 남는 기록 (새로고침해도 유지, 탭을 닫으면 초기화) ── */
  var STORE_KEY = '__gameProbeSession';
  var storageOK = true;
  function loadStore() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { storageOK = false; return null; }
  }
  function saveStore() {
    if (!storageOK) return;
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(store)); }
    catch (e) { storageOK = false; }
  }

  var store = loadStore();
  if (!store) {
    store = { startedAt: Date.now(), reloadCount: 0, errors: [], speaks: [], crossedTimers: [], unloadFindings: [] };
  } else {
    store.reloadCount = (store.reloadCount || 0) + 1;
  }
  saveStore();

  var P = window.__gameProbe = {
    timers: [], listeners: [],
    speaks: store.speaks, errors: store.errors, /* 세션 전체와 공유되는 배열(같은 참조) */
    loadStartedAt: Date.now(),
    startNodes: document.getElementsByTagName('*').length,
    bodyChildrenAtStart: document.body.children.length,
  };

  /* 지금 어떤 화면이 보이는지 — 게임마다 구조가 달라 최대한 일반적으로 판단 */
  function screenName() {
    var best = null, bestArea = 0;
    var cands = document.querySelectorAll('[id*="creen"],[class*="creen"],section,main,[id*="wrapper"]');
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      var r = el.getBoundingClientRect();
      var area = r.width * r.height;
      if (area > bestArea && area > 40000) { bestArea = area; best = el; }
    }
    if (!best) return '(알 수 없음)';
    return best.id || (best.className && String(best.className).split(' ')[0]) || best.tagName.toLowerCase();
  }

  function shortStack() {
    try { throw new Error(); } catch (e) {
      var lines = (e.stack || '').split('\n').slice(3, 5);
      return lines.map(function (l) { return l.trim().replace(/^at\s+/, '').slice(0, 70); }).join(' ← ');
    }
  }

  /* ── 타이머 감시 ── */
  var _sT = window.setTimeout, _cT = window.clearTimeout;
  var _sI = window.setInterval, _cI = window.clearInterval;

  function noteCrossed(rec) {
    /* 예약할 때의 화면과 실행될 때의 화면이 다르면, 새로고침으로 사라지기 전에
       바로 세션 기록에 남겨둔다 (나중에 필터링하는 방식은 새로고침을 못 버틴다) */
    store.crossedTimers.push({
      종류: rec.kind, '예약(ms)': rec.delay, '예약한 화면': rec.at, '실행된 화면': rec.firedAt,
      위치: rec.where, reloadIndex: store.reloadCount
    });
    saveStore();
  }

  window.setTimeout = function (fn, delay) {
    var rec = { kind: '한번', delay: delay || 0, at: screenName(), where: shortStack(), fired: false, cleared: false, firedAt: null };
    var args = Array.prototype.slice.call(arguments, 2);
    var id = _sT.call(window, function () {
      rec.fired = true; rec.firedAt = screenName();
      if (rec.at !== rec.firedAt) noteCrossed(rec);
      try { typeof fn === 'function' ? fn.apply(null, args) : eval(fn); }
      catch (e) { P.errors.push({ msg: String(e && e.message), where: rec.where, reloadIndex: store.reloadCount }); saveStore(); throw e; }
    }, delay);
    rec.id = id; P.timers.push(rec); return id;
  };
  window.clearTimeout = function (id) {
    for (var i = 0; i < P.timers.length; i++) if (P.timers[i].id === id) P.timers[i].cleared = true;
    return _cT.call(window, id);
  };
  window.setInterval = function (fn, delay) {
    var rec = { kind: '반복', delay: delay || 0, at: screenName(), where: shortStack(), fired: false, cleared: false, count: 0, firedAt: null };
    var id = _sI.call(window, function () {
      rec.fired = true; rec.count++; rec.firedAt = screenName();
      if (rec.at !== rec.firedAt) noteCrossed(rec);
      try { typeof fn === 'function' ? fn() : eval(fn); }
      catch (e) { P.errors.push({ msg: String(e && e.message), where: rec.where, reloadIndex: store.reloadCount }); saveStore(); throw e; }
    }, delay);
    rec.id = id; P.timers.push(rec); return id;
  };
  window.clearInterval = function (id) {
    for (var i = 0; i < P.timers.length; i++) if (P.timers[i].id === id) P.timers[i].cleared = true;
    return _cI.call(window, id);
  };

  /* ── 이벤트 리스너 감시 (새로고침 한 판 안에서만 의미 있는 값이라 세션 기록엔 안 넣음) ── */
  var _add = EventTarget.prototype.addEventListener;
  var _rem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opt) {
    try {
      var tag = this === window ? 'window' : this === document ? 'document'
        : (this.tagName ? this.tagName.toLowerCase() + (this.id ? '#' + this.id : '') : String(this));
      P.listeners.push({ type: type, target: tag, alive: true, at: screenName() });
    } catch (e) { }
    return _add.apply(this, arguments);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, opt) {
    try {
      var tag = this === window ? 'window' : this === document ? 'document'
        : (this.tagName ? this.tagName.toLowerCase() + (this.id ? '#' + this.id : '') : String(this));
      for (var i = P.listeners.length - 1; i >= 0; i--) {
        if (P.listeners[i].alive && P.listeners[i].type === type && P.listeners[i].target === tag) { P.listeners[i].alive = false; break; }
      }
    } catch (e) { }
    return _rem.apply(this, arguments);
  };

  /* ── 음성 읽기 감시 ── */
  if (window.speechSynthesis && window.speechSynthesis.speak) {
    var _spk = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = function (u) {
      P.speaks.push({ text: (u && u.text || '').slice(0, 40), lang: u && u.lang, voice: u && u.voice ? u.voice.name : '(지정 안 함)', at: screenName(), reloadIndex: store.reloadCount });
      saveStore();
      return _spk(u);
    };
  }

  /* ── 오류 감시 ── */
  window.addEventListener('error', function (e) { P.errors.push({ msg: e.message, where: (e.filename || '') + ':' + e.lineno, reloadIndex: store.reloadCount }); saveStore(); });
  window.addEventListener('unhandledrejection', function (e) { P.errors.push({ msg: '처리 안 된 오류: ' + e.reason, where: '', reloadIndex: store.reloadCount }); saveStore(); });

  /* ── 화면(DOM) 관련 검사 — 점검() 호출 시점과, 새로고침으로 사라지기 직전 시점 둘 다에 쓴다 ── */
  function computeLiveFindings() {
    var out = {};

    var liveIntervals = P.timers.filter(function (t) { return t.kind === '반복' && !t.cleared; });
    if (liveIntervals.length > 1) {
      out.liveIntervals = liveIntervals.map(function (t) { return { '주기(ms)': t.delay, '시작한 화면': t.at, 실행횟수: t.count, 위치: t.where }; });
    }

    var alive = P.listeners.filter(function (l) { return l.alive; });
    var byKey = {};
    alive.forEach(function (l) { var k = l.target + ' / ' + l.type; byKey[k] = (byKey[k] || 0) + 1; });
    var heavy = Object.keys(byKey).filter(function (k) { return byKey[k] >= 20; }).sort(function (a, b) { return byKey[b] - byKey[a]; });
    if (heavy.length) {
      out.heavyListeners = heavy.map(function (k) { return { 대상: k, 개수: byKey[k] }; });
    }

    var now = document.getElementsByTagName('*').length;
    var grow = now - P.startNodes;
    if (grow > 400) {
      out.nodeGrowth = { before: P.startNodes, after: now, grow: grow };
    }

    var leftovers = [];
    for (var i = 0; i < document.body.children.length; i++) {
      var el = document.body.children[i];
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      var cs = getComputedStyle(el);
      if ((cs.position === 'fixed' || cs.position === 'absolute') && cs.display !== 'none' && el.getBoundingClientRect().width > 0) {
        leftovers.push((el.tagName.toLowerCase()) + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
      }
    }
    var dupLeft = {};
    leftovers.forEach(function (x) { dupLeft[x] = (dupLeft[x] || 0) + 1; });
    var stacked = Object.keys(dupLeft).filter(function (k) { return dupLeft[k] > 1; });
    if (stacked.length) {
      out.domLeftovers = stacked.map(function (k) { return { 요소: k, 개수: dupLeft[k] }; });
    }

    return out;
  }

  /* 새로고침·닫기로 이 구간이 끝나기 직전, 그 순간의 스냅샷을 세션 기록에 남긴다.
     (반복 타이머·리스너 누적 같은 건 새로고침되면 브라우저가 알아서 정리해버려서,
      나중에 점검()을 불러도 이 구간에 있었던 문제는 더 이상 보이지 않기 때문) */
  window.addEventListener('beforeunload', function () {
    var f = computeLiveFindings();
    if (f.liveIntervals || f.heavyListeners || f.nodeGrowth || f.domLeftovers) {
      store.unloadFindings.push({
        reloadIndex: store.reloadCount,
        endedAt: Date.now(),
        minutesInSegment: Number(((Date.now() - P.loadStartedAt) / 60000).toFixed(1)),
        screenAtEnd: screenName(),
        liveIntervals: f.liveIntervals || null,
        heavyListeners: f.heavyListeners || null,
        nodeGrowth: f.nodeGrowth || null,
        domLeftovers: f.domLeftovers || null,
      });
      saveStore();
    }
  });

  /* ── 결과를 파일로 저장 (캡처 대신) ──
   *  점검('2일차_1회차_이름') 처럼 라벨을 넣으면 그 이름으로 json 파일이 저장됩니다.
   *  라벨을 안 넣으면 시각이 붙은 이름으로 저장됩니다. */
  function downloadJSON(obj, label) {
    var name = (label ? String(label).trim() : '') || ('probe-result-' + new Date().toISOString().replace(/[:.]/g, '-'));
    if (!/\.json$/i.test(name)) name += '.json';
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return name;
  }

  /* ── 결과 보고 ── */
  window.점검 = window.check = function (label) {
    var line = '━'.repeat(56);
    console.log('%c\n' + line + '\n  게임 자가점검 결과\n' + line, 'color:#6B4A7E;font-weight:bold');
    var sessionMins = ((Date.now() - store.startedAt) / 60000).toFixed(1);
    console.log('세션 전체 플레이 시간 ' + sessionMins + '분 (새로고침 ' + store.reloadCount + '회 포함) · 지금 화면: ' + screenName());
    if (!storageOK) {
      console.log('%c(주의: 이 브라우저/모드에서는 세션 기록 저장이 안 돼, 새로고침 이전 구간은 이번 결과에 빠져 있을 수 있습니다.)', 'color:#b8860b');
    }

    var problems = 0;
    var report = {
      sessionMinutes: Number(sessionMins), reloadCount: store.reloadCount,
      screenNow: screenName(), findings: [], previousSegments: store.unloadFindings
    };

    /* 1. 화면이 바뀐 뒤에 실행된 예약 (세션 전체 누적 — 새로고침 전 구간도 포함) */
    var crossed = store.crossedTimers;
    if (crossed.length) {
      problems++;
      console.log('%c\n[문제] 화면을 옮긴 뒤에도 예약된 작업이 실행됐습니다 (' + crossed.length + '건, 세션 전체)', 'color:#c0392b;font-weight:bold');
      console.log('       나간 화면에서 소리가 나거나, 다음 게임의 진행이 저절로 넘어갈 수 있습니다.');
      console.table(crossed.slice(0, 10));
      report.findings.push({ level: 'ERR', title: '화면을 옮긴 뒤에도 예약된 작업이 실행됨', count: crossed.length, items: crossed });
    }

    /* 2~5. 지금 이 구간(마지막 새로고침 이후)의 실시간 상태 */
    var live = computeLiveFindings();

    if (live.liveIntervals) {
      problems++;
      console.log('%c\n[문제] 취소되지 않은 반복 타이머가 ' + live.liveIntervals.length + '개 살아 있습니다', 'color:#c0392b;font-weight:bold');
      console.log('       게임을 다시 시작할 때마다 쌓이면 시간이 두 배로 빨리 흐르거나 느려집니다.');
      console.table(live.liveIntervals.slice(0, 10));
      report.findings.push({ level: 'ERR', title: '취소되지 않은 반복 타이머가 살아 있음', count: live.liveIntervals.length, items: live.liveIntervals });
    }

    if (live.heavyListeners) {
      problems++;
      console.log('%c\n[확인] 같은 곳에 이벤트가 계속 쌓이고 있습니다', 'color:#b8860b;font-weight:bold');
      console.log('       화면을 다시 그릴 때 이전 것을 정리하지 않으면 오래 쓸수록 느려집니다.');
      console.table(live.heavyListeners.slice(0, 8));
      report.findings.push({ level: 'WARN', title: '같은 곳에 이벤트가 계속 쌓이고 있음', count: live.heavyListeners.length, items: live.heavyListeners });
    }

    if (live.nodeGrowth) {
      problems++;
      console.log('%c\n[확인] 화면 요소가 ' + live.nodeGrowth.before + '개 → ' + live.nodeGrowth.after + '개로 늘었습니다 (+' + live.nodeGrowth.grow + ')', 'color:#b8860b;font-weight:bold');
      console.log('       지운 줄 알았던 것이 화면 밖에 남아 있을 수 있습니다.');
      report.findings.push({ level: 'WARN', title: '화면 요소 수 증가', before: live.nodeGrowth.before, after: live.nodeGrowth.after, grow: live.nodeGrowth.grow });
    }

    if (live.domLeftovers) {
      problems++;
      console.log('%c\n[문제] 같은 것이 화면에 여러 개 겹쳐 있습니다', 'color:#c0392b;font-weight:bold');
      console.log('       손을 뗀 뒤에도 사라지지 않는 잔상일 수 있습니다.');
      console.table(live.domLeftovers);
      report.findings.push({ level: 'ERR', title: '같은 것이 화면에 여러 개 겹쳐 있음', items: live.domLeftovers });
    }

    /* 6. 음성 (세션 전체 누적) */
    if (P.speaks.length) {
      var noVoice = P.speaks.filter(function (s) { return s.voice === '(지정 안 함)'; });
      console.log('%c\n[정보] 음성 읽기 ' + P.speaks.length + '회 (세션 전체)', 'color:#2E6B52;font-weight:bold');
      if (noVoice.length) {
        console.log('       그중 ' + noVoice.length + '회는 목소리를 직접 고르지 않았습니다 — 기기에 영어 음성이 없으면 다른 언어로 읽힙니다.');
      }
      var offScreen = P.speaks.filter(function (s) { return /intro|cover|title|difficulty|category|result/i.test(s.at); });
      if (offScreen.length) {
        problems++;
        console.log('%c       [문제] 게임 화면이 아닌 곳에서 ' + offScreen.length + '회 소리가 났습니다: '
          + offScreen.map(function (s) { return s.at; }).join(', '), 'color:#c0392b');
        report.findings.push({ level: 'ERR', title: '게임 화면이 아닌 곳에서 음성이 재생됨', screens: offScreen.map(function (s) { return s.at; }) });
      }
      var speakRows = P.speaks.slice(-8).map(function (s) { return { 문장: s.text, 언어: s.lang, 목소리: s.voice, 화면: s.at }; });
      console.table(speakRows);
      report.findings.push({ level: 'INFO', title: '음성 읽기 횟수', count: P.speaks.length, noVoiceCount: noVoice.length, recent: speakRows });
    }

    /* 7. 오류 (세션 전체 누적) */
    if (P.errors.length) {
      problems++;
      console.log('%c\n[문제] 실행 중 오류 ' + P.errors.length + '건 (세션 전체)', 'color:#c0392b;font-weight:bold');
      var errorRows = P.errors.slice(0, 10);
      console.table(errorRows);
      report.findings.push({ level: 'ERR', title: '실행 중 오류', count: P.errors.length, items: errorRows });
    }

    /* 8. 이전 새로고침 구간에서 발견된 것 (지금은 이미 사라졌지만, 그때 스냅샷 찍어둔 것) */
    if (store.unloadFindings.length) {
      console.log('%c\n[정보] 이전 새로고침 구간 ' + store.unloadFindings.length + '개에서 남겨진 기록', 'color:#2E6B52;font-weight:bold');
      store.unloadFindings.forEach(function (seg, idx) {
        var segProblems = (seg.liveIntervals ? 1 : 0) + (seg.domLeftovers ? 1 : 0);
        if (segProblems) problems += segProblems;
        console.log('  구간 ' + (idx + 1) + ' (' + seg.minutesInSegment + '분간 진행 후 새로고침으로 종료 · 종료 시점 화면: ' + seg.screenAtEnd + ')'
          + (segProblems ? ' — [문제] 있음, 아래 참고' : ''));
        if (seg.liveIntervals) console.table(seg.liveIntervals);
        if (seg.domLeftovers) console.table(seg.domLeftovers);
      });
    }

    console.log('%c\n' + line, 'color:#6B4A7E');
    if (!problems) {
      console.log('%c  발견된 문제 없음 — 다른 경로로도 해보시면 좋습니다.', 'color:#2E6B52;font-weight:bold');
      console.log('  (정답 직후 나가기 / 기회를 다 쓰고 나가기 / 팝업을 X로 닫기 / 게임 중간에 다시 시작)');
    } else {
      console.log('%c  살펴볼 것 ' + problems + '가지', 'color:#c0392b;font-weight:bold');
    }
    console.log('%c' + line + '\n', 'color:#6B4A7E');

    report.problemCount = problems;
    var savedAs = downloadJSON(report, label);
    console.log('%c파일로 저장됨: ' + savedAs + '  (캡처 대신 이 파일을 올리면 됩니다)', 'color:#6B4A7E');

    return '점검 완료 — ' + savedAs;
  };

  console.log('%c게임 자가점검이 켜졌습니다.' + (store.reloadCount ? ' (이번 세션 새로고침 ' + store.reloadCount + '회째)' : ''), 'color:#6B4A7E;font-weight:bold;font-size:14px');
  console.log('%c게임을 평소처럼 해보신 뒤,  점검(\'2일차_1회차_이름\')  처럼 라벨을 넣어서 입력하세요.', 'color:#555');
  console.log('%c결과가 콘솔에 뜨는 동시에 그 이름으로 json 파일이 자동 다운로드됩니다 — 캡처할 필요 없습니다.', 'color:#555');
  console.log('%c새로고침 항목을 하고 나면 이 코드를 다시 붙여넣어야 그 이후가 계속 감시됩니다 — 단, 그 전까지의 기록은 사라지지 않고 마지막 점검() 결과에 자동으로 합쳐집니다.', 'color:#888');
  console.log('%c특히 이런 경로를 섞어 보세요 — 정답 직후 나가기 / 기회를 다 쓰고 나가기 / 팝업을 X로 닫기 / 중간에 다시 시작', 'color:#888');
})();
