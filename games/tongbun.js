/**
 * 통분 연결킹 게임 모듈
 * window.TongbunGame 으로 index.html 과 통신
 *
 * 새 게임 추가 시 이 파일을 복사해서 같은 인터페이스를 구현하면 됩니다.
 *
 * index.html 이 제공하는 config:
 *   boardEl      - 게임 보드 div
 *   svgEl        - SVG 레이어
 *   dotsEl       - 점(분수) 컨테이너
 *   onCorrect()  - 정답 연결 시 호출, 획득 점수(number) 반환
 *   onWrong()    - 오답 / 충돌 시 호출
 *   onUndo(n)    - 선 취소 시 호출 (n = 원래 획득 점수)
 *   onBoardStart()- 새 판 시작 시 호출 (다시 그리기 기준점 저장용)
 *   isActive()   - 게임이 진행 중이면 true
 */
(function () {
  'use strict';

  /* ════════════════════════════
     PRIVATE STATE
  ════════════════════════════ */
  let cfg          = null;   // init() 으로 받은 config
  let paths        = [];     // 완성된 선 목록 [{startId,endId,points,pathEl,scoreGained}]
  let connectedCnt = 0;      // 현재 판에서 연결된 쌍 수
  let activeDrags  = {};     // 진행 중인 드래그 { pointerId: drag }
  const BOARD_CLR  = '#22d3ee';
  const PAIRS      = 4;      // 한 판의 분수 쌍 수 (= 총 8개 점)

  /* ════════════════════════════
     분수 풀 (크기가 같은 분수 그룹)
  ════════════════════════════ */
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
  ];

  /* ════════════════════════════
     PUBLIC INTERFACE
  ════════════════════════════ */
  window.TongbunGame = {

    /**
     * 게임 초기화 - index.html 이 솔로/멀티 시작 시 호출
     */
    init(config) {
      cfg          = config;
      paths        = [];
      connectedCnt = 0;
      activeDrags  = {};

      _injectStyles();
      _sizeBoard();
      _generateBoard();

      window.addEventListener('resize', _sizeBoard);
    },

    /**
     * 보드 시각 초기화 (선 삭제, 점 상태 복원)
     * 점수 롤백은 index.html 이 처리
     */
    resetBoard() {
      // 진행 중 드래그 취소
      for (const pid in activeDrags) {
        const d = activeDrags[pid];
        try { d.startEl?.releasePointerCapture(parseInt(pid)); } catch (_) {}
        d.pathEl?.parentNode?.removeChild(d.pathEl);
        delete activeDrags[pid];
      }

      // 완성된 선 삭제
      paths.forEach(p => p.pathEl?.parentNode?.removeChild(p.pathEl));
      paths = [];
      connectedCnt = 0;

      // 점 상태 초기화
      cfg.dotsEl.querySelectorAll('.tb-dot').forEach(d =>
        d.classList.remove('tb-connected', 'tb-active', 'tb-wrong')
      );
    },

    /**
     * 게임 종료 시 정리
     */
    destroy() {
      window.removeEventListener('resize', _sizeBoard);
      if (cfg?.boardEl) {
        cfg.boardEl.onpointerdown  = null;
        cfg.boardEl.onpointermove  = null;
        cfg.boardEl.onpointerup    = null;
        cfg.boardEl.onpointercancel= null;
      }
      paths = []; activeDrags = {}; cfg = null;
    },
  };

  /* ════════════════════════════
     BOARD SIZING
     CSS aspect-ratio 보다 JS 로 직접 지정이 더 안정적
  ════════════════════════════ */
  function _sizeBoard() {
    if (!cfg?.boardEl) return;
    const wrap = cfg.boardEl.parentElement;
    const size = Math.min(wrap.clientWidth, wrap.clientHeight) - 20;
    cfg.boardEl.style.width  = Math.max(180, size) + 'px';
    cfg.boardEl.style.height = Math.max(180, size) + 'px';
  }

  /* ════════════════════════════
     BOARD GENERATION
  ════════════════════════════ */
  function _generateBoard() {
    cfg.dotsEl.innerHTML = '';
    cfg.svgEl.innerHTML  = '';
    paths        = [];
    connectedCnt = 0;
    cfg.onBoardStart(); // index.html 에 스냅샷 저장 요청

    // PAIRS 개의 그룹에서 각 2개의 분수 추출
    const groups = [...POOL].sort(() => Math.random() - .5).slice(0, PAIRS);
    let fracs = [];
    groups.forEach((g, pairId) => {
      const pair = [...g].sort(() => Math.random() - .5).slice(0, 2);
      fracs.push({ ...pair[0], pairId }, { ...pair[1], pairId });
    });
    fracs.sort(() => Math.random() - .5); // 8개 섞기

    // 4×3 그리드에서 8칸 선택
    let cells = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) cells.push({ r, c });
    cells.sort(() => Math.random() - .5);
    cells = cells.slice(0, 8);

    cells.forEach((cell, i) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'tb-wrapper';

      // 약간의 랜덤 오프셋으로 자연스럽게
      const jx = (Math.random() - .5) * 8;
      const jy = (Math.random() - .5) * 8;
      wrapper.style.left = `${cell.c * 35 + 14 + jx}%`;
      wrapper.style.top  = `${cell.r * 23 + 14 + jy}%`;

      const btn = document.createElement('div');
      btn.className      = 'tb-dot';
      btn.dataset.pairId = fracs[i].pairId;
      btn.dataset.id     = i;
      btn.innerHTML      = `
        <div class="tb-frac">
          <div class="tb-top">${fracs[i].n}</div>
          <div class="tb-bot">${fracs[i].d}</div>
        </div>`;

      wrapper.appendChild(btn);
      cfg.dotsEl.appendChild(wrapper);
    });

    // 포인터 이벤트 등록
    cfg.boardEl.onpointerdown  = _onDown;
    cfg.boardEl.onpointermove  = _onMove;
    cfg.boardEl.onpointerup    = _onUp;
    cfg.boardEl.onpointercancel= _onUp;
  }

  /* ════════════════════════════
     POINTER: DOWN
  ════════════════════════════ */
  function _onDown(e) {
    if (!cfg.isActive()) return;
    const btn = e.target.closest('.tb-dot');
    if (!btn || btn.classList.contains('tb-connected')) return;
    e.preventDefault();

    const bRect = cfg.boardEl.getBoundingClientRect();
    const r     = btn.getBoundingClientRect();
    const sx    = r.left + r.width  / 2 - bRect.left;
    const sy    = r.top  + r.height / 2 - bRect.top;

    // 현재 판의 모든 점 위치 미리 계산
    const dots = [];
    cfg.dotsEl.querySelectorAll('.tb-dot').forEach(node => {
      const nr = node.getBoundingClientRect();
      dots.push({
        id:        node.dataset.id,
        pairId:    node.dataset.pairId,
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
      pathEl:      path,
      points:      [{ x: sx, y: sy }],
      bRect,
      dots,
      done:        false,
    };
    btn.setPointerCapture(e.pointerId);
  }

  /* ════════════════════════════
     POINTER: MOVE
  ════════════════════════════ */
  function _onMove(e) {
    const drag = activeDrags[e.pointerId];
    if (!drag || drag.done) return;
    e.preventDefault();

    const cx = e.clientX - drag.bRect.left;
    const cy = e.clientY - drag.bRect.top;
    const p1 = drag.points[drag.points.length - 1];
    const p2 = { x: cx, y: cy };

    // 보드 이탈
    if (cx < 0 || cy < 0 || cx > drag.bRect.width || cy > drag.bRect.height) {
      _fail(drag, e.pointerId); return;
    }

    // 기존 선과 교차
    for (const seg of paths) {
      for (let i = 0; i < seg.points.length - 1; i++) {
        if (_intersect(p1, p2, seg.points[i], seg.points[i + 1])) {
          _fail(drag, e.pointerId); return;
        }
      }
    }

    // 점 충돌 감지 (반지름 26px)
    for (const dot of drag.dots) {
      if (dot.id === drag.startId) continue;
      if (_ptSegDist(dot, p1, p2) < 26) {
        if (dot.connected || drag.startPairId !== dot.pairId) _fail(drag, e.pointerId);
        else _complete(drag, dot.el, e.pointerId);
        return;
      }
    }

    drag.points.push(p2);
    drag.pathEl.setAttribute('d', drag.pathEl.getAttribute('d') + ` L ${cx} ${cy}`);
  }

  /* ════════════════════════════
     POINTER: UP
  ════════════════════════════ */
  function _onUp(e) {
    const drag = activeDrags[e.pointerId];
    if (!drag) return;
    e.preventDefault();
    if (!drag.done) {
      drag.pathEl?.parentNode?.removeChild(drag.pathEl);
      drag.startEl.classList.remove('tb-active');
    }
    try { drag.startEl.releasePointerCapture(e.pointerId); } catch (_) {}
    delete activeDrags[e.pointerId];
  }

  /* ════════════════════════════
     FAIL DRAG (오답 / 충돌)
  ════════════════════════════ */
  function _fail(drag, pid) {
    drag.done = true;
    try { drag.startEl?.releasePointerCapture(pid); } catch (_) {}

    drag.startEl?.classList.remove('tb-active');
    drag.startEl?.classList.add('tb-wrong');
    setTimeout(() => drag.startEl?.classList.remove('tb-wrong'), 300);

    if (drag.pathEl) {
      drag.pathEl.setAttribute('stroke', '#f87171');
      setTimeout(() => drag.pathEl?.parentNode?.removeChild(drag.pathEl), 200);
    }

    // 보드 흔들기
    const board = cfg.boardEl;
    board.classList.remove('tb-shake');
    void board.offsetWidth;
    board.classList.add('tb-shake');
    setTimeout(() => board.classList.remove('tb-shake'), 400);

    cfg.onWrong();
    delete activeDrags[pid];
  }

  /* ════════════════════════════
     COMPLETE DRAG (정답)
  ════════════════════════════ */
  function _complete(drag, targetEl, pid) {
    drag.done = true;
    try { drag.startEl?.releasePointerCapture(pid); } catch (_) {}

    const tr   = targetEl.getBoundingClientRect();
    const endX = tr.left + tr.width  / 2 - drag.bRect.left;
    const endY = tr.top  + tr.height / 2 - drag.bRect.top;
    drag.points.push({ x: endX, y: endY });

    drag.pathEl.setAttribute('d', drag.pathEl.getAttribute('d') + ` L ${endX} ${endY}`);
    drag.pathEl.classList.remove('tb-drag');
    drag.pathEl.classList.add('tb-result');
    drag.pathEl.setAttribute('stroke', BOARD_CLR);

    drag.startEl.classList.remove('tb-active');
    drag.startEl.classList.add('tb-connected');
    targetEl.classList.add('tb-connected');

    // 점수 계산은 index.html 에 위임
    const gained = cfg.onCorrect();

    const seg = {
      startId:    drag.startId,
      endId:      targetEl.dataset.id,
      points:     [...drag.points],
      pathEl:     drag.pathEl,
      scoreGained: gained,
    };
    paths.push(seg);

    // 선 터치 → 연결 취소
    drag.pathEl.addEventListener('pointerdown', ev => _undo(ev, seg));

    connectedCnt++;
    if (connectedCnt >= PAIRS) {
      // 판 클리어! 잠시 후 새 판 생성
      setTimeout(_generateBoard, 450);
    }

    delete activeDrags[pid];
  }

  /* ════════════════════════════
     UNDO PATH (선 터치 → 취소)
  ════════════════════════════ */
  function _undo(e, seg) {
    e.stopPropagation();
    if (!cfg.isActive()) return;

    paths = paths.filter(p => p !== seg);
    seg.pathEl?.parentNode?.removeChild(seg.pathEl);

    cfg.dotsEl.querySelector(`.tb-dot[data-id="${seg.startId}"]`)?.classList.remove('tb-connected');
    cfg.dotsEl.querySelector(`.tb-dot[data-id="${seg.endId}"]`)?.classList.remove('tb-connected');

    connectedCnt = Math.max(0, connectedCnt - 1);
    cfg.onUndo(seg.scoreGained);
  }

  /* ════════════════════════════
     COLLISION HELPERS
  ════════════════════════════ */
  function _d2(a, b) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; }

  function _ptSegDist(p, v, w) {
    const l2 = _d2(v, w);
    if (l2 === 0) return Math.sqrt(_d2(p, v));
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(_d2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) }));
  }

  function _ccw(A, B, C) { return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x); }

  function _intersect(A, B, C, D) {
    return _ccw(A, C, D) !== _ccw(B, C, D) && _ccw(A, B, C) !== _ccw(A, B, D);
  }

  /* ════════════════════════════
     CSS INJECTION (한 번만)
  ════════════════════════════ */
  function _injectStyles() {
    if (document.getElementById('tb-styles')) return;
    const s = document.createElement('style');
    s.id = 'tb-styles';
    s.textContent = `
      /* Dot wrapper */
      .tb-wrapper {
        position: absolute;
        transform: translate(-50%, -50%);
        z-index: 10;
      }

      /* Fraction button */
      .tb-dot {
        width: 52px; height: 52px;
        background: #1e293b;
        border: 2.5px solid #334155;
        border-radius: 50%;
        color: #fff;
        display: flex; align-items: center; justify-content: center;
        font-size: 1rem;
        cursor: crosshair;
        font-family: 'Jua', sans-serif;
        user-select: none;
        touch-action: none;
        transition: transform .12s, background-color .15s;
      }
      .tb-frac { display:flex; flex-direction:column; align-items:center; line-height:1; }
      .tb-top  { border-bottom:2px solid currentColor; padding:0 3px; margin-bottom:1px; }
      .tb-bot  { padding:0 3px; }

      .tb-dot.tb-active    { background:#22d3ee; color:#000; transform:scale(1.22); border-color:#fff; }
      .tb-dot.tb-connected { background:#22d3ee; color:#000; border-color:#fff; pointer-events:none; transform:scale(.84); opacity:.9; }
      .tb-dot.tb-wrong     { background:#f87171; animation:tb-shake .3s; }

      /* SVG lines */
      .tb-drag   { stroke-width:5; stroke-linecap:round; stroke-linejoin:round; fill:none; opacity:.75; pointer-events:none; }
      .tb-result { stroke-width:8; stroke-linecap:round; stroke-linejoin:round; fill:none; pointer-events:stroke; cursor:pointer; transition:opacity .2s; }
      .tb-result:hover { opacity:.4; }

      /* Shake */
      @keyframes tb-shake { 0%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} 100%{transform:translateX(0)} }
      .tb-shake { animation:tb-shake .35s ease; }
    `;
    document.head.appendChild(s);
  }

})();
