/**
 * 분수 산 등반 게임 모듈 v1
 * window.SandeungbanGame 으로 index.html 과 통신
 *
 * 플레이어가 기약분수를 입력해서 등산 캐릭터를 정상까지 올리는 게임
 * ─ 레벨별 분모 범위 / 문제 수
 * ─ 솔로: 레벨에 따라 타이머가 달라짐 (duration 프로퍼티로 전달)
 * ─ 멀티: index.html 의 60초 타이머 사용, 점수로 랭킹 비교
 */
(function () {
  'use strict';

  /* ── 레벨 설정 ── */
  const LEVEL_CFG = {
    1: { maxDen: 20,  time: 120, steps: 12 },
    2: { maxDen: 36,  time: 100, steps: 15 },
    3: { maxDen: 60,  time: 90,  steps: 15 },
    4: { maxDen: 100, time: 120, steps: 20 },
  };

  /* ── 상태 ── */
  let cfg         = null;
  let questions   = [];
  let currentStep = 0;
  let totalSteps  = 12;
  let wrongCount  = 0;
  let maxCombo    = 0;
  let localCombo  = 0;  // 연속 정답 (산등반용 UI용, 플랫폼 combo 와 별개)

  /* ── 이벤트 핸들러 참조 (cleanup 용) ── */
  let _checkBtn  = null;
  let _keyHandler = null;

  /* ════════════════════════════
     PUBLIC INTERFACE
  ════════════════════════════ */
  window.SanDeunBanGame = {

    /** 솔로용 타이머 (index.html 이 duration 프로퍼티를 읽음) */
    duration: 120,

    init(config) {
      cfg = config;
      const lv  = config.options?.level || 1;
      const lcfg = LEVEL_CFG[lv] || LEVEL_CFG[1];

      this.duration = lcfg.time;
      totalSteps    = lcfg.steps;
      currentStep   = 0;
      wrongCount    = 0;
      maxCombo      = 0;
      localCombo    = 0;

      questions = _genQuestions(totalSteps, lcfg.maxDen);

      // 레이아웃 전환: board-wrap 을 full-size 로, game-foot 숨기기
      const board = cfg.boardEl;
      const wrap  = board.parentElement;
      wrap.style.cssText  = 'flex:1;padding:0;min-height:0;min-width:0;align-items:stretch;justify-content:stretch;';
      board.style.cssText = 'position:relative;width:100%;height:100%;border-radius:0;overflow:hidden;background:transparent;box-shadow:none;touch-action:none;';

      if (cfg.hideFooter) cfg.hideFooter();

      _injectStyles();
      _injectUI();
      cfg.onBoardStart();

      // rAF: DOM 완전 배치 후 첫 문제 표시
      requestAnimationFrame(() => {
        _renderDots();
        _moveClimber(0, true);
        _showQuestion(0);
      });
    },

    resetBoard() {
      // 입력 초기화
      const numEl = document.getElementById('sdb-num');
      const denEl = document.getElementById('sdb-den');
      if (numEl) { numEl.value = ''; numEl.focus(); }
      if (denEl) denEl.value = '';
      _clearFlash();
    },

    destroy() {
      if (_checkBtn)   _checkBtn.removeEventListener('click', _check);
      if (_keyHandler) document.removeEventListener('keydown', _keyHandler);

      // 주입한 HTML 제거
      const board = cfg?.boardEl;
      if (board) {
        board.innerHTML = '';
        board.style.cssText = '';
      }
      const wrap = board?.parentElement;
      if (wrap) wrap.style.cssText = '';

      if (cfg?.showFooter) cfg.showFooter();

      // 스타일 제거
      const styleEl = document.getElementById('sdb-styles');
      if (styleEl) styleEl.remove();

      cfg = null;
    },
  };

  /* ════════════════════════════
     수학 유틸
  ════════════════════════════ */
  function _gcd(a, b) { return b === 0 ? a : _gcd(b, a % b); }

  function _genFrac(maxDen) {
    let tries = 0;
    while (tries++ < 200) {
      const d = Math.floor(Math.random() * (maxDen - 3)) + 4;
      const n = Math.floor(Math.random() * (d - 1)) + 1;
      const g = _gcd(n, d);
      if (g > 1) return { n, d, an: n / g, ad: d / g };
    }
    return { n: 6, d: 8, an: 3, ad: 4 };
  }

  function _genQuestions(cnt, maxDen) {
    const seen = new Set();
    const qs   = [];
    let tries  = 0;
    while (qs.length < cnt && tries++ < 600) {
      const f = _genFrac(maxDen);
      const k = `${f.n}/${f.d}`;
      if (!seen.has(k)) { seen.add(k); qs.push(f); }
    }
    return qs.sort(() => Math.random() - .5);
  }

  /* ════════════════════════════
     산 경로 좌표 (퍼센트)
     t=0: 기슭(하단) → t=1: 정상(상단)
  ════════════════════════════ */
  function _getPath(n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t    = i / n;
      const xBase = 50 + (t < .5 ? (.5 - t) * 18 : (t - .5) * -14);
      const x    = xBase + Math.sin(t * Math.PI * 3) * 4;
      const y    = 83 - t * 71;  // 83% 기슭 → 12% 정상
      pts.push({ x, y });
    }
    return pts;
  }

  /* ════════════════════════════
     UI 주입
  ════════════════════════════ */
  function _injectUI() {
    const board = cfg.boardEl;
    board.innerHTML = `
      <!-- 산 배경 SVG -->
      <svg id="sdb-svg" style="position:absolute;inset:0;width:100%;height:100%;"
           viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice"
           xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="sdb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0d1f3c"/>
            <stop offset="60%" stop-color="#1a3a5c"/>
            <stop offset="100%" stop-color="#2d5a3d"/>
          </linearGradient>
          <linearGradient id="sdb-mtn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#8fa88f"/>
            <stop offset="100%" stop-color="#4a6a4a"/>
          </linearGradient>
        </defs>
        <rect width="400" height="600" fill="url(#sdb-sky)"/>
        <!-- 별 -->
        <circle cx="60"  cy="40"  r="1.5" fill="white" opacity=".7"/>
        <circle cx="130" cy="25"  r="1"   fill="white" opacity=".6"/>
        <circle cx="200" cy="55"  r="1.5" fill="white" opacity=".5"/>
        <circle cx="290" cy="35"  r="1"   fill="white" opacity=".7"/>
        <circle cx="350" cy="20"  r="1.5" fill="white" opacity=".6"/>
        <circle cx="80"  cy="70"  r="1"   fill="white" opacity=".5"/>
        <circle cx="320" cy="65"  r="1"   fill="white" opacity=".6"/>
        <!-- 구름 -->
        <ellipse cx="80"  cy="80" rx="50" ry="20" fill="white" opacity=".12"/>
        <ellipse cx="310" cy="95" rx="42" ry="18" fill="white" opacity=".10"/>
        <!-- 메인 산 -->
        <polygon points="200,38 25,520 375,520" fill="url(#sdb-mtn)"/>
        <!-- 설산 -->
        <polygon points="200,38 174,105 226,105" fill="white" opacity=".92"/>
        <!-- 그림자 -->
        <polygon points="200,38 200,520 375,520" fill="rgba(0,0,0,0.12)"/>
        <!-- 사이드 언덕 -->
        <polygon points="55,305 0,520 145,520" fill="#3a5a3a" opacity=".65"/>
        <polygon points="345,285 255,520 400,520" fill="#3a5a3a" opacity=".60"/>
        <!-- 지면 -->
        <rect x="0" y="520" width="400" height="80" fill="#2d4a2d"/>
        <!-- 나무 -->
        <polygon points="48,482 40,520 56,520"  fill="#1d3d1d"/>
        <polygon points="68,472 60,520 76,520"  fill="#1d3d1d"/>
        <polygon points="332,477 324,520 340,520" fill="#1d3d1d"/>
        <polygon points="352,470 344,520 360,520" fill="#1d3d1d"/>
        <!-- 깃발 -->
        <line x1="200" y1="38" x2="200" y2="15" stroke="#b8961e" stroke-width="2.5"/>
        <polygon points="200,15 220,22 200,29" fill="#FF6B35"/>
      </svg>

      <!-- 진행 점 -->
      <div id="sdb-dots" style="position:absolute;inset:0;pointer-events:none;z-index:6;"></div>

      <!-- 등산객 -->
      <div id="sdb-climber" style="position:absolute;font-size:1.9rem;transform:translate(-50%,-100%);transition:left .6s cubic-bezier(.4,0,.2,1),top .6s cubic-bezier(.4,0,.2,1);z-index:8;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6));pointer-events:none;">🧗</div>

      <!-- 진행 바 -->
      <div id="sdb-progbar" style="position:absolute;bottom:178px;left:10px;right:10px;display:flex;align-items:center;gap:6px;z-index:9;pointer-events:none;">
        <span style="font-size:.72rem;color:rgba(255,255,255,.7);text-shadow:0 1px 4px rgba(0,0,0,.8);white-space:nowrap;">🏕️ 출발</span>
        <div style="flex:1;height:7px;background:rgba(255,255,255,.2);border-radius:10px;overflow:hidden;">
          <div id="sdb-prog-fill" style="height:100%;background:linear-gradient(90deg,#FFD700,#FF6B35);border-radius:10px;width:0%;transition:width .5s ease;"></div>
        </div>
        <span style="font-size:.72rem;color:rgba(255,255,255,.7);text-shadow:0 1px 4px rgba(0,0,0,.8);white-space:nowrap;">🏔️ 정상</span>
      </div>

      <!-- 질문 패널 -->
      <div id="sdb-panel" style="position:absolute;bottom:10px;left:10px;right:10px;background:rgba(22,27,34,.96);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:14px 16px 12px;z-index:10;">
        <div id="sdb-step-lbl" style="font-size:.78rem;color:#8b949e;text-align:center;margin-bottom:6px;font-family:'Noto Sans KR',sans-serif;">1 / ${totalSteps}번째 발걸음</div>
        <div style="font-size:.85rem;color:#aaa;text-align:center;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;">기약분수로 나타내세요</div>

        <div style="display:flex;align-items:center;justify-content:center;gap:14px;">
          <!-- 문제 분수 -->
          <div style="background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.25);border-radius:12px;padding:10px 18px;display:flex;flex-direction:column;align-items:center;">
            <div id="sdb-qn" style="font-size:1.7rem;font-weight:900;color:#e6edf3;line-height:1.1;">6</div>
            <div style="width:44px;height:3px;background:#e6edf3;border-radius:2px;margin:4px 0;"></div>
            <div id="sdb-qd" style="font-size:1.7rem;font-weight:900;color:#e6edf3;line-height:1.1;">8</div>
          </div>

          <span style="font-size:1.3rem;color:#555;">→</span>

          <!-- 답 입력 -->
          <div id="sdb-ans-box" style="background:#1c2128;border:1.5px solid #30363d;border-radius:12px;padding:8px 14px;display:flex;flex-direction:column;align-items:center;transition:border-color .2s;">
            <input id="sdb-num" type="number" min="1" inputmode="numeric" placeholder="?"
              style="width:58px;text-align:center;border:none;outline:none;font-size:1.7rem;font-weight:900;font-family:'Jua',sans-serif;color:#e6edf3;background:transparent;">
            <div style="width:44px;height:3px;background:#8b949e;border-radius:2px;margin:4px 0;"></div>
            <input id="sdb-den" type="number" min="1" inputmode="numeric" placeholder="?"
              style="width:58px;text-align:center;border:none;outline:none;font-size:1.7rem;font-weight:900;font-family:'Jua',sans-serif;color:#e6edf3;background:transparent;">
          </div>
        </div>

        <button id="sdb-check-btn" style="margin-top:12px;width:100%;padding:12px;background:linear-gradient(135deg,#7c3aed,#a78bfa);border:none;border-radius:50px;font-size:1.1rem;font-weight:900;font-family:'Jua',sans-serif;color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(124,58,237,.35);transition:transform .12s,box-shadow .12s;min-height:46px;">
          확인 ✓
        </button>
      </div>

      <!-- 피드백 토스트 -->
      <div id="sdb-toast" style="position:absolute;top:10px;left:50%;transform:translateX(-50%) scale(0);background:#34d399;color:#000;font-size:1.2rem;font-weight:900;font-family:'Jua',sans-serif;padding:8px 22px;border-radius:50px;z-index:20;pointer-events:none;white-space:nowrap;transition:transform .2s cubic-bezier(.175,.885,.32,1.275),opacity .2s;opacity:0;"></div>
    `;

    // 버튼 이벤트 등록
    _checkBtn = document.getElementById('sdb-check-btn');
    _checkBtn.addEventListener('click', _check);
    _checkBtn.addEventListener('mousedown', e => { e.currentTarget.style.transform='scale(.97)'; e.currentTarget.style.boxShadow='0 2px 6px rgba(124,58,237,.3)'; });
    _checkBtn.addEventListener('mouseup',   e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; });

    // Enter 키 지원
    _keyHandler = e => {
      if (e.key === 'Enter' && cfg?.isActive()) {
        const numEl = document.getElementById('sdb-num');
        const denEl = document.getElementById('sdb-den');
        if (document.activeElement === numEl) { denEl?.focus(); return; }
        _check();
      }
    };
    document.addEventListener('keydown', _keyHandler);

    // Tab: 분자→분모 이동
    document.getElementById('sdb-num').addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); document.getElementById('sdb-den').focus(); }
    });
  }

  /* ════════════════════════════
     진행 점 렌더링
  ════════════════════════════ */
  function _renderDots() {
    const cont  = document.getElementById('sdb-dots');
    if (!cont) return;
    cont.innerHTML = '';
    const pts = _getPath(totalSteps);

    for (let i = 1; i <= totalSteps; i++) {
      const p   = pts[i];
      const dot = document.createElement('div');
      dot.id    = `sdb-dot-${i}`;
      dot.style.cssText = `
        position:absolute;
        left:${p.x}%; top:${p.y}%;
        width:12px; height:12px;
        background:rgba(255,255,255,.35);
        border:2px solid rgba(255,255,255,.5);
        border-radius:50%;
        transform:translate(-50%,-50%);
        transition:background .3s, transform .2s;
        box-shadow:0 2px 6px rgba(0,0,0,.4);
      `;
      cont.appendChild(dot);
    }
  }

  function _updateDots(step) {
    for (let i = 1; i <= totalSteps; i++) {
      const d = document.getElementById(`sdb-dot-${i}`);
      if (!d) continue;
      if (i < step) {
        d.style.background = '#FFD700';
        d.style.borderColor = '#FFD700';
        d.style.transform = 'translate(-50%,-50%) scale(1)';
      } else if (i === step) {
        d.style.background = '#FF6B35';
        d.style.borderColor = '#fff';
        d.style.transform = 'translate(-50%,-50%) scale(1.4)';
      } else {
        d.style.background = 'rgba(255,255,255,.35)';
        d.style.borderColor = 'rgba(255,255,255,.5)';
        d.style.transform = 'translate(-50%,-50%) scale(1)';
      }
    }
  }

  /* ════════════════════════════
     등산객 이동
  ════════════════════════════ */
  function _moveClimber(step, instant) {
    const climber = document.getElementById('sdb-climber');
    if (!climber) return;
    const pts = _getPath(totalSteps);
    const p   = pts[Math.min(step, totalSteps)];
    if (instant) {
      climber.style.transition = 'none';
      climber.style.left = p.x + '%';
      climber.style.top  = p.y + '%';
      requestAnimationFrame(() => { climber.style.transition = ''; });
    } else {
      climber.style.left = p.x + '%';
      climber.style.top  = p.y + '%';
    }
  }

  /* ════════════════════════════
     진행 바 업데이트
  ════════════════════════════ */
  function _updateProgBar(step) {
    const fill = document.getElementById('sdb-prog-fill');
    if (fill) fill.style.width = (step / totalSteps * 100) + '%';
  }

  /* ════════════════════════════
     문제 표시
  ════════════════════════════ */
  function _showQuestion(idx) {
    const q = questions[idx];
    if (!q) return;
    const lbl = document.getElementById('sdb-step-lbl');
    if (lbl) lbl.textContent = `${idx + 1} / ${totalSteps}번째 발걸음`;
    const qn = document.getElementById('sdb-qn');
    const qd = document.getElementById('sdb-qd');
    if (qn) qn.textContent = q.n;
    if (qd) qd.textContent = q.d;
    const numEl = document.getElementById('sdb-num');
    const denEl = document.getElementById('sdb-den');
    if (numEl) { numEl.value = ''; }
    if (denEl) { denEl.value = ''; }
    _clearFlash();
    setTimeout(() => numEl?.focus(), 80);
  }

  /* ════════════════════════════
     정답 확인
  ════════════════════════════ */
  function _check() {
    if (!cfg?.isActive()) return;
    if (currentStep >= totalSteps) return;

    const q    = questions[currentStep];
    const numEl = document.getElementById('sdb-num');
    const denEl = document.getElementById('sdb-den');
    const uNum = parseInt(numEl?.value);
    const uDen = parseInt(denEl?.value);

    if (!uNum || !uDen || uNum < 1 || uDen < 1) { numEl?.focus(); return; }

    const g        = _gcd(uNum, uDen);
    const reduced  = g === 1;
    const equiv    = uNum * q.d === uDen * q.n;

    if (reduced && equiv) {
      // ✅ 정답
      localCombo++;
      if (localCombo > maxCombo) maxCombo = localCombo;
      _flashBox(true);

      const gained = cfg.onCorrect(); // 플랫폼에 점수 위임
      _showToast(localCombo >= 3 ? `🔥 ${localCombo}연속!` : '⭕ 정답!', false);

      currentStep++;
      _updateDots(currentStep);
      _moveClimber(currentStep, false);
      _updateProgBar(currentStep);

      if (currentStep >= totalSteps) {
        // 판 클리어
        _showToast('🏆 정상 등반!', false);
        cfg.onBoardStart(); // 기준점 갱신
        setTimeout(() => {
          if (!cfg?.isActive()) return;
          // 문제 재생성 (계속 플레이)
          const lv   = cfg.options?.level || 1;
          const lcfg = LEVEL_CFG[lv] || LEVEL_CFG[1];
          questions   = _genQuestions(totalSteps, lcfg.maxDen);
          currentStep = 0;
          _renderDots();
          _moveClimber(0, true);
          _updateProgBar(0);
          _showQuestion(0);
        }, 800);
      } else {
        setTimeout(() => _showQuestion(currentStep), 350);
      }

    } else {
      // ❌ 오답
      localCombo = 0;
      wrongCount++;
      _flashBox(false);
      _showToast(
        !equiv ? '❌ 크기가 달라요!' : '❌ 기약분수가 아니에요!',
        true
      );
      cfg.onWrong();
      setTimeout(() => {
        _clearFlash();
        if (numEl) { numEl.value = ''; numEl.focus(); }
        if (denEl) denEl.value = '';
      }, 420);
    }
  }

  /* ════════════════════════════
     시각 피드백
  ════════════════════════════ */
  function _flashBox(correct) {
    const box = document.getElementById('sdb-ans-box');
    if (!box) return;
    box.style.borderColor = correct ? '#34d399' : '#f87171';
    box.style.background  = correct ? 'rgba(52,211,153,.08)' : 'rgba(248,113,113,.08)';
    if (!correct) {
      box.style.animation = 'none';
      void box.offsetWidth;
      box.style.animation = 'sdb-shake .3s ease';
    }
  }

  function _clearFlash() {
    const box = document.getElementById('sdb-ans-box');
    if (box) { box.style.borderColor = ''; box.style.background = ''; box.style.animation = ''; }
  }

  let _toastTimer;
  function _showToast(msg, isWrong) {
    const el = document.getElementById('sdb-toast');
    if (!el) return;
    el.textContent  = msg;
    el.style.background = isWrong ? '#f87171' : '#34d399';
    el.style.color      = isWrong ? '#fff' : '#000';
    clearTimeout(_toastTimer);
    el.style.transform  = 'translateX(-50%) scale(1)';
    el.style.opacity    = '1';
    _toastTimer = setTimeout(() => {
      el.style.transform = 'translateX(-50%) scale(.8)';
      el.style.opacity   = '0';
    }, 750);
  }

  /* ════════════════════════════
     CSS 주입
  ════════════════════════════ */
  function _injectStyles() {
    if (document.getElementById('sdb-styles')) return;
    const s = document.createElement('style');
    s.id = 'sdb-styles';
    s.textContent = `
      @keyframes sdb-shake {
        0%   { transform:translateX(0); }
        25%  { transform:translateX(-6px); }
        75%  { transform:translateX(6px); }
        100% { transform:translateX(0); }
      }
      #sdb-check-btn:active { transform:scale(.97) !important; }
      #sdb-num::-webkit-inner-spin-button,
      #sdb-den::-webkit-inner-spin-button,
      #sdb-num::-webkit-outer-spin-button,
      #sdb-den::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
      #sdb-num, #sdb-den { -moz-appearance:textfield; }
    `;
    document.head.appendChild(s);
  }

})();
