/* =====================================================================
   공통 상단바 (이미지 원형 버튼) + 카드형 무대 (7종 공용)
   사용법:  기존 상단바 버튼 마크업 바로 뒤에
            <script src="topnav.js" data-backdrop="표지그림.jpg"></script>
            게임의 화면 맞춤 함수에서       scale = TopNav.fit(무대요소, 설계폭, 설계높이);

   화면 구성 (전부 가운데 정렬)
       ┌ 여백 ─────────────────────────┐
       │  [ 상단바 (7종 같은 크기)  ]  │
       │   틈                           │
       │  [      게임 카드             ] │
       └ 여백 ─────────────────────────┘
   - 상단바 비율 13.6571:1, 게임 카드는 설계 비율 그대로 — 둘 다 절대 늘어나거나 잘리지 않는다
   - 상단바 자리·크기와 카드 높이는 7종 모두 같다 (16:9 카드 기준). 카드 폭만 게임 비율대로
   - 아래 여유 = 창 높이의 8%
   - 여백 = 창의 짧은 변 × 1.2% (6~14px). 틈 = 여백의 절반 (최소 4px)

   하는 일
   1. 기존 상단바 버튼 7개(처음으로·뒤로·앞으로 / How to Play·효과음·배경음악·전체화면)를
      순서대로 찾아 #top-nav-bar 위로 옮긴다. 버튼 자체를 옮기므로 기존 동작이 그대로 산다.
   2. 게임이 버튼을 disabled / opacity<1 로 만들면 흐린 막을, 효과음·배경음악 아이콘이
      fa-*-slash / fa-*-xmark 로 바뀌면 빗금을 자동으로 그린다.
   3. TopNav.fit() 이 상단바와 게임 카드의 자리·크기를 한 번에 잡고 무대 배율을 돌려준다.
      무대가 없는(반응형) 화면에서는 상단바만 놓고, 내용이 비워 둘 위쪽 높이를
      CSS 변수 --tn-space 로 알려 준다.
   ===================================================================== */
(function () {
  var script = document.currentScript;
  var K = 1 / 13.6571, MAX_BAR_W = 1912;

  // ── 1. 버튼 7개 찾아 옮기기 (기존 묶음은 게임마다 모양이 달라 세 곳을 차례로 본다)
  var bar = document.getElementById('top-nav-bar');
  var groups = [];
  if (bar) groups = [bar];
  else {
    ['nav-left-group', 'nav-right-group'].forEach(function (id) {
      var g = document.getElementById(id); if (g) groups.push(g);
    });
    bar = document.createElement('div');
    bar.id = 'top-nav-bar';
    document.body.appendChild(bar);
  }
  var btns = [];
  groups.forEach(function (g) {
    Array.prototype.forEach.call(g.querySelectorAll('button'), function (b) { btns.push(b); });
  });
  if (btns.length !== 7) console.warn('[상단바] 버튼이 7개가 아닙니다:', btns.length);
  bar.removeAttribute('style');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', '게임 네비게이션');
  btns.forEach(function (b, i) { b.classList.add('tn-btn', 'tn-' + (i + 1)); bar.appendChild(b); });
  Array.prototype.slice.call(bar.children).forEach(function (el) { if (el.tagName !== 'BUTTON') el.remove(); });
  groups.forEach(function (g) { if (g !== bar) g.remove(); });

  // ── 2. 상태 반영 — 흐린 막 / 빗금
  function syncBtn(b) {
    var op = parseFloat(b.style.opacity);
    var dim = b.disabled || b.getAttribute('aria-disabled') === 'true' || (!isNaN(op) && op < 1);
    b.classList.toggle('tn-dim', !!dim);
    var icon = b.querySelector('i');
    var muted = !!icon && /-(slash|xmark)\b/.test(icon.className);
    b.classList.toggle('tn-muted', muted && (b === btns[4] || b === btns[5]));
  }
  var btnObs = new MutationObserver(function (list) {
    list.forEach(function (m) { var b = m.target.closest ? m.target.closest('.tn-btn') : null; if (b) syncBtn(b); });
  });
  btns.forEach(function (b) {
    syncBtn(b);
    btnObs.observe(b, { attributes: true, subtree: true, childList: true, attributeFilter: ['class', 'style', 'disabled', 'aria-disabled'] });
  });

  // ── 배경: 표지 그림을 흐리게 깔고, 그림을 불러오기 전에는 표지 평균색을 옅게 편 단색
  var bd = document.createElement('div');
  bd.id = 'tn-backdrop';
  document.body.insertBefore(bd, document.body.firstChild);
  var bdSrc = script && script.getAttribute('data-backdrop');
  if (bdSrc) {
    bd.style.setProperty('--tn-bd-img', 'url("' + bdSrc + '")');
    var img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement('canvas'); c.width = c.height = 8;
        var x = c.getContext('2d'); x.drawImage(img, 0, 0, 8, 8);
        var d = x.getImageData(0, 0, 8, 8).data, r = 0, g = 0, b = 0;
        for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        var n = d.length / 4, mix = function (v) { return Math.round(v / n * 0.45 + 255 * 0.55); };
        bd.style.setProperty('--tn-bd-color', 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')');
      } catch (e) {}
    };
    img.src = bdSrc;
  }

  // ── 3. 배치
  // 여백 = 창 짧은 변의 1.2% (6~14px) — 게임 화면을 최대한 크게, 가장자리에 붙지 않을 만큼만
  function gutter(W, H) { return Math.max(6, Math.min(14, Math.min(W, H) * 0.012)); }
  // 아래 여유 = 창 높이의 8% — 게임 화면이 바닥에 붙어 보이지 않게 (7종 공통). 게임별로 바꾸려면 <script data-bottom="N"> (시험: 주소 뒤 ?bottom=N)
  var bottomPct = parseFloat((location.search.match(/[?&]bottom=([\d.]+)/) || [])[1]);
  if (isNaN(bottomPct)) bottomPct = parseFloat(script && script.getAttribute('data-bottom'));
  if (isNaN(bottomPct)) bottomPct = 8;
  function bottomRoom(H) { return H * bottomPct / 100; }
  function placeBar(left, top, w) {
    var h = w * K;
    bar.style.left = left + 'px'; bar.style.top = top + 'px';
    bar.style.width = w + 'px'; bar.style.height = h + 'px';
    bar.style.setProperty('--tn-bar-w', w + 'px');
    return h;
  }
  var current = null;   // 지금 맞춰 둔 무대 {el, w, h}

  /** 기준 배치 — 7종 공통. 16:9 카드(1280×720 + 흰 테두리)를 창에 넣었을 때의
      상단바 자리·크기와 카드 높이. 모든 게임이 이 상단바와 이 카드 높이를 그대로 쓴다
      (게임마다 화면 비율이 달라도 버튼 크기·위치와 카드 높이는 같게) */
  function refLayout(W, H) {
    var g = gutter(W, H), gap = Math.max(4, g * 0.5), R = bottomRoom(H), ow = 1280 + 12, oh = 720 + 12;
    var s = Math.min((W - 2 * g) / ow, (H - R - 2 * g - gap) / (K * ow + oh));
    var w = Math.min(s * ow, MAX_BAR_W), h = w * K, cardH = s * oh;
    return { g: g, gap: gap, w: w, h: h, cardH: cardH, top0: (H - R - (h + gap + cardH)) / 2 };
  }

  /** 무대를 카드로 놓고 그 위에 상단바를 붙인다. 무대 배율을 돌려준다
      카드 높이는 기준 높이와 같게, 폭은 게임 비율대로 (창 폭이 모자라면 폭에 맞춰 줄인다)
      opts.bare   : true 면 액자(흰 테두리·그림자)를 두르지 않는다 — 무대 안에 자체 카드가 있는 게임용
      opts.insetX : 무대 좌우에서 이만큼(설계 px)은 투명한 자리 — 창 폭 검사에서 뺀다 */
  function fit(stage, dw, dh, opts) {
    opts = opts || {};
    var W = window.innerWidth, H = window.innerHeight, L = refLayout(W, H);
    var ring = opts.bare ? 0 : 6, ix = opts.insetX || 0;           // ring = 카드 흰 테두리(설계 px)
    var ow = dw - 2 * ix + 2 * ring, oh = dh + 2 * ring;
    var s = Math.min(L.cardH / oh, (W - 2 * L.g) / ow);
    placeBar((W - L.w) / 2, L.top0, L.w);
    stage.classList.toggle('tn-card', !opts.bare);
    stage.classList.toggle('tn-bare', !!opts.bare);
    stage.style.left = (W / 2) + 'px';
    stage.style.top = (L.top0 + L.h + L.gap + s * oh / 2) + 'px';
    stage.style.transformOrigin = 'center center';
    stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
    current = { el: stage, w: dw, h: dh };
    document.documentElement.style.setProperty('--tn-space', (L.top0 + L.h + L.gap) + 'px');
    return s;
  }
  /** 무대 없이(반응형 화면) 상단바만 놓는다 — 카드가 있을 때와 같은 자리·크기로.
      내용은 --tn-space 아래에서 시작 */
  function release() {
    current = null;
    var L = refLayout(window.innerWidth, window.innerHeight);
    placeBar((window.innerWidth - L.w) / 2, L.top0, L.w);
    document.documentElement.style.setProperty('--tn-space', (L.top0 + L.h + L.gap) + 'px');
  }
  window.addEventListener('resize', function () { if (!current) release(); });

  window.TopNav = { fit: fit, release: release, buttons: btns, bar: bar };
  release();
})();
