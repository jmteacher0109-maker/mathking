/**
 * ============================================================
 *  game-multiplication.js  —  곱셈구구 게임 로직
 * ============================================================
 *  솔로:  10초 동안 최대한 많이 풀기, 최고점 저장
 *  멀티:  Firebase 실시간 점수 동기화, 결과 공유
 * ============================================================
 */

// ── 상수 ──────────────────────────────────────
const GAME_ID       = "multiplication";
const GAME_DURATION = 10;   // 초 (game-registry.js 값과 일치)
const MIN_NUM       = 2;
const MAX_NUM       = 9;

// ── 상태 ──────────────────────────────────────
let _mode          = "solo";   // "solo" | "multi"
let _roomCode      = null;
let _score         = 0;
let _timerInterval = null;
let _timeLeft      = GAME_DURATION;
let _gameRunning   = false;
let _currentQ      = null;
let _liveBoardRef  = null;
let _isNewRecord   = false;
let _finalPlayers  = null;

// SVG 타이머 링 설정
const RING_R  = 22;
const RING_C  = 2 * Math.PI * RING_R;

// ─────────────────────────────────────────────
//  초기화 (DOMContentLoaded)
// ─────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  _mode      = params.get("mode")     || "solo";
  _roomCode  = params.get("roomCode") || null;

  generateStarsBg();

  // 게임 화면 준비
  document.getElementById("gameScreen").classList.remove("hidden");
  document.getElementById("resultScreen").classList.add("hidden");

  // 멀티: 라이브 보드 표시
  if (_mode === "multi") {
    document.getElementById("liveBoardWrapper").classList.remove("hidden");
    subscribeToLiveBoard();
    // 방 상태 구독 (finished 신호 대기)
    subscribeToRoomStatus((status, room) => {
      if (status === "finished" && _gameRunning) {
        endGame();
      }
    });
  }

  // 카운트다운 없이 바로 시작 (멀티는 lobby.js의 카운트다운 후 이미 페이지 이동)
  setTimeout(() => startGame(), 300);
});

function generateStarsBg() {
  const bg = document.getElementById("starsBg");
  if (!bg) return;
  for (let i = 0; i < 30; i++) {
    const s = document.createElement("div");
    s.style.cssText = `
      position:absolute;width:${Math.random()*2+1}px;height:${Math.random()*2+1}px;
      background:rgba(255,255,255,${Math.random()*.4+.15});border-radius:50%;
      top:${Math.random()*100}%;left:${Math.random()*100}%;
      animation:twinkle ${2+Math.random()*3}s ease-in-out ${Math.random()*2}s infinite alternate;
    `;
    bg.appendChild(s);
  }
  const style = document.createElement("style");
  style.textContent = "@keyframes twinkle{from{opacity:.2}to{opacity:1}}";
  document.head.appendChild(style);
}

// ─────────────────────────────────────────────
//  게임 시작
// ─────────────────────────────────────────────
function startGame() {
  _score      = 0;
  _timeLeft   = GAME_DURATION;
  _gameRunning = true;

  updateScore(0);
  nextQuestion();
  startTimer();

  document.getElementById("answerInput").focus();
}

// ─────────────────────────────────────────────
//  타이머
// ─────────────────────────────────────────────
function startTimer() {
  updateTimerUI(_timeLeft);

  _timerInterval = setInterval(() => {
    _timeLeft -= 0.05;

    if (_timeLeft <= 0) {
      _timeLeft = 0;
      updateTimerUI(0);
      clearInterval(_timerInterval);
      endGame();
      return;
    }
    updateTimerUI(_timeLeft);
  }, 50);
}

function updateTimerUI(t) {
  const num   = document.getElementById("timerNum");
  const circle = document.getElementById("timerCircle");

  const display = Math.ceil(t);
  num.textContent = display;

  // SVG 링 진행률
  const fraction = t / GAME_DURATION;
  circle.style.strokeDasharray  = RING_C;
  circle.style.strokeDashoffset = RING_C * (1 - fraction);

  // 색상 변경
  if (t <= 3) {
    num.className = "timer-num danger";
    circle.style.stroke = "var(--red)";
  } else if (t <= 5) {
    num.className = "timer-num warn";
    circle.style.stroke = "var(--yellow)";
  } else {
    num.className = "timer-num";
    circle.style.stroke = "var(--cyan)";
  }
}

// ─────────────────────────────────────────────
//  문제 생성
// ─────────────────────────────────────────────
function nextQuestion() {
  let a, b;
  do {
    a = Math.floor(Math.random() * (MAX_NUM - MIN_NUM + 1)) + MIN_NUM;
    b = Math.floor(Math.random() * (MAX_NUM - MIN_NUM + 1)) + MIN_NUM;
  } while (_currentQ && a === _currentQ.a && b === _currentQ.b);

  _currentQ = { a, b, answer: a * b };

  const el = document.getElementById("questionText");
  el.innerHTML = `<span>${a}</span> × <span>${b}</span> = ?`;
  el.style.animation = "none";
  requestAnimationFrame(() => { el.style.animation = "popIn .25s cubic-bezier(.175,.885,.32,1.275)"; });

  // 입력 초기화
  const input = document.getElementById("answerInput");
  input.value = "";
  input.className = "answer-input";
  input.focus();
}

// ─────────────────────────────────────────────
//  답 확인 (입력 이벤트)
// ─────────────────────────────────────────────
function onAnswerInput(e) {
  if (!_gameRunning) return;

  const val = parseInt(e.target.value, 10);
  if (isNaN(val)) return;

  // 정답 범위를 넘으면 즉시 체크
  if (Math.abs(val) > 81 || e.key === "Enter") {
    checkAnswer(val);
    return;
  }

  // 두 자리 숫자가 완성되면 자동 체크
  if (String(Math.abs(val)).length >= 2 && val === _currentQ.answer) {
    checkAnswer(val);
  }
}

function onAnswerKeydown(e) {
  if (!_gameRunning) return;
  if (e.key === "Enter") {
    const val = parseInt(document.getElementById("answerInput").value, 10);
    if (!isNaN(val)) checkAnswer(val);
  }
}

function checkAnswer(val) {
  if (!_gameRunning || !_currentQ) return;

  const input = document.getElementById("answerInput");
  const fb    = document.getElementById("feedback");

  if (val === _currentQ.answer) {
    // ✅ 정답
    _score++;
    updateScore(_score);
    input.className = "answer-input correct";
    fb.textContent  = "✅ 정답!";
    fb.className    = "feedback correct";

    // 멀티: 실시간 점수 전송
    if (_mode === "multi") submitScore(_score, false);

    setTimeout(() => {
      fb.textContent = "";
      fb.className   = "feedback";
      nextQuestion();
    }, 250);

  } else {
    // ❌ 오답
    input.className = "answer-input wrong";
    fb.textContent  = `❌ 오답! 정답은 ${_currentQ.answer}`;
    fb.className    = "feedback wrong";

    setTimeout(() => {
      input.className = "answer-input";
      input.value     = "";
      fb.textContent  = "";
      fb.className    = "feedback";
      input.focus();
    }, 700);
  }
}

function updateScore(s) {
  document.getElementById("scoreValue").textContent = s;
  // 점수 팝 애니메이션
  const el = document.getElementById("scoreValue");
  el.style.animation = "none";
  requestAnimationFrame(() => { el.style.animation = "popIn .2s ease"; });
}

// ─────────────────────────────────────────────
//  라이브 보드 (멀티 전용)
// ─────────────────────────────────────────────
function subscribeToLiveBoard() {
  if (!_roomCode) return;
  const user = getUser();

  _liveBoardRef = db.ref(`rooms/${_roomCode}/players`);
  _liveBoardRef.on("value", snap => {
    if (!snap.exists()) return;
    const players = snap.val();
    const board   = document.getElementById("liveBoardRows");
    if (!board) return;

    const sorted = Object.entries(players)
      .sort(([, a], [, b]) => b.score - a.score);

    board.innerHTML = sorted.map(([uid, p], i) => `
      <div class="live-board-row ${user && uid === user.id ? "me" : ""}">
        <span>${i + 1}. ${escHtml(p.username)}${user && uid === user.id ? " (나)" : ""}</span>
        <span class="live-score">${p.score}점</span>
      </div>
    `).join("");

    // 게임 종료 판단: 모두 finished 상태면 결과 표시
    const allFinished = Object.values(players).every(p => p.finished);
    if (allFinished && _gameRunning) {
      _finalPlayers = players;
    }
  });
}

// ─────────────────────────────────────────────
//  게임 종료
// ─────────────────────────────────────────────
async function endGame() {
  if (!_gameRunning) return;
  _gameRunning = false;

  clearInterval(_timerInterval);

  // 입력 비활성화
  const input = document.getElementById("answerInput");
  if (input) { input.disabled = true; input.blur(); }

  if (_mode === "multi") {
    try {
      await submitScore(_score, true);
      const room = getCurrentRoom();
      if (room?.isHost) await markGameFinished();
    } catch (e) {
      console.warn("멀티 점수 제출 오류:", e);
    }
    setTimeout(() => showResult(), 1500);

  } else {
    // 솔로: 랭킹 저장 — Firebase 미설정이어도 결과화면은 반드시 표시
    try {
      _isNewRecord = await saveRanking(GAME_ID, _score);
    } catch (e) {
      console.warn("랭킹 저장 오류 (Firebase 미설정?):", e);
      _isNewRecord = false;
    }
    showResult();
  }
}

// ─────────────────────────────────────────────
//  결과 화면
// ─────────────────────────────────────────────
async function showResult() {
  document.getElementById("gameScreen").classList.add("hidden");
  document.getElementById("resultScreen").classList.remove("hidden");

  document.getElementById("resultScore").textContent = _score;

  if (_mode === "solo") {
    document.getElementById("multiResultSection").classList.add("hidden");

    let emoji = "🎉", title = "게임 종료!";
    if (_score >= 15)      { emoji = "🏆"; title = "완벽해요!"; }
    else if (_score >= 10) { emoji = "⭐"; title = "훌륭해요!"; }
    else if (_score >= 5)  { emoji = "👍"; title = "잘했어요!"; }

    document.getElementById("resultEmoji").textContent = emoji;
    document.getElementById("resultTitle").textContent = title;
    document.getElementById("resultLabel").textContent = `${GAME_DURATION}초 동안 ${_score}문제 정답!`;

    if (_isNewRecord) {
      document.getElementById("resultExtra").textContent = "🎊 신기록 달성! 랭킹에 등록되었습니다!";
      document.getElementById("resultExtra").classList.remove("hidden");
    } else {
      document.getElementById("resultExtra").classList.add("hidden");
    }

  } else {
    // 멀티 결과
    document.getElementById("multiResultSection").classList.remove("hidden");
    document.getElementById("resultLabel").textContent = `내 점수: ${_score}점`;

    try {
      const snap = await db.ref(`rooms/${_roomCode}/players`).get();
      const players = snap.exists() ? snap.val() : {};
      const user    = getUser();
      const sorted  = Object.entries(players).sort(([, a], [, b]) => b.score - a.score);
      const winner  = sorted[0];
      const isWinner = user && winner && winner[0] === user.id;

      document.getElementById("resultEmoji").textContent = isWinner ? "🏆" : "🎮";
      document.getElementById("resultTitle").textContent = isWinner
        ? "우승!" : `${winner ? winner[1].username : ""}님 우승!`;
      document.getElementById("resultExtra").classList.add("hidden");

      const tbody = document.getElementById("multiResultBody");
      tbody.innerHTML = sorted.map(([uid, p], i) => `
        <tr class="${i === 0 ? "multi-result-winner" : ""}">
          <td>${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}위`}</td>
          <td>${escHtml(p.username)}${user && uid === user.id ? " (나)" : ""}</td>
          <td><strong>${p.score}</strong>점</td>
        </tr>
      `).join("");

      await saveRanking(GAME_ID, _score);
    } catch (e) {
      console.warn("멀티 결과 로드 오류:", e);
      document.getElementById("resultEmoji").textContent = "🎮";
      document.getElementById("resultTitle").textContent = "게임 종료!";
    }
  }
}

// ─────────────────────────────────────────────
//  버튼 동작
// ─────────────────────────────────────────────
function playAgain() {
  const base = `game.html?mode=${_mode}&gameId=${GAME_ID}`;
  const extra = (_mode === "multi" && _roomCode) ? `&roomCode=${_roomCode}` : "";
  location.href = base + extra;
}

function goLobby() {
  if (_mode === "multi") {
    leaveRoom().finally(() => { location.href = "../../index.html"; });
  } else {
    location.href = "../../index.html";
  }
}

// ─────────────────────────────────────────────
//  유틸
// ─────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
