/**
 * 통분 연결킹 게임 모듈 v2
 * ─ 화면에 맞게 자동으로 커지는 큰 보드
 * ─ 같은 분모가 다른 쌍에 겹치지 않도록 보드 생성 (혼동 방지)
 * ─ 새 판 생성 시 진행 중 드래그 강제 취소 (타이밍 버그 방지)
 * ─ pairId + 교차곱(수학) 이중 검증으로 짝 오류 원천 차단
 * ─ 보드 크기 비례 점 크기 / 선 두께 / 충돌 반경 자동 조정
 */
(function () {
  'use strict';

  /* ── 상태 ── */
  let cfg          = null;
  let paths        = [];
  let connectedCnt = 0;
  let activeDrags  = {};
  let hitRadius    = 32;
  let resizeObs    = null;

  const BOARD_CLR = '#22d3ee';
  const PAIRS     = 4;

  /* ── 분수 풀 ── */
  const POOL = [
    [{n:1,d:2},{n:2,d:4},{n:3,d:6},{n:4,d:8},{n:5,d:10}],
    [{n:1,d:3},{n:2,d:6},{n:3,d:9},{n:4,d:12}],
    [{n:2,d:3},{n:4,d:6},{n:6,d:9},{n:8,d:12},{n:10,d:15}],
    [{n:1,d:4},{n:2,d:8},{n:3,d:12}],
    [{n:3,d:4},{n:6,d:8},{n:9,d:12}],
    [{n:1,d:5},{n:2,d:10},{n:3,d:15}],
    [{n:2,d:5},{n:4,d:10},{n:6,d:15}],
    [{n:3,d:5},{n:6,d:10},{n:9,d:15}],
    [{n:4,d:5},{n:8,d:10},{n:12,d:15}],
    [{n:1,d:6},{n:2,d:12}],
    [{n:5,d:6},{n:10,d:12}],
    [{n:1,d:7},{n:2,d:14}],
    [{n:2,d:7},{n:4,d:14}],
    [{n:3,d:7},{n:6,d:14}],
    [{n:1,d:8},{n:2,d:16}],
    [{n:3,d:8},{n:6,d:16}],
    [{n:1,d:9},{n:2,d:18}],
    [{n:2,d:9},{n:4,d:18}],
    [{n:4,d:9},{n:8,d:18}],
  ];

  /* ════════════════════════════
     PUBLIC INTERFACE
  ════════════════════════════ */
  window.TongbunGame = {

    init(config) {
      cfg = config;
      paths = [];
      connectedCnt = 0;
      activeDrags = {};

      _injectStyles();

      const board = cfg.boardEl;
      const wrap  = board.parentElement;

      // 게임판 영역을 최대한 넓게 사용
      wrap.style.cssText = `
        flex: 1;
        padding: 6px;
        min-height: 0;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      board.style.cssText = `
        position: relative;
        background: rgba(0,0,0,.2);
        border-radius: 18px;
        box-shadow: inset 0 0 20px rgba(0,0,0,.4);
        touch-action: none;
        overflow: hidden;
      `;

      // 화면 전환 직후 크기 계산이 틀어지는 것을 막기 위해 2번 rAF
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          _sizeBoard();
          _generateBoard();
        });
      });

      // 일부 브라우저에서 레이아웃이 늦게 잡히는 경우 보정
      setTimeout(_sizeBoard, 120);
      setTimeout(_sizeBoard, 400);

      // board-wrap 크기가 바뀌면 자동 재계산
      if (typeof ResizeObserver !== 'undefined') {
        resizeObs = new ResizeObserver(() => {
          requestAnimationFrame(_sizeBoard);
        });
        resizeObs.observe(wrap);
      }

      window.addEventListener('resize', _onResize);
    },

    resetBoard() {
      _cancelAllDrags();
      paths.forEach(p => p.pathEl?.parentNode?.removeChild(p.pathEl));
      paths = [];
      connectedCnt = 0;

      cfg.dotsEl.querySelectorAll('.tb-dot')
        .forEach(d => d.classList.remove('tb-connected', 'tb-active', 'tb-wrong'));
    },

    destroy() {
      window.removeEventListener('resize', _onResize);

      if (resizeObs) {
        resizeObs.disconnect();
        resizeObs = null;
      }

      _cancelAllDrags();

      const board = cfg?.boardEl;
      const wrap  = board?.parentElement;

      if (board) {
        board.onpointerdown   = null;
        board.onpointermove   = null;
        board.onpointerup     = null;
        board.onpointercancel = null;
        board.style.cssText = '';
      }

      if (wrap) {
        wrap.style.cssText = '';
      }

      paths = [];
      cfg = null;
    },
  };

  /* ════════════════════════════
     RESIZE
  ════════════════════════════ */
  function _onResize() {
    _sizeBoard();
  }

  /* ════════════════════════════
     BOARD SIZING
  ════════════════════════════ */
  function _sizeBoard() {
    if (!cfg?.boardEl) return;

    const wrap = cfg.boardEl.parentElement;
    const rect = wrap.getBoundingClientRect();

    // 화면 전환 직후 wrap 높이가 0 또는 너무 작게 잡히는 경우 대비
    const measuredW = rect.width  || wrap.clientWidth;
    const measuredH = rect.height || wrap.clientHeight;

    const fallbackW = window.innerWidth  - 16;
    const fallbackH = window.innerHeight - 140;

    const availW = Math.max(
      320,
      (measuredW > 320 ? measuredW : fallbackW) - 12
    );

    const availH = Math.max(
      320,
      (measuredH > 320 ? measuredH : fallbackH) - 12
    );

    // 정사각형 보드: 화면에 들어가는 최대 크기
    const size = Math.floor(Math.min(availW, availH));

    cfg.boardEl.style.width  = size + 'px';
    cfg.boardEl.style.height = size + 'px';

    const ds = _dotPx(size);
    cfg.boardEl.style.setProperty('--tb-dot', ds + 'px');
    cfg.boardEl.style.setProperty('--tb-fs',  Math.min(1.9, ds / 46) + 'rem');
    cfg.boardEl.style.setProperty('--tb-sw',  Math.max(6, Math.round(ds * 0.12)) + 'px');

    hitRadius = Math.round(ds * 0.58);
  }

  function _dotPx(boardPx) {
    if (boardPx >= 900) return 96;
    if (boardPx >= 750) return 88;
    if (boardPx >= 600) return 80;
    if (boardPx >= 480) return 70;
    if (boardPx >= 360) return 60;
    if (boardPx >= 280) return 50;
    return 44;
  }

  /* ════════════════════════════
     CANCEL ALL DRAGS
  ════════════════════════════ */
  function _cancelAllDrags() {
    for (const pid in activeDrags) {
      const d = activeDrags[pid];
      try {
        d.startEl?.releasePointerCapture(parseInt(pid));
      } catch (_) {}

      d.startEl?.classList.remove('tb-active');
      d.pathEl?.parentNode?.removeChild(d.pathEl);
    }

    activeDrags = {};
  }

  /* ════════════════════════════
     BOARD GENERATION
  ════════════════════════════ */
  function _generateBoard() {
    _cancelAllDrags();

    cfg.dotsEl.innerHTML = '';
    cfg.svgEl.innerHTML  = '';

    paths        = [];
    connectedCnt = 0;

    cfg.onBoardStart();

    // 혼동 없는 분수 조합이 나올 때까지 재시도
    let fracs;
    let tries = 0;

    do {
      fracs = _pickFracs();
      tries++;
    } while (tries < 40 && _isConfusing(fracs));

    fracs.sort(() => Math.random() - 0.5);

    // 4×3 그리드에서 8칸 선택
    let cells = [];

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        cells.push({ r, c });
      }
    }

    cells.sort(() => Math.random() - 0.5);
    cells = cells.slice(0, 8);

    cells.forEach((cell, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'tb-wrapper';

      const jx = (Math.random() - 0.5) * 10;
      const jy = (Math.random() - 0.5) * 10;

      wrap.style.left = `${cell.c * 35 + 14 + jx}%`;
      wrap.style.top  = `${cell.r * 23 + 14 + jy}%`;

      const btn = document.createElement('div');
      btn.className      = 'tb-dot';
      btn.dataset.pairId = fracs[i].pairId;
      btn.dataset.id     = i;
      btn.dataset.n      = fracs[i].n;
      btn.dataset.d      = fracs[i].d;

      btn.innerHTML = `
        <div class="tb-frac">
          <div class="tb-top">${fracs[i].n}</div>
          <div class="tb-bot">${fracs[i].d}</div>
        </div>
      `;

      wrap.appendChild(btn);
      cfg.dotsEl.appendChild(wrap);
    });

    cfg.boardEl.onpointerdown   = _onDown;
    cfg.boardEl.onpointermove   = _onMove;
    cfg.boardEl.onpointerup     = _onUp;
    cfg.boardEl.onpointercancel = _onUp;
  }

  function _pickFracs() {
    const groups = [...POOL].sort(() => Math.random() - 0.5).slice(0, PAIRS);
    const fracs  = [];

    groups.forEach((g, pairId) => {
      const pair = [...g].sort(() => Math.random() - 0.5).slice(0, 2);
      fracs.push({ ...pair[0], pairId }, { ...pair[1], pairId });
    });

    return fracs;
  }

  /**
   * 혼동 감지
   * (1) 다른 쌍끼리 분모가 같으면 학생이 헷갈림
   * (2) 완전히 동일한 분수가 두 번 등장하면 안 됨
   */
  function _isConfusing(fracs) {
    const denomMap = {};
    const seen     = new Set();

    for (const f of fracs) {
      const key = `${f.n}/${f.d}`;

      if (seen.has(key)) return true;
      seen.add(key);

      if (denomMap[f.d] !== undefined && denomMap[f.d] !== f.pairId) {
        return true;
      }

      denomMap[f.d] = f.pairId;
    }

    return false;
  }

  /* ════════════════════════════
     POINTER DOWN
  ════════════════════════════ */
  function _onDown(e) {
    if (!cfg.isActive()) return;

    const btn = e.target.closest('.tb-dot');

    if (!btn || btn.classList.contains('tb-connected')) return;

    e.preventDefault();

    const bRect = cfg.boardEl.getBoundingClientRect();
    const r = btn.getBoundingClientRect();

    const sx = r.left + r.width  / 2 - bRect.left;
    const sy = r.top  + r.height / 2 - bRect.top;

    const dots = [];

    cfg.dotsEl.querySelectorAll('.tb-dot').forEach(node => {
      const nr = node.getBoundingClientRect();

      dots.push({
        id:        node.dataset.id,
        pairId:    node.dataset.pairId,
        n:         parseInt(node.dataset.n),
        d:         parseInt(node.dataset.d),
        x:         nr.left + nr.width  / 2 - bRect.left,
        y:         nr.top  + nr.height / 2 - bRect.top,
        connected: node.classList.contains('tb-connected'),
        el:        node,
      });
    });

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    path.setAttribute('d', `M ${sx} ${sy}`);
    path.classList.add('tb-drag');
    path.setAttribute('stroke', BOARD_CLR);

    cfg.svgEl.appendChild(path);

    btn.classList.add('tb-active');
    window.KM?.snd('click');

    activeDrags[e.pointerId] = {
      startEl:     btn,
      startId:     btn.dataset.id,
      startPairId: btn.dataset.pairId,
      startN:      parseInt(btn.dataset.n),
      startD:      parseInt(btn.dataset.d),
      pathEl:      path,
      points:      [{ x: sx, y: sy }],
      bRect,
      dots,
      done: false,
    };

    btn.setPointerCapture(e.pointerId);
  }

  /* ════════════════════════════
     POINTER MOVE
  ════════════════════════════ */
  function _onMove(e) {
    const drag = activeDrags[e.pointerId];

    if (!drag || drag.done) return;

    e.preventDefault();

    const cx = e.clientX - drag.bRect.left;
    const cy = e.clientY - drag.bRect.top;

    const p1 = drag.points[drag.points.length - 1];
    const p2 = { x: cx, y: cy };

    // ① 보드 이탈
    if (cx < 0 || cy < 0 || cx > drag.bRect.width || cy > drag.bRect.height) {
      _fail(drag, e.pointerId);
      return;
    }

    // ② 기존 선 교차
    for (const seg of paths) {
      for (let i = 0; i < seg.points.length - 1; i++) {
        if (_intersect(p1, p2, seg.points[i], seg.points[i + 1])) {
          _fail(drag, e.pointerId);
          return;
        }
      }
    }

    // ③ 점 충돌
    for (const dot of drag.dots) {
      if (dot.id === drag.startId) continue;

      if (_ptSegDist(dot, p1, p2) < hitRadius) {
        const samePair = drag.startPairId === dot.pairId;
        const mathOK   = drag.startN * dot.d === dot.n * drag.startD;

        if (!dot.connected && samePair && mathOK) {
          _complete(drag, dot.el, e.pointerId);
        } else {
          _fail(drag, e.pointerId);
        }

        return;
      }
    }

    drag.points.push(p2);
    drag.pathEl.setAttribute('d', drag.pathEl.getAttribute('d') + ` L ${cx} ${cy}`);
  }

  /* ════════════════════════════
     POINTER UP
  ════════════════════════════ */
  function _onUp(e) {
    const drag = activeDrags[e.pointerId];

    if (!drag) return;

    e.preventDefault();

    if (!drag.done) {
      drag.pathEl?.parentNode?.removeChild(drag.pathEl);
      drag.startEl.classList.remove('tb-active');
    }

    try {
      drag.startEl.releasePointerCapture(e.pointerId);
    } catch (_) {}

    delete activeDrags[e.pointerId];
  }

  /* ════════════════════════════
     FAIL
  ════════════════════════════ */
  function _fail(drag, pid) {
    drag.done = true;

    try {
      drag.startEl?.releasePointerCapture(pid);
    } catch (_) {}

    drag.startEl?.classList.remove('tb-active');
    drag.startEl?.classList.add('tb-wrong');

    setTimeout(() => {
      drag.startEl?.classList.remove('tb-wrong');
    }, 300);

    if (drag.pathEl) {
      drag.pathEl.setAttribute('stroke', '#f87171');

      setTimeout(() => {
        drag.pathEl?.parentNode?.removeChild(drag.pathEl);
      }, 200);
    }

    const b = cfg.boardEl;

    b.classList.remove('tb-shake');
    void b.offsetWidth;
    b.classList.add('tb-shake');

    setTimeout(() => {
      b.classList.remove('tb-shake');
    }, 400);

    cfg.onWrong();

    delete activeDrags[pid];
  }

  /* ════════════════════════════
     COMPLETE
  ════════════════════════════ */
  function _complete(drag, targetEl, pid) {
    drag.done = true;

    try {
      drag.startEl?.releasePointerCapture(pid);
    } catch (_) {}

    const tr   = targetEl.getBoundingClientRect();
    const endX = tr.left + tr.width  / 2 - drag.bRect.left;
    const endY = tr.top  + tr.height / 2 - drag.bRect.top;

    drag.points.push({ x: endX, y: endY });

    drag.pathEl.setAttribute('d', drag.pathEl.getAttribute('d') + ` L ${endX} ${endY}`);
    drag.pathEl.classList.replace('tb-drag', 'tb-result');
    drag.pathEl.setAttribute('stroke', BOARD_CLR);

    drag.startEl.classList.replace('tb-active', 'tb-connected');
    targetEl.classList.add('tb-connected');

    const gained = cfg.onCorrect();

    const seg = {
      startId: drag.startId,
      endId: targetEl.dataset.id,
      points: [...drag.points],
      pathEl: drag.pathEl,
      scoreGained: gained,
    };

    paths.push(seg);

    drag.pathEl.addEventListener('pointerdown', ev => _undo(ev, seg));

    connectedCnt++;

    if (connectedCnt >= PAIRS) {
      setTimeout(_generateBoard, 500);
    }

    delete activeDrags[pid];
  }

  /* ════════════════════════════
     UNDO
  ════════════════════════════ */
  function _undo(e, seg) {
    e.stopPropagation();

    if (!cfg?.isActive()) return;

    paths = paths.filter(p => p !== seg);

    seg.pathEl?.parentNode?.removeChild(seg.pathEl);

    cfg.dotsEl
      .querySelector(`.tb-dot[data-id="${seg.startId}"]`)
      ?.classList.remove('tb-connected');

    cfg.dotsEl
      .querySelector(`.tb-dot[data-id="${seg.endId}"]`)
      ?.classList.remove('tb-connected');

    connectedCnt = Math.max(0, connectedCnt - 1);

    cfg.onUndo(seg.scoreGained);
  }

  /* ════════════════════════════
     COLLISION MATH
  ════════════════════════════ */
  function _d2(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  }

  function _ptSegDist(p, v, w) {
    const l2 = _d2(v, w);

    if (l2 === 0) {
      return Math.sqrt(_d2(p, v));
    }

    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;

    t = Math.max(0, Math.min(1, t));

    return Math.sqrt(_d2(p, {
      x: v.x + t * (w.x - v.x),
      y: v.y + t * (w.y - v.y),
    }));
  }

  function _ccw(A, B, C) {
    return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
  }

  function _intersect(A, B, C, D) {
    return _ccw(A, C, D) !== _ccw(B, C, D) &&
           _ccw(A, B, C) !== _ccw(A, B, D);
  }

  /* ════════════════════════════
     STYLES
  ════════════════════════════ */
  function _injectStyles() {
    if (document.getElementById('tb-styles')) return;

    const s = document.createElement('style');
    s.id = 'tb-styles';

    s.textContent = `
      .tb-wrapper {
        position: absolute;
        transform: translate(-50%, -50%);
        z-index: 10;
      }

      .tb-dot {
        width:  var(--tb-dot, 62px);
        height: var(--tb-dot, 62px);
        background: #1e293b;
        border: 2.5px solid #334155;
        border-radius: 50%;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--tb-fs, 1.1rem);
        cursor: crosshair;
        font-family: 'Jua', sans-serif;
        user-select: none;
        touch-action: none;
        transition: transform .12s, background-color .15s;
        box-shadow: 0 3px 10px rgba(0,0,0,.45);
      }

      .tb-frac {
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 1.05;
      }

      .tb-top {
        border-bottom: 2px solid currentColor;
        padding: 0 4px;
        margin-bottom: 2px;
      }

      .tb-bot {
        padding: 0 4px;
      }

      .tb-dot.tb-active {
        background: #22d3ee;
        color: #000;
        transform: scale(1.18);
        border-color: #fff;
        box-shadow: 0 0 16px #22d3ee99;
      }

      .tb-dot.tb-connected {
        background: #0d8fa3;
        color: #fff;
        border-color: #22d3ee;
        pointer-events: none;
        transform: scale(.82);
        opacity: .85;
      }

      .tb-dot.tb-wrong {
        background: #f87171;
        animation: tb-shake .3s;
      }

      .tb-drag {
        stroke-width: var(--tb-sw, 5px);
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
        opacity: .65;
        pointer-events: none;
        stroke-dasharray: 10 5;
        animation: tb-flow .5s linear infinite;
      }

      @keyframes tb-flow {
        to {
          stroke-dashoffset: -30;
        }
      }

      .tb-result {
        stroke-width: var(--tb-sw, 7px);
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
        pointer-events: stroke;
        cursor: pointer;
        transition: opacity .2s;
      }

      .tb-result:hover {
        opacity: .35;
      }

      @keyframes tb-shake {
        0%   { transform: translateX(0); }
        25%  { transform: translateX(-7px); }
        75%  { transform: translateX(7px); }
        100% { transform: translateX(0); }
      }

      .tb-shake {
        animation: tb-shake .35s ease;
      }
    `;

    document.head.appendChild(s);
  }

})();
