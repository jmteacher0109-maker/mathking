/**
 * 분수 산 등반 게임 모듈 v3
 * - 킹수학 플랫폼용: window.SanDeunBanGame 으로 연결
 * - 개별 HTML 버전의 산 등반 UI를 플랫폼 모듈 형태로 변환
 * - 플랫폼의 타이머/점수/결과 화면을 사용함
 */
(function () {
  'use strict';

  const LEVEL_CFG = {
    1: { maxDen: 20,  time: 120, steps: 12 },
    2: { maxDen: 36,  time: 100, steps: 15 },
    3: { maxDen: 60,  time: 90,  steps: 15 },
    4: { maxDen: 100, time: 120, steps: 20 },
  };

  let cfg = null;
  let level = 1;
  let questions = [];
  let pathPoints = [];
  let currentStep = 0;
  let totalSteps = 12;
  let localCombo = 0;
  let wrongCount = 0;

  let checkBtn = null;
  let keyHandler = null;
  let toastTimer = null;

  window.SanDeunBanGame = {
    duration: 120,

    init(config) {
      cfg = config;
      level = Number(config.options?.level || 1);
      const lcfg = LEVEL_CFG[level] || LEVEL_CFG[1];

      this.duration = lcfg.time;
      totalSteps = lcfg.steps;
      currentStep = 0;
      localCombo = 0;
      wrongCount = 0;
      questions = genQuestions(totalSteps, lcfg.maxDen);
      pathPoints = getMountainPath(totalSteps);

      cfg.hideFooter?.();
      injectStyles();

      const board = cfg.boardEl;
      const wrap = board.parentElement;

      wrap.style.cssText = `
        flex: 1;
        padding: 0;
        min-height: 0;
        min-width: 0;
        display: flex;
        align-items: stretch;
        justify-content: stretch;
      `;

      board.style.cssText = `
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 360px;
        border-radius: 0;
        overflow: hidden;
        background: linear-gradient(180deg, #87CEEB 0%, #B8E0F7 42%, #D4EDD4 72%, #8FBC8F 100%);
        box-shadow: none;
        touch-action: manipulation;
      `;

      board.innerHTML = makeUI();

      bindEvents();
      cfg.onBoardStart?.();

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
      clearInputs();
      clearFlash();
      const numEl = document.getElementById('sdb-ans-num');
      numEl?.focus();
    },

    destroy() {
      unbindEvents();
      clearTimeout(toastTimer);

      const board = cfg?.boardEl;
      const wrap = board?.parentElement;

      if (board) {
        board.innerHTML = '';
        board.style.cssText = '';
      }

      if (wrap) {
        wrap.style.cssText = '';
      }

      document.getElementById('sdb-platform-styles')?.remove();
      cfg?.showFooter?.();

      cfg = null;
      questions = [];
      pathPoints = [];
      currentStep = 0;
      localCombo = 0;
      wrongCount = 0;
    },
  };

  function makeUI() {
    return `
      <svg id="sdb-mountain-canvas" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="sdbSkyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#87CEEB"/>
            <stop offset="100%" stop-color="#D4EDD4"/>
          </linearGradient>
          <linearGradient id="sdbMtnGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#8FA88F"/>
            <stop offset="100%" stop-color="#5A7A5A"/>
          </linearGradient>
        </defs>

        <rect width="400" height="600" fill="url(#sdbSkyGrad)"/>

        <ellipse cx="80" cy="80" rx="50" ry="22" fill="white" opacity="0.70"/>
        <ellipse cx="110" cy="72" rx="34" ry="18" fill="white" opacity="0.82"/>
        <ellipse cx="310" cy="100" rx="44" ry="18" fill="white" opacity="0.62"/>
        <ellipse cx="340" cy="93" rx="28" ry="15" fill="white" opacity="0.70"/>

        <polygon points="200,40 30,520 370,520" fill="url(#sdbMtnGrad)"/>
        <polygon points="200,40 175,110 225,110" fill="white" opacity="0.95"/>
        <polygon points="200,40 200,520 370,520" fill="rgba(0,0,0,0.08)"/>

        <polygon points="60,300 0,520 150,520" fill="#4A6741" opacity="0.60"/>
        <polygon points="340,280 250,520 400,520" fill="#4A6741" opacity="0.55"/>

        <rect x="0" y="520" width="400" height="80" fill="#5A7A5A"/>

        <polygon points="50,480 42,520 58,520" fill="#2d5a2d"/>
        <polygon points="70,470 62,520 78,520" fill="#2d5a2d"/>
        <polygon points="330,475 322,520 338,520" fill="#2d5a2d"/>
        <polygon points="350,468 342,520 358,520" fill="#2d5a2d"/>

        <line x1="200" y1="40" x2="200" y2="18" stroke="#8B6914" stroke-width="2.5"/>
        <polygon points="200,18 218,25 200,32" fill="#FF6B35"/>
      </svg>

      <div id="sdb-step-dots"></div>
      <div id="sdb-climber">🧗</div>

      <div class="sdb-progress">
        <span class="sdb-progress-label">🏕️ 출발</span>
        <div class="sdb-progress-track">
          <div class="sdb-progress-fill" id="sdb-progress-fill"></div>
        </div>
        <span class="sdb-progress-label">🏔️ 정상</span>
      </div>

      <div id="sdb-question-panel">
        <div class="sdb-q-step" id="sdb-q-step">1 / ${totalSteps}번째 발걸음</div>
        <div class="sdb-q-prompt">기약분수로 나타내세요</div>

        <div class="sdb-fraction-row">
          <div class="sdb-frac-box">
            <div class="sdb-frac-n" id="sdb-q-num">6</div>
            <div class="sdb-frac-line"></div>
            <div class="sdb-frac-d" id="sdb-q-den">8</div>
          </div>

          <div class="sdb-arrow">→</div>

          <div class="sdb-answer-box" id="sdb-answer-box">
            <input class="sdb-ans-input" id="sdb-ans-num" type="number" min="1" inputmode="numeric" placeholder="?">
            <div class="sdb-ans-line"></div>
            <input class="sdb-ans-input" id="sdb-ans-den" type="number" min="1" inputmode="numeric" placeholder="?">
          </div>
        </div>

        <button id="sdb-check-btn">확인 ✓</button>
      </div>

      <div id="sdb-feedback-toast"></div>
    `;
  }

  function injectStyles() {
    if (document.getElementById('sdb-platform-styles')) return;

    const style = document.createElement('style');
    style.id = 'sdb-platform-styles';
    style.textContent = `
      #sdb-mountain-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      #sdb-step-dots {
        position: absolute;
        inset: 0;
        z-index: 5;
        pointer-events: none;
      }

      .sdb-step-dot {
        position: absolute;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 2px 6px rgba(0,0,0,.3);
        transform: translate(-50%, -50%);
        transition: background .3s, transform .2s, width .2s, height .2s;
      }

      .sdb-step-dot.done {
        background: #FFD700;
      }

      .sdb-step-dot.current {
        background: #FF6B35;
        width: 18px;
        height: 18px;
        animation: sdbDotPulse 1s infinite;
      }

      .sdb-step-dot.upcoming {
        background: rgba(255,255,255,.55);
      }

      @keyframes sdbDotPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(255,107,53,.6); }
        50% { box-shadow: 0 0 0 8px rgba(255,107,53,0); }
      }

      #sdb-climber {
        position: absolute;
        font-size: 2rem;
        transform: translate(-50%, -100%);
        transition: left .7s cubic-bezier(.4,0,.2,1), top .7s cubic-bezier(.4,0,.2,1);
        z-index: 8;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,.4));
        pointer-events: none;
      }

      .sdb-progress {
        position: absolute;
        left: 12px;
        right: 12px;
        bottom: 218px;
        display: flex;
        align-items: center;
        gap: 6px;
        z-index: 9;
        pointer-events: none;
      }

      .sdb-progress-label {
        font-size: .75rem;
        font-weight: 700;
        color: #fff;
        text-shadow: 0 1px 4px rgba(0,0,0,.55);
        white-space: nowrap;
        font-family: 'Noto Sans KR', sans-serif;
      }

      .sdb-progress-track {
        flex: 1;
        height: 8px;
        background: rgba(255,255,255,.35);
        border-radius: 10px;
        overflow: hidden;
      }

      .sdb-progress-fill {
        width: 0%;
        height: 100%;
        background: linear-gradient(90deg,#FFD700,#FF6B35);
        border-radius: 10px;
        transition: width .6s ease;
      }

      #sdb-question-panel {
        position: absolute;
        left: 12px;
        right: 12px;
        bottom: 16px;
        background: rgba(255,255,255,.93);
        border: 1px solid rgba(255,255,255,.5);
        border-radius: 24px;
        padding: 18px 20px 14px;
        box-shadow: 0 -2px 30px rgba(0,0,0,.10), 0 4px 20px rgba(0,0,0,.12);
        z-index: 10;
        font-family: 'Noto Sans KR', 'Jua', sans-serif;
      }

      .sdb-q-step {
        font-size: .8rem;
        color: #777;
        font-weight: 700;
        text-align: center;
        margin-bottom: 5px;
      }

      .sdb-q-prompt {
        font-size: .95rem;
        color: #555;
        text-align: center;
        margin-bottom: 12px;
        font-weight: 700;
      }

      .sdb-fraction-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
      }

      .sdb-frac-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        background: #f0f4ff;
        border: 1px solid #dde3ff;
        border-radius: 14px;
        padding: 10px 18px;
      }

      .sdb-frac-n,
      .sdb-frac-d {
        font-size: 1.65rem;
        font-weight: 900;
        color: #2C3E50;
        line-height: 1.1;
      }

      .sdb-frac-line {
        width: 50px;
        height: 3px;
        background: #2C3E50;
        border-radius: 2px;
        margin: 4px 0;
      }

      .sdb-arrow {
        font-size: 1.4rem;
        color: #999;
        font-weight: 900;
      }

      .sdb-answer-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        background: #fff;
        border: 2px solid #dde3ff;
        border-radius: 14px;
        padding: 8px 14px;
        transition: border-color .2s, background .2s;
      }

      .sdb-answer-box.correct-flash {
        border-color: #2ECC71;
        background: #f0fff7;
      }

      .sdb-answer-box.wrong-flash {
        border-color: #e74c3c;
        background: #fff5f5;
        animation: sdbShake .3s;
      }

      @keyframes sdbShake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-6px); }
        75% { transform: translateX(6px); }
      }

      .sdb-ans-input {
        width: 64px;
        text-align: center;
        border: none;
        outline: none;
        font-size: 1.65rem;
        font-weight: 900;
        font-family: 'Noto Sans KR', 'Jua', sans-serif;
        color: #2C3E50;
        background: transparent;
      }

      .sdb-ans-line {
        width: 50px;
        height: 3px;
        background: #bbb;
        border-radius: 2px;
        margin: 4px 0;
      }

      .sdb-ans-input::-webkit-inner-spin-button,
      .sdb-ans-input::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      .sdb-ans-input {
        -moz-appearance: textfield;
      }

      #sdb-check-btn {
        margin-top: 14px;
        width: 100%;
        background: linear-gradient(135deg, #5B6EF5, #7B8EFF);
        border: none;
        border-radius: 50px;
        padding: 14px;
        font-size: 1.1rem;
        font-weight: 900;
        font-family: 'Noto Sans KR', 'Jua', sans-serif;
        color: #fff;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(91,110,245,.35);
        transition: transform .12s, box-shadow .12s;
        min-height: 48px;
      }

      #sdb-check-btn:active {
        transform: scale(.97);
        box-shadow: 0 2px 6px rgba(91,110,245,.3);
      }

      #sdb-feedback-toast {
        position: absolute;
        top: 16px;
        left: 50%;
        transform: translateX(-50%) scale(0);
        opacity: 0;
        background: #2ECC71;
        color: #fff;
        font-size: 1.25rem;
        font-weight: 900;
        padding: 10px 24px;
        border-radius: 50px;
        z-index: 20;
        pointer-events: none;
        font-family: 'Noto Sans KR', 'Jua', sans-serif;
        white-space: nowrap;
        box-shadow: 0 4px 20px rgba(46,204,113,.5);
        transition: transform .2s cubic-bezier(.175,.885,.32,1.275), opacity .25s;
      }

      #sdb-feedback-toast.wrong {
        background: #e74c3c;
        box-shadow: 0 4px 20px rgba(231,76,60,.5);
      }

      @media (max-height: 650px) {
        .sdb-progress {
          bottom: 196px;
        }

        #sdb-question-panel {
          padding: 14px 16px 12px;
        }

        .sdb-q-prompt {
          margin-bottom: 8px;
        }

        #sdb-check-btn {
          padding: 11px;
          min-height: 42px;
          margin-top: 10px;
        }

        .sdb-frac-n,
        .sdb-frac-d,
        .sdb-ans-input {
          font-size: 1.45rem;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function bindEvents() {
    checkBtn = document.getElementById('sdb-check-btn');
    checkBtn?.addEventListener('click', checkAnswer);

    const numEl = document.getElementById('sdb-ans-num');
    const denEl = document.getElementById('sdb-ans-den');

    numEl?.addEventListener('keydown', handleInputKey);
    denEl?.addEventListener('keydown', handleInputKey);

    keyHandler = e => {
      if (e.key !== 'Enter') return;
      if (!cfg?.boardEl?.contains(document.activeElement)) return;
      e.preventDefault();

      if (document.activeElement === numEl) {
        denEl?.focus();
      } else {
        checkAnswer();
      }
    };

    document.addEventListener('keydown', keyHandler);
  }

  function unbindEvents() {
    checkBtn?.removeEventListener('click', checkAnswer);

    const numEl = document.getElementById('sdb-ans-num');
    const denEl = document.getElementById('sdb-ans-den');

    numEl?.removeEventListener('keydown', handleInputKey);
    denEl?.removeEventListener('keydown', handleInputKey);

    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }

    checkBtn = null;
  }

  function handleInputKey(e) {
    if (e.key !== 'Enter') return;

    e.preventDefault();

    const numEl = document.getElementById('sdb-ans-num');
    const denEl = document.getElementById('sdb-ans-den');

    if (document.activeElement === numEl) {
      denEl?.focus();
    } else {
      checkAnswer();
    }
  }

  function showQuestion(idx) {
    const q = questions[idx];
    if (!q) return;

    const stepEl = document.getElementById('sdb-q-step');
    const qNumEl = document.getElementById('sdb-q-num');
    const qDenEl = document.getElementById('sdb-q-den');

    if (stepEl) stepEl.textContent = `${idx + 1} / ${totalSteps}번째 발걸음`;
    if (qNumEl) qNumEl.textContent = q.num;
    if (qDenEl) qDenEl.textContent = q.den;

    clearInputs();
    clearFlash();

    setTimeout(() => document.getElementById('sdb-ans-num')?.focus(), 80);
  }

  function checkAnswer() {
    if (!cfg?.isActive?.()) return;
    if (currentStep >= totalSteps) return;

    const q = questions[currentStep];
    if (!q) return;

    const numEl = document.getElementById('sdb-ans-num');
    const denEl = document.getElementById('sdb-ans-den');

    const userNum = parseInt(numEl?.value, 10);
    const userDen = parseInt(denEl?.value, 10);

    if (!Number.isFinite(userNum) || !Number.isFinite(userDen) || userNum < 1 || userDen < 1) {
      numEl?.focus();
      return;
    }

    const isReduced = gcd(userNum, userDen) === 1;
    const isEquivalent = userNum * q.den === userDen * q.num;

    if (isReduced && isEquivalent) {
      localCombo++;
      flashBox(true);
      cfg.onCorrect?.();

      currentStep++;
      updateDots(currentStep);
      updateClimber(currentStep, false);
      updateProgressBar(currentStep);

      showToast(localCombo >= 3 ? `🔥 ${localCombo}연속!` : '⭕ 정답!', false);

      if (currentStep >= totalSteps) {
        showToast('🏆 정상 등반!', false);
        setTimeout(() => {
          cfg?.onComplete?.();
        }, 700);
      } else {
        cfg.onBoardStart?.();
        setTimeout(() => showQuestion(currentStep), 360);
      }
    } else {
      localCombo = 0;
      wrongCount++;
      flashBox(false);
      cfg.onWrong?.();

      showToast(!isEquivalent ? '❌ 크기가 달라요!' : '❌ 기약분수가 아니에요!', true);

      setTimeout(() => {
        clearInputs();
        clearFlash();
        numEl?.focus();
      }, 420);
    }
  }

  function clearInputs() {
    const numEl = document.getElementById('sdb-ans-num');
    const denEl = document.getElementById('sdb-ans-den');

    if (numEl) numEl.value = '';
    if (denEl) denEl.value = '';
  }

  function flashBox(ok) {
    const box = document.getElementById('sdb-answer-box');
    if (!box) return;

    box.classList.remove('correct-flash', 'wrong-flash');
    void box.offsetWidth;
    box.classList.add(ok ? 'correct-flash' : 'wrong-flash');
  }

  function clearFlash() {
    const box = document.getElementById('sdb-answer-box');
    if (!box) return;

    box.classList.remove('correct-flash', 'wrong-flash');
  }

  function showToast(message, isWrong) {
    const toast = document.getElementById('sdb-feedback-toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = isWrong ? 'wrong' : '';

    clearTimeout(toastTimer);

    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(-50%) scale(1)';
      toast.style.opacity = '1';

      toastTimer = setTimeout(() => {
        toast.style.transform = 'translateX(-50%) scale(.8)';
        toast.style.opacity = '0';
      }, 720);
    });
  }

  function getMountainPath(n) {
    const pts = [];

    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const xBase = 200 + (t < 0.5 ? (0.5 - t) * 60 : (t - 0.5) * -40);
      const x = xBase + Math.sin(t * Math.PI * 3) * 12;
      const y = 88 - t * 78;
      pts.push({ x: (x / 400) * 100, y });
    }

    return pts;
  }

  function renderStepDots() {
    const container = document.getElementById('sdb-step-dots');
    if (!container) return;

    container.innerHTML = '';

    for (let i = 1; i <= totalSteps; i++) {
      const p = pathPoints[i];
      if (!p) continue;

      const dot = document.createElement('div');
      dot.className = 'sdb-step-dot upcoming';
      dot.id = `sdb-dot-${i}`;
      dot.style.left = p.x + '%';
      dot.style.top = p.y + '%';
      container.appendChild(dot);
    }
  }

  function updateDots(step) {
    for (let i = 1; i <= totalSteps; i++) {
      const dot = document.getElementById(`sdb-dot-${i}`);
      if (!dot) continue;

      if (i < step) {
        dot.className = 'sdb-step-dot done';
      } else if (i === step) {
        dot.className = 'sdb-step-dot current';
      } else {
        dot.className = 'sdb-step-dot upcoming';
      }
    }
  }

  function updateClimber(step, instant) {
    const climber = document.getElementById('sdb-climber');
    if (!climber) return;

    const p = pathPoints[Math.min(step, totalSteps)];
    if (!p) return;

    if (instant) {
      climber.style.transition = 'none';
      climber.style.left = p.x + '%';
      climber.style.top = p.y + '%';

      requestAnimationFrame(() => {
        climber.style.transition = '';
      });
    } else {
      climber.style.left = p.x + '%';
      climber.style.top = p.y + '%';
    }
  }

  function updateProgressBar(step) {
    const fill = document.getElementById('sdb-progress-fill');
    if (!fill) return;

    fill.style.width = (step / totalSteps * 100) + '%';
  }

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    return b === 0 ? a : gcd(b, a % b);
  }

  function genFraction(maxDen) {
    let tries = 0;

    while (tries++ < 200) {
      const den = Math.floor(Math.random() * (maxDen - 3)) + 4;
      const num = Math.floor(Math.random() * (den - 1)) + 1;
      const g = gcd(num, den);

      if (g > 1) {
        return { num, den, ansNum: num / g, ansDen: den / g };
      }
    }

    return { num: 6, den: 8, ansNum: 3, ansDen: 4 };
  }

  function genQuestions(count, maxDen) {
    const seen = new Set();
    const qs = [];
    let tries = 0;

    while (qs.length < count && tries++ < 800) {
      const f = genFraction(maxDen);
      const key = `${f.num}/${f.den}`;

      if (seen.has(key)) continue;

      seen.add(key);
      qs.push(f);
    }

    return shuffle(qs);
  }

  function shuffle(arr) {
    const copy = [...arr];

    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
  }
})();
