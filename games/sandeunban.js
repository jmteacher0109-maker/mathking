/**
 * 분수 산 등반 게임 모듈 v4
 * ────────────────────────────────────────────
 * ★ 약분 문제를 풀며 등반가를 정상까지 이동
 * ★ 정상 도달 시 남은 시간 + 최고 콤보 표시
 * ★ destroy() 시 game-svg / game-dots 복원 (타 게임 연동 버그 수정)
 * ★ 게임 규칙:
 *   - 기약분수로 약분해야 정답
 *   - 오답은 등반 멈춤, 시간은 계속 줄어듦
 *   - 연속 정답 시 콤보 카운터 표시
 */
(function () {
  'use strict';

  /* ══════════════════════════════════════
     레벨 설정
  ══════════════════════════════════════ */
  const LEVEL_CFG = {
    1: { maxDen: 20,  time: 120, steps: 12 },
    2: { maxDen: 36,  time: 100, steps: 15 },
    3: { maxDen: 60,  time: 90,  steps: 15 },
    4: { maxDen: 100, time: 120, steps: 20 },
  };

  /* ══════════════════════════════════════
     상태 변수
  ══════════════════════════════════════ */
  let cfg         = null;
  let level       = 1;
  let questions   = [];
  let pathPoints  = [];
  let currentStep = 0;
  let totalSteps  = 12;
  let localCombo  = 0;
  let maxCombo    = 0;
  let isGameOver  = false;

  let checkBtn   = null;
  let keyHandler = null;
  let toastTimer = null;
  let celebTimer = null;

  /* ══════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════ */
  window.SanDeunBanGame = {
    duration: 120,

    init(config) {
      cfg        = config;
      level      = Number(config.options?.level || 1);
      const lcfg = LEVEL_CFG[level] || LEVEL_CFG[1];

      this.duration = lcfg.time;
      totalSteps    = lcfg.steps;
      currentStep   = 0;
      localCombo    = 0;
      maxCombo      = 0;
      isGameOver    = false;
      questions     = genQuestions(totalSteps, lcfg.maxDen);
      pathPoints    = getMountainPath(totalSteps);

      cfg.hideFooter?.();
      injectStyles();

      const board = cfg.boardEl;
      const wrap  = board.parentElement;

      wrap.style.cssText = `
        flex: 1; padding: 0; min-height: 0; min-width: 0;
        display: flex; align-items: stretch; justify-content: stretch;
      `;
      board.style.cssText = `
        position: relative; width: 100%; height: 100%; min-height: 380px;
        border-radius: 0; overflow: hidden;
        background: linear-gradient(180deg,#5BA3D9 0%,#B8E0F7 45%,#C8E6A0 75%,#7AAD60 100%);
        box-shadow: none; touch-action: manipulation;
      `;

      board.innerHTML = buildUI(totalSteps);
      bindEvents();
      cfg.onBoardStart?.();

      /* 두 번의 rAF: 화면 전환 직후 레이아웃 확정 후 렌더링 */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          renderStepDots();
          updateDots(0);
          updateClimber(0, true);
          updateProgressBar(0);
          showQuestion(0);
        });
      });
    },

    resetBoard() {
      if (isGameOver) return;
      clearInputs();
      clearFlash();
      document.getElementById('sdb-ans-num')?.focus();
    },

    destroy() {
      isGameOver = true;
      unbindEvents();
      clearTimeout(toastTimer);
      clearTimeout(celebTimer);

      const board = cfg?.boardEl;
      const wrap  = board?.parentElement;

      if (board) {
        /*
         * ★★ 중요: game-svg / game-dots 복원
         *    산 등반 게임은 board.innerHTML 전체를 교체하므로,
         *    destroy 시 tongbun 등 다른 게임이 정상 작동하도록
         *    원래 구조를 반드시 복원해야 합니다.
         */
        board.innerHTML = `
          <svg id="game-svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;"></svg>
          <div id="game-dots" style="position:absolute;inset:0;z-index:5;"></div>
        `;
        board.style.cssText = '';
      }
      if (wrap) wrap.style.cssText = '';

      document.getElementById('sdb-styles')?.remove();
      cfg?.showFooter?.();

      cfg        = null;
      questions  = [];
      pathPoints = [];
      currentStep = localCombo = maxCombo = 0;
    },
  };

  /* ══════════════════════════════════════
     UI 빌드
  ══════════════════════════════════════ */
  function buildUI(steps) {
    return `
      <!-- ── 배경: 산 SVG ── -->
      <svg id="sdb-canvas"
           viewBox="0 0 400 600"
           preserveAspectRatio="xMidYMid slice"
           xmlns="http://www.w3.org/2000/svg"
           style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;">
        <defs>
          <linearGradient id="sdbSky2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#3A87C8"/>
            <stop offset="100%" stop-color="#A8D8EA"/>
          </linearGradient>
          <linearGradient id="sdbMtn2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#9BB8A0"/>
            <stop offset="60%"  stop-color="#5A8C60"/>
            <stop offset="100%" stop-color="#3D6128"/>
          </linearGradient>
          <linearGradient id="sdbGrnd2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#6AAF40"/>
            <stop offset="100%" stop-color="#3D7020"/>
          </linearGradient>
          <filter id="sdbShadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.3)"/>
          </filter>
        </defs>

        <!-- 하늘 -->
        <rect width="400" height="600" fill="url(#sdbSky2)"/>

        <!-- 구름 -->
        <ellipse cx="75"  cy="75"  rx="52" ry="22" fill="white" opacity="0.80"/>
        <ellipse cx="108" cy="67"  rx="36" ry="19" fill="white" opacity="0.90"/>
        <ellipse cx="60"  cy="85"  rx="28" ry="14" fill="white" opacity="0.60"/>
        <ellipse cx="318" cy="90"  rx="46" ry="19" fill="white" opacity="0.70"/>
        <ellipse cx="350" cy="82"  rx="30" ry="15" fill="white" opacity="0.80"/>
        <ellipse cx="290" cy="100" rx="22" ry="10" fill="white" opacity="0.50"/>

        <!-- 산 본체 -->
        <polygon points="200,36 15,528 385,528" fill="url(#sdbMtn2)"/>
        <!-- 우측 음영 -->
        <polygon points="200,36 200,528 385,528" fill="rgba(0,0,0,0.14)"/>
        <!-- 눈 (정상) -->
        <polygon points="200,36 165,118 235,118" fill="white" opacity="0.97"/>
        <polygon points="200,36 178,88 222,88"  fill="white" opacity="0.65"/>
        <!-- 눈 광택 -->
        <polygon points="200,36 178,88 192,75"  fill="white" opacity="0.30"/>

        <!-- 바위들 -->
        <ellipse cx="140" cy="320" rx="18" ry="9" fill="#5A6A50" opacity="0.50"/>
        <ellipse cx="260" cy="380" rx="14" ry="7" fill="#4A5A40" opacity="0.45"/>
        <ellipse cx="160" cy="420" rx="12" ry="6" fill="#5A6A50" opacity="0.40"/>

        <!-- 좌측 소 언덕 -->
        <polygon points="30,340  0,528 170,528"  fill="#3A6B2E" opacity="0.50"/>
        <!-- 우측 소 언덕 -->
        <polygon points="370,310 230,528 400,528" fill="#3A6B2E" opacity="0.45"/>

        <!-- 지면 -->
        <rect x="0" y="528" width="400" height="72" fill="url(#sdbGrnd2)"/>

        <!-- 나무들 -->
        <polygon points="48,492  40,528  56,528"  fill="#2A5220"/>
        <polygon points="72,480  63,528  81,528"  fill="#2A5220"/>
        <polygon points="95,498  88,528 102,528"  fill="#2A5220"/>
        <polygon points="338,488 330,528 346,528" fill="#2A5220"/>
        <polygon points="360,476 351,528 369,528" fill="#2A5220"/>
        <polygon points="118,510 112,528 124,528" fill="#2A5220"/>

        <!-- 등반로 점선 (배경) -->
        <line x1="90" y1="490" x2="200" y2="50"
              stroke="rgba(255,255,255,0.25)" stroke-width="2.5"
              stroke-dasharray="6 6" stroke-linecap="round"/>

        <!-- 깃발 -->
        <line x1="200" y1="36" x2="200" y2="12"
              stroke="#7B5E2A" stroke-width="3" stroke-linecap="round"/>
        <polygon points="200,12 222,20 200,28" fill="#FF3333"/>
        <polygon points="200,12 222,20 200,28" fill="rgba(255,255,255,0.3)"/>
      </svg>

      <!-- ── 경로 점들 ── -->
      <div id="sdb-dots" style="position:absolute;inset:0;pointer-events:none;z-index:6;"></div>

      <!-- ── 등반가 ── -->
      <div id="sdb-climber"
           style="position:absolute;font-size:2.1rem;
                  transform:translate(-50%,-100%);z-index:8;
                  pointer-events:none;
                  filter:drop-shadow(0 2px 5px rgba(0,0,0,.5));
                  transition:left .65s cubic-bezier(.4,0,.2,1),
                              top  .65s cubic-bezier(.4,0,.2,1);">🧗</div>

      <!-- ── 상단 진행 바 ── -->
      <div style="position:absolute;top:8px;left:10px;right:10px;z-index:9;
                  display:flex;align-items:center;gap:6px;pointer-events:none;">
        <span style="font-size:.76rem;color:#fff;font-weight:700;
                     text-shadow:0 1px 5px rgba(0,0,0,.65);white-space:nowrap;
                     font-family:'Noto Sans KR',sans-serif;">🏕️</span>
        <div style="flex:1;height:7px;background:rgba(255,255,255,.28);border-radius:10px;overflow:hidden;">
          <div id="sdb-pbar"
               style="height:100%;width:0%;
                      background:linear-gradient(90deg,#FFD700,#FF6B35);
                      border-radius:10px;transition:width .55s ease;"></div>
        </div>
        <span style="font-size:.76rem;color:#fff;font-weight:700;
                     text-shadow:0 1px 5px rgba(0,0,0,.65);white-space:nowrap;
                     font-family:'Noto Sans KR',sans-serif;">🏔️</span>
        <span id="sdb-step-ctr"
              style="font-size:.8rem;color:#FFD700;font-weight:700;
                     text-shadow:0 1px 5px rgba(0,0,0,.8);
                     background:rgba(0,0,0,.32);border-radius:20px;
                     padding:2px 9px;font-family:'Jua',sans-serif;
                     white-space:nowrap;">0 / ${steps}</span>
      </div>

      <!-- ── 콤보 표시 ── -->
      <div id="sdb-combo"
           style="display:none;position:absolute;top:36px;left:50%;
                  transform:translateX(-50%);z-index:9;pointer-events:none;">
        <div style="background:rgba(230,80,0,.88);color:#fff;
                    font-family:'Jua',sans-serif;font-size:1rem;
                    border-radius:20px;padding:3px 14px;white-space:nowrap;
                    box-shadow:0 2px 12px rgba(230,80,0,.55);">
          🔥 <span id="sdb-combo-n">0</span>연속!
        </div>
      </div>

      <!-- ── 문제 패널 ── -->
      <div id="sdb-panel">
        <!-- 헤더: 단계 표시 -->
        <div style="display:flex;align-items:center;justify-content:space-between;
                    margin-bottom:10px;">
          <div id="sdb-step-lbl"
               style="font-size:.82rem;color:#5A5A7A;font-weight:700;
                      font-family:'Noto Sans KR',sans-serif;">
            1 / ${steps}번째 발걸음
          </div>
          <div style="font-size:.76rem;color:#8888AA;
                      font-family:'Noto Sans KR',sans-serif;">
            기약분수로 약분하세요
          </div>
        </div>

        <!-- 분수 표시 + 답 입력 -->
        <div style="display:flex;align-items:center;justify-content:center;gap:16px;">

          <!-- 문제 분수 -->
          <div style="display:flex;flex-direction:column;align-items:center;
                      background:#EEF2FF;border:2px solid #C7D2FE;
                      border-radius:16px;padding:10px 22px;min-width:78px;">
            <div id="sdb-q-num"
                 style="font-size:1.85rem;font-weight:900;color:#1E40AF;line-height:1.1;
                        font-family:'Noto Sans KR','Jua',sans-serif;">6</div>
            <div style="width:46px;height:3px;background:#3B82F6;border-radius:2px;margin:5px 0;"></div>
            <div id="sdb-q-den"
                 style="font-size:1.85rem;font-weight:900;color:#1E40AF;line-height:1.1;
                        font-family:'Noto Sans KR','Jua',sans-serif;">8</div>
          </div>

          <!-- 화살표 -->
          <div style="font-size:1.7rem;color:#9CA3AF;font-weight:900;flex-shrink:0;">→</div>

          <!-- 답 입력 -->
          <div id="sdb-ans-box"
               style="display:flex;flex-direction:column;align-items:center;
                      background:#fff;border:2.5px solid #C7D2FE;
                      border-radius:16px;padding:8px 18px;min-width:78px;
                      transition:border-color .18s,background .18s;">
            <input id="sdb-ans-num" class="sdb-inp"
                   type="number" min="1" inputmode="numeric" placeholder="?">
            <div style="width:46px;height:3px;background:#9CA3AF;border-radius:2px;margin:5px 0;"></div>
            <input id="sdb-ans-den" class="sdb-inp"
                   type="number" min="1" inputmode="numeric" placeholder="?">
          </div>
        </div>

        <!-- 확인 버튼 -->
        <button id="sdb-check-btn">확인 ✓</button>

        <!-- 피드백 메시지 -->
        <div id="sdb-fb"
             style="text-align:center;min-height:22px;margin-top:6px;
                    font-size:.9rem;font-weight:700;color:#555;
                    font-family:'Noto Sans KR',sans-serif;
                    opacity:0;transition:opacity .2s;"></div>
      </div>

      <!-- ── 정상 도달 축하 오버레이 ── -->
      <div id="sdb-summit"
           style="display:none;position:absolute;inset:0;
                  background:rgba(0,0,0,.72);z-index:50;
                  flex-direction:column;align-items:center;justify-content:center;gap:14px;">
        <div style="font-size:4.5rem;animation:sdbPop .45s cubic-bezier(.175,.885,.32,1.275);">🏆</div>
        <div style="font-size:2.2rem;color:#FFD700;font-family:'Jua',sans-serif;
                    text-shadow:0 0 24px rgba(255,215,0,.7);">정상 정복!</div>

        <div style="background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.3);
                    border-radius:18px;padding:18px 32px;display:flex;flex-direction:column;
                    gap:10px;text-align:center;">
          <div id="sdb-res-time"
               style="font-size:1.15rem;color:#fff;font-family:'Noto Sans KR',sans-serif;
                      font-weight:700;letter-spacing:.3px;">⏱ 남은 시간: -</div>
          <div id="sdb-res-combo"
               style="font-size:1.15rem;color:#FFD700;font-family:'Noto Sans KR',sans-serif;
                      font-weight:700;">🔥 최고 콤보: -</div>
        </div>

        <div style="font-size:.85rem;color:rgba(255,255,255,.55);
                    font-family:'Noto Sans KR',sans-serif;">잠시 후 결과 화면으로...</div>
      </div>
    `;
  }

  /* ══════════════════════════════════════
     스타일 삽입
  ══════════════════════════════════════ */
  function injectStyles() {
    if (document.getElementById('sdb-styles')) return;
    const s = document.createElement('style');
    s.id = 'sdb-styles';
    s.textContent = `
      /* 경로 점 */
      .sdb-dot {
        position: absolute;
        width: 13px; height: 13px;
        border-radius: 50%;
        border: 2.5px solid rgba(255,255,255,.9);
        box-shadow: 0 2px 7px rgba(0,0,0,.38);
        transform: translate(-50%, -50%);
        transition: background .25s, width .2s, height .2s;
      }
      .sdb-dot.done     { background: #FFD700; }
      .sdb-dot.current  {
        background: #FF6B35; width: 17px; height: 17px;
        animation: sdbPulse 1s ease-in-out infinite;
      }
      .sdb-dot.upcoming { background: rgba(255,255,255,.5); }

      @keyframes sdbPulse {
        0%,100% { box-shadow: 0 0 0 0 rgba(255,107,53,.65); }
        50%      { box-shadow: 0 0 0 8px rgba(255,107,53,0); }
      }
      @keyframes sdbPop {
        from { transform: scale(1.7); opacity: 0; }
        to   { transform: scale(1);   opacity: 1; }
      }
      @keyframes sdbShake {
        0%,100% { transform: translateX(0); }
        25%     { transform: translateX(-7px); }
        75%     { transform: translateX(7px); }
      }

      /* 문제 패널 */
      #sdb-panel {
        position: absolute;
        left: 10px; right: 10px; bottom: 10px;
        background: rgba(255,255,255,.96);
        border: 1px solid rgba(180,180,255,.45);
        border-radius: 24px;
        padding: 16px 18px 12px;
        box-shadow: 0 -2px 20px rgba(0,0,0,.10), 0 6px 20px rgba(0,0,0,.08);
        z-index: 10;
      }

      /* 숫자 입력 */
      .sdb-inp {
        width: 62px; text-align: center;
        border: none; outline: none;
        font-size: 1.85rem; font-weight: 900;
        font-family: 'Noto Sans KR','Jua', sans-serif;
        color: #1E3A8A; background: transparent;
      }
      .sdb-inp::-webkit-inner-spin-button,
      .sdb-inp::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      .sdb-inp { -moz-appearance: textfield; }

      /* 확인 버튼 */
      #sdb-check-btn {
        margin-top: 13px; width: 100%;
        background: linear-gradient(135deg, #4F46E5, #7C3AED);
        border: none; border-radius: 50px;
        padding: 13px; font-size: 1.1rem; font-weight: 900;
        font-family: 'Noto Sans KR','Jua',sans-serif;
        color: #fff; cursor: pointer;
        box-shadow: 0 4px 14px rgba(79,70,229,.4);
        transition: transform .1s, box-shadow .1s;
        min-height: 46px;
      }
      #sdb-check-btn:active { transform: scale(.97); box-shadow: 0 2px 6px rgba(79,70,229,.25); }

      /* 정답 / 오답 플래시 */
      #sdb-ans-box.ok { border-color: #10B981 !important; background: #F0FDF4 !important; }
      #sdb-ans-box.ng {
        border-color: #EF4444 !important; background: #FFF5F5 !important;
        animation: sdbShake .32s ease;
      }
      #sdb-fb.ok { color: #047857; }
      #sdb-fb.ng { color: #B91C1C; }

      /* 작은 화면 대응 */
      @media (max-height: 640px) {
        #sdb-panel  { padding: 12px 14px 10px; bottom: 8px; }
        .sdb-inp, #sdb-q-num, #sdb-q-den { font-size: 1.5rem !important; }
        #sdb-check-btn { padding: 10px; min-height: 40px; font-size: 1rem; margin-top: 9px; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════
     이벤트 바인딩
  ══════════════════════════════════════ */
  function bindEvents() {
    checkBtn = document.getElementById('sdb-check-btn');
    checkBtn?.addEventListener('click', checkAnswer);

    const numEl = document.getElementById('sdb-ans-num');
    const denEl = document.getElementById('sdb-ans-den');

    /* Enter: 분자 → 분모 → 확인 */
    numEl?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault(); denEl?.focus();
    });
    denEl?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault(); checkAnswer();
    });

    keyHandler = e => {
      if (e.key !== 'Enter' || isGameOver) return;
      const active = document.activeElement;
      if (active === numEl)      { e.preventDefault(); denEl?.focus(); }
      else if (active === denEl) { e.preventDefault(); checkAnswer(); }
    };
    document.addEventListener('keydown', keyHandler);
  }

  function unbindEvents() {
    checkBtn?.removeEventListener('click', checkAnswer);
    if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
    checkBtn = null;
  }

  /* ══════════════════════════════════════
     문제 표시
  ══════════════════════════════════════ */
  function showQuestion(idx) {
    const q = questions[idx];
    if (!q) return;

    const lbl  = document.getElementById('sdb-step-lbl');
    const qNum = document.getElementById('sdb-q-num');
    const qDen = document.getElementById('sdb-q-den');

    if (lbl)  lbl.textContent  = `${idx + 1} / ${totalSteps}번째 발걸음`;
    if (qNum) qNum.textContent = q.num;
    if (qDen) qDen.textContent = q.den;

    clearInputs();
    clearFlash();
    setTimeout(() => document.getElementById('sdb-ans-num')?.focus(), 80);
  }

  /* ══════════════════════════════════════
     답 확인
  ══════════════════════════════════════ */
  function checkAnswer() {
    if (!cfg?.isActive?.() || isGameOver) return;
    if (currentStep >= totalSteps) return;

    const q    = questions[currentStep];
    if (!q) return;

    const numEl = document.getElementById('sdb-ans-num');
    const denEl = document.getElementById('sdb-ans-den');
    const uN    = parseInt(numEl?.value, 10);
    const uD    = parseInt(denEl?.value, 10);

    /* 입력 검증 */
    if (!Number.isFinite(uN) || !Number.isFinite(uD) || uN < 1 || uD < 1) {
      numEl?.focus(); return;
    }

    const isReduced    = gcd(uN, uD) === 1;          // 기약분수 여부
    const isEquivalent = uN * q.den === uD * q.num;  // 크기 동등 여부

    if (isReduced && isEquivalent) {
      /* ── 정답 ── */
      localCombo++;
      if (localCombo > maxCombo) maxCombo = localCombo;

      updateComboUI();
      flashBox(true);
      showFeedback(localCombo >= 3 ? `🔥 ${localCombo}연속 정답!` : '⭕ 정답!', true);

      cfg.onCorrect?.();
      cfg.onBoardStart?.();

      currentStep++;
      updateDots(currentStep);
      updateClimber(currentStep, false);
      updateProgressBar(currentStep);

      if (currentStep >= totalSteps) {
        /* 정상 도달! */
        isGameOver = true;
        setTimeout(showSummit, 650);
      } else {
        setTimeout(() => showQuestion(currentStep), 340);
      }

    } else {
      /* ── 오답 ── */
      localCombo = 0;
      updateComboUI();
      flashBox(false);

      const msg = !isEquivalent
        ? '❌ 크기가 달라요! 다시 도전!'
        : '❌ 기약분수가 아니에요!';
      showFeedback(msg, false);
      cfg.onWrong?.();

      setTimeout(() => { clearInputs(); clearFlash(); document.getElementById('sdb-ans-num')?.focus(); }, 420);
    }
  }

  /* ══════════════════════════════════════
     정상 도달 축하 화면
  ══════════════════════════════════════ */
  function showSummit() {
    const overlay = document.getElementById('sdb-summit');
    if (!overlay) return;

    /* 남은 시간 표시 (index.html에서 getTimeLeft 콜백을 전달받아야 함) */
    const tLeft = (typeof cfg?.getTimeLeft === 'function') ? cfg.getTimeLeft() : null;
    const timeStr = (typeof tLeft === 'number' && tLeft >= 0)
      ? `${tLeft}초`
      : '—';

    const resTime  = document.getElementById('sdb-res-time');
    const resCombo = document.getElementById('sdb-res-combo');
    if (resTime)  resTime.textContent  = `⏱ 남은 시간: ${timeStr}`;
    if (resCombo) resCombo.textContent = `🔥 최고 콤보: ${maxCombo}연속`;

    overlay.style.display = 'flex';

    /* 2.2초 후 결과 화면으로 */
    celebTimer = setTimeout(() => {
      if (cfg) cfg.onComplete?.();
    }, 2200);
  }

  /* ══════════════════════════════════════
     UI 업데이트 헬퍼
  ══════════════════════════════════════ */
  function clearInputs() {
    const n = document.getElementById('sdb-ans-num');
    const d = document.getElementById('sdb-ans-den');
    if (n) n.value = '';
    if (d) d.value = '';
  }

  function flashBox(ok) {
    const box = document.getElementById('sdb-ans-box');
    if (!box) return;
    box.classList.remove('ok', 'ng');
    void box.offsetWidth; // reflow
    box.classList.add(ok ? 'ok' : 'ng');
  }

  function clearFlash() {
    document.getElementById('sdb-ans-box')?.classList.remove('ok', 'ng');
    const fb = document.getElementById('sdb-fb');
    if (fb) { fb.style.opacity = '0'; fb.className = ''; }
  }

  function showFeedback(msg, ok) {
    const fb = document.getElementById('sdb-fb');
    if (!fb) return;
    fb.textContent   = msg;
    fb.className     = ok ? 'ok' : 'ng';
    fb.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (fb) fb.style.opacity = '0'; }, 1300);
  }

  function updateComboUI() {
    const wrap = document.getElementById('sdb-combo');
    const num  = document.getElementById('sdb-combo-n');
    if (!wrap || !num) return;
    if (localCombo >= 2) {
      num.textContent     = localCombo;
      wrap.style.display  = 'block';
    } else {
      wrap.style.display = 'none';
    }
  }

  function updateProgressBar(step) {
    const bar = document.getElementById('sdb-pbar');
    if (bar) bar.style.width = `${(step / totalSteps) * 100}%`;
    const ctr = document.getElementById('sdb-step-ctr');
    if (ctr) ctr.textContent = `${step} / ${totalSteps}`;
  }

  /* ══════════════════════════════════════
     경로 계산 (산 왼쪽 사면을 따라 정상까지)
  ══════════════════════════════════════ */
  function getMountainPath(n) {
    const startX = 88,  startY = 488;  // 왼쪽 기슭 (SVG 좌표)
    const endX   = 200, endY   = 50;   // 정상 근처 (SVG 좌표)
    const pts = [];

    for (let i = 0; i <= n; i++) {
      const t     = i / n;
      const baseX = startX + (endX - startX) * t;
      const baseY = startY + (endY - startY) * t;
      /* 지그재그: 정상 근처에서는 폭 줄임 */
      const zigzag = Math.sin(t * Math.PI * 4) * 16 * (1 - t * 0.65);
      pts.push({
        x: ((baseX + zigzag) / 400) * 100,  // CSS %
        y: (baseY             / 600) * 100,  // CSS %
      });
    }
    return pts;
  }

  /* ══════════════════════════════════════
     경로 점 렌더링 + 업데이트
  ══════════════════════════════════════ */
  function renderStepDots() {
    const container = document.getElementById('sdb-dots');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 1; i <= totalSteps; i++) {
      const p = pathPoints[i];
      if (!p) continue;
      const dot = document.createElement('div');
      dot.className = 'sdb-dot upcoming';
      dot.id        = `sdb-d-${i}`;
      dot.style.left = p.x + '%';
      dot.style.top  = p.y + '%';
      container.appendChild(dot);
    }
  }

  function updateDots(step) {
    for (let i = 1; i <= totalSteps; i++) {
      const dot = document.getElementById(`sdb-d-${i}`);
      if (!dot) continue;
      if      (i <  step + 1) dot.className = 'sdb-dot done';
      else if (i === step + 1) dot.className = 'sdb-dot current';
      else                     dot.className = 'sdb-dot upcoming';
    }
  }

  /* ══════════════════════════════════════
     등반가 이동
  ══════════════════════════════════════ */
  function updateClimber(step, instant) {
    const el = document.getElementById('sdb-climber');
    if (!el) return;
    const p = pathPoints[Math.min(step, totalSteps)];
    if (!p) return;

    if (instant) {
      el.style.transition = 'none';
      el.style.left = p.x + '%';
      el.style.top  = p.y + '%';
      requestAnimationFrame(() => { el.style.transition = ''; });
    } else {
      el.style.left = p.x + '%';
      el.style.top  = p.y + '%';
    }
  }

  /* ══════════════════════════════════════
     수학 유틸리티
  ══════════════════════════════════════ */
  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    return b === 0 ? a : gcd(b, a % b);
  }

  function genFraction(maxDen) {
    for (let t = 0; t < 300; t++) {
      const den = Math.floor(Math.random() * (maxDen - 3)) + 4;
      const num = Math.floor(Math.random() * (den - 1)) + 1;
      const g   = gcd(num, den);
      if (g > 1) return { num, den, ansNum: num / g, ansDen: den / g };
    }
    return { num: 6, den: 8, ansNum: 3, ansDen: 4 }; // fallback
  }

  function genQuestions(count, maxDen) {
    const seen = new Set(), qs = [];
    for (let t = 0; qs.length < count && t < 1200; t++) {
      const f   = genFraction(maxDen);
      const key = `${f.num}/${f.den}`;
      if (seen.has(key)) continue;
      seen.add(key);
      qs.push(f);
    }
    return shuffle(qs);
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

})();
