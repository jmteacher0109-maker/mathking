/**
 * 분수 산 등반 게임 모듈 v1
 * window.SanDeunBanGame 으로 index.html 과 통신
 *
 * config:
 *   boardEl       - 게임 보드 div
 *   onCorrect()   - 정답 시 호출 → 획득 점수 반환
 *   onWrong()     - 오답 시 호출
 *   onBoardStart()- 판 시작 스냅샷
 *   onComplete()  - 정상 도달 시 호출 (타이머 종료 대신 즉시 종료)
 *   isActive()    - 게임 진행 중이면 true
 *   options.level - 1:초급 2:중급 3:고급 4:신의경지
 *   hideFooter()  - '다시 그리기' 버튼 숨김 (산등반은 불필요)
 */
(function () {
  'use strict';

  /* ── 레벨 설정 ── */
  const LEVELS = {
    1: { maxDenom: 20,  steps: 12, name: '⛰️ 초급'  },
    2: { maxDenom: 36,  steps: 15, name: '🏔️ 중급'  },
    3: { maxDenom: 60,  steps: 18, name: '🗻 고급'   },
    4: { maxDenom: 100, steps: 25, name: '⚡ 신의경지'},
  };

  /* ── 상태 ── */
  let cfg          = null;
  let lvl          = 2;
  let questions    = [];
  let currentStep  = 0;
  let totalSteps   = 15;
  let wrongCount   = 0;
  let pathPoints   = [];

  /* ── DOM 참조 (재사용) ── */
  let numInp, denInp, qNumEl, qDenEl, qLabelEl, ansBox;
  let climberEl, progFill, stepTxt, mtnArea;

  /* ════════════════════════════
     PUBLIC INTERFACE
  ════════════════════════════ */
  window.SanDeunBanGame = {

    init(config) {
      cfg         = config;
      lvl         = config.options?.level || 2;
      currentStep = 0;
      wrongCount  = 0;
      questions   = [];

      // 풋터(다시 그리기) 버튼 숨김 - 산등반에는 불필요
      cfg.hideFooter?.();

      _injectStyles();
      cfg.onBoardStart(); // 스냅샷 (점수 롤백 기준점)

      // rAF: DOM 레이아웃 완료 후 크기 측정
      requestAnimationFrame(() => {
        _buildUI();
        _startPlay();
      });
    },

    resetBoard() {
      // 현재 문제 초기화 (입력값만 지움)
      if (numInp) { numInp.value = ''; numInp.focus(); }
      if (denInp)   denInp.value = '';
      if (ansBox)   ansBox.className = 'sdb-ans-box';
    },

    destroy() {
      if (cfg?.boardEl) cfg.boardEl.innerHTML = '';
      cfg = null;
    },
  };

  /* ════════════════════════════
     UI 구성
  ════════════════════════════ */
  function _buildUI() {
    const board = cfg.boardEl;
    const wrap  = board.parentElement;

    // 보드를 판 전체로 채움 (정사각형 아님)
    const w = wrap.clientWidth  - 20;
    const h = wrap.clientHeight - 20;
    board.style.width          = Math.max(280, w) + 'px';
    board.style.height         = Math.max(400, h) + 'px';
    board.style.display        = 'flex';
    board.style.flexDirection  = 'column';
    board.style.overflow       = 'hidden';
    board.style.borderRadius   = '18px';
    board.style.background     = 'linear-gradient(180deg,#0d1117 0%,#161b22 100%)';
    board.style.touchAction    = 'manipulation';

    board.innerHTML = `
      <!-- 진행 바 -->
      <div class="sdb-prog-wrap">
        <span class="sdb-prog-lbl">🏕️ 출발</span>
        <div class="sdb-prog-track">
          <div class="sdb-prog-fill" id="sdb-pfill"></div>
        </div>
        <span class="sdb-step-txt" id="sdb-steptxt">0/${totalSteps}</span>
        <span class="sdb-prog-lbl">🏔️ 정상</span>
      </div>

      <!-- 산 배경 + 등반자 -->
      <div class="sdb-mtn-area" id="sdb-mtn">
        ${_mtnSVG()}
        <div id="sdb-climber" class="sdb-climber">🧗</div>
      </div>

      <!-- 문제 패널 -->
      <div class="sdb-panel" id="sdb-panel">
        <div class="sdb-q-label" id="sdb-qlabel">기약분수로 나타내세요 (1/${totalSteps})</div>
        <div class="sdb-q-row">
          <div class="sdb-frac-box">
            <div class="sdb-fn" id="sdb-qnum">?</div>
            <div class="sdb-fl"></div>
            <div class="sdb-fd" id="sdb-qden">?</div>
          </div>
          <div class="sdb-arrow">→</div>
          <div class="sdb-ans-box" id="sdb-ansbox">
            <input class="sdb-inp sdb-num-inp" id="sdb-num" type="number" min="1" inputmode="numeric" placeholder="?">
            <div class="sdb-fl"></div>
            <input class="sdb-inp sdb-den-inp" id="sdb-den" type="number" min="1" inputmode="numeric" placeholder="?">
          </div>
        </div>
        <button class="sdb-submit" id="sdb-submit">확인 ✓</button>
      </div>`;

    // DOM 참조
    numInp   = board.querySelector('#sdb-num');
    denInp   = board.querySelector('#sdb-den');
    qNumEl   = board.querySelector('#sdb-qnum');
    qDenEl   = board.querySelector('#sdb-qden');
    qLabelEl = board.querySelector('#sdb-qlabel');
    ansBox   = board.querySelector('#sdb-ansbox');
    climberEl= board.querySelector('#sdb-climber');
    progFill = board.querySelector('#sdb-pfill');
    stepTxt  = board.querySelector('#sdb-steptxt');
    mtnArea  = board.querySelector('#sdb-mtn');

    // 이벤트
    board.querySelector('#sdb-submit').addEventListener('click', _checkAnswer);
    numInp.addEventListener('keydown', e => { if (e.key === 'Enter') denInp.focus(); });
    denInp.addEventListener('keydown', e => { if (e.key === 'Enter') _checkAnswer(); });
  }

  /* ════════════════════════════
     게임 시작 (문제 생성 + 첫 문제)
  ════════════════════════════ */
  function _startPlay() {
    const lc   = LEVELS[lvl];
    totalSteps = lc.steps;
    questions  = _genQuestions(totalSteps, lc.maxDenom);
    pathPoints = _buildPath(totalSteps);

    // 첫 문제 표시 + 등반자 출발점으로
    _showQuestion(0);
    _moveClimber(0);
    _updateProgress(0);

    // 스텝 점 렌더
    _renderDots();

    setTimeout(() => numInp?.focus(), 200);
  }

  /* ════════════════════════════
     문제 표시
  ════════════════════════════ */
  function _showQuestion(idx) {
    const q = questions[idx];
    qNumEl.textContent   = q.num;
    qDenEl.textContent   = q.den;
    qLabelEl.textContent = `기약분수로 나타내세요 (${idx + 1}/${totalSteps})`;
    numInp.value = '';
    denInp.value = '';
    ansBox.className = 'sdb-ans-box';
  }

  /* ════════════════════════════
     정답 확인
  ════════════════════════════ */
  function _checkAnswer() {
    if (!cfg?.isActive()) return;
    const q    = questions[currentStep];
    const uNum = parseInt(numInp.value);
    const uDen = parseInt(denInp.value);
    if (!uNum || !uDen || isNaN(uNum) || isNaN(uDen)) return;

    const g          = _gcd(Math.abs(uNum), Math.abs(uDen));
    const isReduced  = g === 1 && uNum > 0 && uDen > 0;
    const isEquiv    = uNum * q.den === uDen * q.num;

    if (isReduced && isEquiv) {
      // ✅ 정답
      ansBox.classList.add('sdb-correct');
      cfg.onCorrect();

      currentStep++;
      _updateProgress(currentStep);
      _moveClimber(currentStep);
      _updateDots(currentStep);

      if (currentStep >= totalSteps) {
        // 🏆 정상 도달!
        climberEl.textContent = '🏆';
        setTimeout(() => cfg.onComplete?.(), 600);
      } else {
        setTimeout(() => {
          cfg.onBoardStart(); // 각 스텝을 새 판 기준점으로
          _showQuestion(currentStep);
          numInp?.focus();
        }, 380);
      }
    } else {
      // ❌ 오답
      wrongCount++;
      ansBox.classList.add('sdb-wrong');
      cfg.onWrong();
      setTimeout(() => {
        ansBox.className = 'sdb-ans-box';
        numInp.value = '';
        denInp.value = '';
        numInp?.focus();
      }, 380);
    }
  }

  /* ════════════════════════════
     등반자 이동
  ════════════════════════════ */
  function _moveClimber(step) {
    if (!climberEl || !mtnArea || !pathPoints[step]) return;
    const p = pathPoints[step];
    climberEl.style.left = p.xPct + '%';
    climberEl.style.top  = p.yPct + '%';
  }

  function _updateProgress(step) {
    if (progFill) progFill.style.width = (step / totalSteps * 100) + '%';
    if (stepTxt)  stepTxt.textContent  = `${step}/${totalSteps}`;
  }

  /* ════════════════════════════
     스텝 점 렌더 / 업데이트
  ════════════════════════════ */
  function _renderDots() {
    if (!mtnArea) return;
    mtnArea.querySelectorAll('.sdb-dot').forEach(d => d.remove());
    for (let i = 1; i <= totalSteps; i++) {
      const p = pathPoints[i];
      if (!p) continue;
      const dot = document.createElement('div');
      dot.className = 'sdb-dot sdb-dot-up';
      dot.id = `sdb-dot-${i}`;
      dot.style.left = p.xPct + '%';
      dot.style.top  = p.yPct + '%';
      mtnArea.appendChild(dot);
    }
  }

  function _updateDots(step) {
    for (let i = 1; i <= totalSteps; i++) {
      const d = document.getElementById(`sdb-dot-${i}`);
      if (!d) continue;
      d.className = 'sdb-dot ' + (i < step ? 'sdb-dot-done' : i === step ? 'sdb-dot-cur' : 'sdb-dot-up');
    }
  }

  /* ════════════════════════════
     산 경로 계산 (퍼센트 기준)
  ════════════════════════════ */
  function _buildPath(n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t  = i / n;                          // 0=출발, 1=정상
      const x  = 50 + Math.sin(t * Math.PI * 2.8) * 14; // 좌우 지그재그 (%)
      const y  = 88 - t * 78;                    // 아래 → 위 (%)
      pts.push({ xPct: x, yPct: y });
    }
    return pts;
  }

  /* ════════════════════════════
     산 SVG (인라인)
  ════════════════════════════ */
  function _mtnSVG() {
    return `<svg viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg"
      style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">
      <defs>
        <linearGradient id="sdb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1a2744"/>
          <stop offset="100%" stop-color="#2d5a27"/>
        </linearGradient>
        <linearGradient id="sdb-mtn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#8FA88F"/>
          <stop offset="100%" stop-color="#4A6741"/>
        </linearGradient>
      </defs>
      <rect width="400" height="320" fill="url(#sdb-sky)"/>
      <!-- 별 -->
      <circle cx="60"  cy="30" r="1.5" fill="white" opacity=".7"/>
      <circle cx="150" cy="18" r="1"   fill="white" opacity=".6"/>
      <circle cx="250" cy="25" r="1.5" fill="white" opacity=".8"/>
      <circle cx="340" cy="15" r="1"   fill="white" opacity=".5"/>
      <circle cx="380" cy="40" r="1.5" fill="white" opacity=".7"/>
      <circle cx="30"  cy="55" r="1"   fill="white" opacity=".6"/>
      <!-- 구름 -->
      <ellipse cx="80"  cy="60" rx="45" ry="18" fill="white" opacity=".12"/>
      <ellipse cx="320" cy="75" rx="38" ry="15" fill="white" opacity=".10"/>
      <!-- 산 본체 -->
      <polygon points="200,18 20,290 380,290" fill="url(#sdb-mtn)"/>
      <!-- 눈 -->
      <polygon points="200,18 178,88 222,88" fill="white" opacity=".92"/>
      <!-- 음영 -->
      <polygon points="200,18 200,290 380,290" fill="rgba(0,0,0,.09)"/>
      <!-- 작은 산 -->
      <polygon points="70,220 10,290 140,290" fill="#3a5a3a" opacity=".6"/>
      <polygon points="330,205 265,290 400,290" fill="#3a5a3a" opacity=".55"/>
      <!-- 바닥 -->
      <rect x="0" y="290" width="400" height="30" fill="#2d4a2d"/>
      <!-- 나무 -->
      <polygon points="55,270 48,290 62,290" fill="#1d3a1d"/>
      <polygon points="75,262 68,290 82,290" fill="#1d3a1d"/>
      <polygon points="325,268 318,290 332,290" fill="#1d3a1d"/>
      <polygon points="345,260 338,290 352,290" fill="#1d3a1d"/>
      <!-- 깃발 -->
      <line x1="200" y1="18" x2="200" y2="2" stroke="#8B6914" stroke-width="2.2"/>
      <polygon points="200,2 216,9 200,16" fill="#FF6B35"/>
    </svg>`;
  }

  /* ════════════════════════════
     문제 생성 (기약분수로 만들 수 있는 분수)
  ════════════════════════════ */
  function _genQuestions(n, maxDen) {
    const seen = new Set();
    const qs   = [];
    let   tries = 0;

    while (qs.length < n && tries++ < 600) {
      const den = Math.floor(Math.random() * (maxDen - 3)) + 4;
      const num = Math.floor(Math.random() * (den - 1)) + 1;
      const g   = _gcd(num, den);
      if (g === 1) continue;         // 이미 기약분수면 스킵
      const key = `${num}/${den}`;
      if (seen.has(key)) continue;
      seen.add(key);
      qs.push({ num, den, ansNum: num / g, ansDen: den / g });
    }
    return qs;
  }

  function _gcd(a, b) { return b === 0 ? a : _gcd(b, a % b); }

  /* ════════════════════════════
     CSS 주입 (한 번만)
  ════════════════════════════ */
  function _injectStyles() {
    if (document.getElementById('sdb-styles')) return;
    const s = document.createElement('style');
    s.id = 'sdb-styles';
    s.textContent = `
      /* ── 진행 바 ── */
      .sdb-prog-wrap {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 14px 6px;
        flex-shrink: 0;
      }
      .sdb-prog-lbl { font-size: .75rem; color: #8b949e; white-space: nowrap; font-family: 'Noto Sans KR', sans-serif; }
      .sdb-prog-track { flex: 1; height: 8px; background: rgba(255,255,255,.1); border-radius: 10px; overflow: hidden; }
      .sdb-prog-fill  { height: 100%; background: linear-gradient(90deg, #FFD93D, #FF6B35); border-radius: 10px; width: 0%; transition: width .5s ease; }
      .sdb-step-txt   { font-size: .8rem; color: #FFD93D; white-space: nowrap; min-width: 38px; text-align: right; }

      /* ── 산 영역 ── */
      .sdb-mtn-area {
        flex: 1; position: relative; min-height: 0;
        overflow: hidden;
      }

      /* ── 등반자 ── */
      .sdb-climber {
        position: absolute;
        font-size: 1.6rem;
        transform: translate(-50%, -100%);
        transition: left .7s cubic-bezier(.4,0,.2,1), top .7s cubic-bezier(.4,0,.2,1);
        z-index: 8;
        filter: drop-shadow(0 2px 5px rgba(0,0,0,.6));
      }

      /* ── 스텝 점 ── */
      .sdb-dot {
        position: absolute; transform: translate(-50%, -50%);
        width: 11px; height: 11px; border-radius: 50%;
        border: 2px solid #fff; z-index: 5;
        box-shadow: 0 1px 5px rgba(0,0,0,.4);
      }
      .sdb-dot-up   { background: rgba(255,255,255,.25); }
      .sdb-dot-done { background: #FFD700; }
      .sdb-dot-cur  { background: #FF6B35; width: 15px; height: 15px;
        animation: sdb-dot-pulse 1s infinite; }
      @keyframes sdb-dot-pulse {
        0%,100%{ box-shadow: 0 0 0 0 rgba(255,107,53,.7); }
        50%    { box-shadow: 0 0 0 7px rgba(255,107,53,0); }
      }

      /* ── 문제 패널 ── */
      .sdb-panel {
        background: #1c2128;
        border-top: 1px solid #30363d;
        padding: 14px 16px 16px;
        flex-shrink: 0;
        display: flex; flex-direction: column; align-items: center; gap: 10px;
      }
      .sdb-q-label {
        font-size: .82rem; color: #8b949e;
        font-family: 'Noto Sans KR', sans-serif;
      }
      .sdb-q-row {
        display: flex; align-items: center; gap: 14px;
      }
      .sdb-frac-box {
        display: flex; flex-direction: column; align-items: center;
        background: rgba(255,255,255,.06); border-radius: 12px;
        padding: 10px 18px;
      }
      .sdb-fn, .sdb-fd {
        font-size: 1.7rem; font-weight: 900;
        color: #e6edf3; line-height: 1.1;
        font-family: 'Jua', sans-serif;
      }
      .sdb-fl { width: 48px; height: 2.5px; background: #e6edf3; border-radius: 2px; margin: 4px 0; }
      .sdb-arrow { font-size: 1.4rem; color: #555; }

      /* ── 답 입력 ── */
      .sdb-ans-box {
        display: flex; flex-direction: column; align-items: center;
        background: #0d1117; border: 2px solid #30363d;
        border-radius: 12px; padding: 8px 14px;
        transition: border-color .2s;
      }
      .sdb-ans-box.sdb-correct { border-color: #34d399; background: rgba(52,211,153,.08); }
      .sdb-ans-box.sdb-wrong   { border-color: #f87171; background: rgba(248,113,113,.08); animation: sdb-shake .32s; }
      @keyframes sdb-shake {
        0%  { transform: translateX(0); }
        25% { transform: translateX(-7px); }
        75% { transform: translateX(7px); }
        100%{ transform: translateX(0); }
      }
      .sdb-inp {
        width: 60px; text-align: center;
        border: none; outline: none;
        font-size: 1.7rem; font-weight: 900;
        font-family: 'Jua', sans-serif;
        color: #e6edf3; background: transparent;
      }
      .sdb-inp::placeholder { color: #444; }
      .sdb-inp::-webkit-inner-spin-button,
      .sdb-inp::-webkit-outer-spin-button { -webkit-appearance: none; }

      /* ── 확인 버튼 ── */
      .sdb-submit {
        width: 100%; max-width: 320px;
        padding: 13px; font-size: 1.1rem;
        font-weight: 900; font-family: 'Jua', sans-serif;
        background: linear-gradient(135deg, #7c3aed, #a78bfa);
        border: none; border-radius: 50px; color: #fff;
        cursor: pointer;
        box-shadow: 0 4px 0 #5b21b6;
        transition: transform .1s, box-shadow .1s;
        min-height: 48px;
      }
      .sdb-submit:active { transform: translateY(4px); box-shadow: none; }
    `;
    document.head.appendChild(s);
  }

})();
