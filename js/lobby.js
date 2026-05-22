/**
 * ============================================================
 *  lobby.js  —  로비 화면 로직
 * ============================================================
 *  - 로그인 / 로그아웃
 *  - 게임 카드 렌더링
 *  - 랭킹 실시간 표시
 *  - 멀티플레이 모달 (방 만들기 / 참가하기)
 * ============================================================
 */

// ── 현재 선택된 게임 ──────────────────────────
let _selectedGame    = null;
let _rankingUnsub    = null;   // 랭킹 리스너 해제용
let _currentRankTab  = null;
let _roomListenerRef = null;   // 방 리스너 (guest waiting)

// ─────────────────────────────────────────────
//  초기화
// ─────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  generateStars();
  const user = getUser();
  if (user) {
    showLobby(user);
  } else {
    showLoginScreen();
  }
});

function generateStars() {
  const bg = document.getElementById("starsBg");
  if (!bg) return;
  // 추가 별들 동적 생성
  for (let i = 0; i < 40; i++) {
    const star = document.createElement("div");
    star.style.cssText = `
      position:absolute;
      width:${Math.random() * 2 + 1}px;
      height:${Math.random() * 2 + 1}px;
      background:rgba(255,255,255,${Math.random() * .5 + .2});
      border-radius:50%;
      top:${Math.random() * 100}%;
      left:${Math.random() * 100}%;
      animation: twinkle ${2 + Math.random() * 3}s ease-in-out ${Math.random() * 2}s infinite alternate;
    `;
    bg.appendChild(star);
  }
  // 별 반짝임 애니메이션
  if (!document.getElementById("starStyle")) {
    const st = document.createElement("style");
    st.id = "starStyle";
    st.textContent = `@keyframes twinkle { from { opacity:.2 } to { opacity:1 } }`;
    document.head.appendChild(st);
  }
}

// ─────────────────────────────────────────────
//  로그인 / 로그아웃
// ─────────────────────────────────────────────
function showLoginScreen() {
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("mainLobby").classList.add("hidden");
  setTimeout(() => document.getElementById("usernameInput")?.focus(), 100);
}

function showLobby(user) {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("mainLobby").classList.remove("hidden");
  document.getElementById("headerUsername").textContent = "👤 " + user.username;
  renderGameCards();
  initRankingTabs();
}

function handleLogin() {
  const input = document.getElementById("usernameInput");
  const name  = input.value.trim();
  if (!name) { input.focus(); showToast("닉네임을 입력하세요!", "error"); return; }
  if (name.length < 2) { showToast("닉네임은 2자 이상이어야 합니다.", "error"); return; }
  const user = saveUser(name);
  showLobby(user);
  showToast(`환영합니다, ${user.username}!`, "success");
}

function handleLogout() {
  removeUser();
  detachAllListeners();
  showLoginScreen();
  document.getElementById("usernameInput").value = "";
}

// Enter key on login
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && !document.getElementById("loginScreen").classList.contains("hidden")) {
    handleLogin();
  }
});

// ─────────────────────────────────────────────
//  게임 카드 렌더링
// ─────────────────────────────────────────────
function renderGameCards() {
  const grid = document.getElementById("gamesGrid");
  if (!grid) return;
  grid.innerHTML = "";

  GAMES.forEach(game => {
    const card = document.createElement("div");
    card.className = "game-card";
    card.style.setProperty("--card-color", game.color);

    card.innerHTML = `
      <span class="game-emoji">${game.emoji}</span>
      <div class="game-name">${game.name}</div>
      <div class="game-desc">${game.description}</div>
      <div class="game-actions">
        ${game.soloEnabled
          ? `<button class="btn btn-primary" onclick="startSolo('${game.id}')">🎯 솔로</button>`
          : ""}
        ${game.multiEnabled
          ? `<button class="btn btn-accent" onclick="openMultiModal('${game.id}')">👥 멀티</button>`
          : ""}
      </div>
    `;
    grid.appendChild(card);
  });
}

// ─────────────────────────────────────────────
//  랭킹 탭 초기화
// ─────────────────────────────────────────────
function initRankingTabs() {
  const tabs = document.getElementById("rankingTabs");
  if (!tabs) return;
  tabs.innerHTML = "";

  GAMES.forEach((game, i) => {
    const btn = document.createElement("button");
    btn.className = "tab-btn" + (i === 0 ? " active" : "");
    btn.textContent = `${game.emoji} ${game.name}`;
    btn.dataset.gameId = game.id;
    btn.onclick = () => switchRankTab(game.id, btn);
    tabs.appendChild(btn);
  });

  if (GAMES.length > 0) switchRankTab(GAMES[0].id, tabs.children[0]);
}

function switchRankTab(gameId, btnEl) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  btnEl.classList.add("active");

  if (_rankingUnsub) {
    // 이전 구독 해제 (ref.off 직접 호출)
    _rankingUnsub();
    _rankingUnsub = null;
  }
  _currentRankTab = gameId;

  const body = document.getElementById("rankingBody");
  body.innerHTML = `<tr><td colspan="3" class="loading-row">불러오는 중...</td></tr>`;

  const ref = db.ref(`rankings/${gameId}`)
    .orderByChild("bestScore")
    .limitToLast(15);

  const handler = snap => renderRanking(snap, gameId);
  ref.on("value", handler);
  _rankingUnsub = () => ref.off("value", handler);
}

function renderRanking(snap, gameId) {
  const body = document.getElementById("rankingBody");
  if (!body || _currentRankTab !== gameId) return;

  if (!snap.exists()) {
    body.innerHTML = `<tr><td colspan="3" class="loading-row">아직 기록이 없습니다. 첫 번째 플레이어가 되세요!</td></tr>`;
    return;
  }

  const entries = [];
  snap.forEach(child => entries.push({ id: child.key, ...child.val() }));
  entries.sort((a, b) => b.bestScore - a.bestScore);

  const user = getUser();
  body.innerHTML = entries.map((e, i) => {
    const rank = i + 1;
    const isMe = user && e.id === user.id;
    const badgeClass = rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : rank === 3 ? "rank-3" : "rank-other";
    return `
      <tr class="${isMe ? "rank-me" : ""}">
        <td><span class="rank-badge ${badgeClass}">${rank}</span></td>
        <td>${escHtml(e.username)}${isMe ? " <small>(나)</small>" : ""}</td>
        <td><strong>${e.bestScore}</strong>점</td>
      </tr>
    `;
  }).join("");
}

// ─────────────────────────────────────────────
//  솔로 플레이 시작
// ─────────────────────────────────────────────
function startSolo(gameId) {
  const game = getGame(gameId);
  if (!game) return;
  window.location.href = `${game.file}?mode=solo&gameId=${gameId}`;
}

// ─────────────────────────────────────────────
//  멀티 플레이 모달
// ─────────────────────────────────────────────
function openMultiModal(gameId) {
  _selectedGame = getGame(gameId);
  if (!_selectedGame) return;

  document.getElementById("multiModalGameName").textContent = _selectedGame.name;
  showMultiScreen("multiChoice");
  document.getElementById("multiModal").classList.remove("hidden");
  document.getElementById("roomCodeInput").value = "";
  document.getElementById("joinError").classList.add("hidden");
}

function closeMultiModal() {
  document.getElementById("multiModal").classList.add("hidden");
  // 리스너 정리
  if (_roomListenerRef) {
    _roomListenerRef.off();
    _roomListenerRef = null;
  }
  detachAllListeners();
  _selectedGame = null;
}

function showMultiScreen(id) {
  ["multiChoice", "createRoomScreen", "joinRoomScreen", "guestWaitScreen", "countdownScreen"]
    .forEach(sid => {
      const el = document.getElementById(sid);
      if (el) el.classList.toggle("hidden", sid !== id);
    });
}

// ── 방 만들기 ──────────────────────────────────
async function showCreateRoom() {
  if (!_selectedGame) return;
  try {
    const code = await createRoom(_selectedGame.id);
    document.getElementById("roomCodeDisplay").textContent = code;
    document.getElementById("startGameBtn").disabled = true;
    showMultiScreen("createRoomScreen");

    // 플레이어 목록 구독
    subscribeToPlayers(players => {
      renderWaitingPlayers("waitingPlayers", players, true);
      const count = Object.keys(players).length;
      const btn = document.getElementById("startGameBtn");
      btn.disabled = count < 2;
      btn.textContent = count < 2
        ? `게임 시작 (최소 2명 필요, 현재 ${count}명)`
        : `게임 시작 ✅ (${count}명)`;
    });

    // 방 상태 구독 (다른 사람이 시작했을 때 대비)
    subscribeToRoomStatus((status, room) => {
      if (status === "countdown" && room) {
        showMultiScreen("countdownScreen");
        startCountdownUI(room.countdownStartAt, () => goToMultiGame(room));
      }
    });

  } catch (err) {
    showToast(err.message, "error");
  }
}

async function copyRoomCode() {
  const code = document.getElementById("roomCodeDisplay").textContent;
  await copyToClipboard(code);
  showToast("코드가 복사되었습니다!", "success");
}

async function startMultiGame() {
  try {
    await hostStartGame();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ── 방 참가하기 ────────────────────────────────
function showJoinRoom() {
  showMultiScreen("joinRoomScreen");
  setTimeout(() => document.getElementById("roomCodeInput")?.focus(), 100);
}

document.addEventListener("keydown", e => {
  const joinScreen = document.getElementById("joinRoomScreen");
  if (e.key === "Enter" && joinScreen && !joinScreen.classList.contains("hidden")) {
    joinRoomHandler();
  }
});

async function joinRoomHandler() {
  const code = document.getElementById("roomCodeInput").value.trim().toUpperCase();
  const errEl = document.getElementById("joinError");
  errEl.classList.add("hidden");

  if (!code || code.length !== 6) {
    errEl.textContent = "6자리 코드를 입력하세요.";
    errEl.classList.remove("hidden");
    return;
  }

  try {
    const room = await joinRoom(code);
    document.getElementById("guestRoomCode").textContent = code;
    showMultiScreen("guestWaitScreen");

    // 플레이어 목록 구독
    subscribeToPlayers(players => {
      renderWaitingPlayers("guestWaitingPlayers", players, false);
    });

    // 방 상태 구독 (호스트가 시작하면 게임으로)
    subscribeToRoomStatus((status, roomData) => {
      if (status === "countdown" && roomData) {
        showMultiScreen("countdownScreen");
        startCountdownUI(roomData.countdownStartAt, () => goToMultiGame(roomData));
      } else if (status === "removed") {
        closeMultiModal();
        showToast("호스트가 방을 닫았습니다.", "error");
      }
    });

    showToast(`${room.hostName}의 방에 입장했습니다!`, "success");

  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
  }
}

// ── 멀티 게임 페이지로 이동 ────────────────────
function goToMultiGame(room) {
  const game = getGame(room.gameId);
  if (!game) return;
  window.location.href = `${game.file}?mode=multi&roomCode=${room.code}&gameId=${room.gameId}`;
}

// ── 대기 방 플레이어 렌더링 ────────────────────
function renderWaitingPlayers(containerId, players, isHostView) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const user = getUser();

  container.innerHTML = Object.entries(players)
    .sort(([, a], [, b]) => (a.joinedAt || 0) - (b.joinedAt || 0))
    .map(([uid, p]) => {
      const isCurrentUser = user && uid === user.id;
      let badge = "";
      if (isHostView && isCurrentUser) {
        badge = `<span class="player-badge badge-host">호스트</span>`;
      } else if (isCurrentUser) {
        badge = `<span class="player-badge badge-me">나</span>`;
      } else {
        badge = `<span class="player-badge badge-guest">참가자</span>`;
      }
      return `
        <div class="player-item">
          <span class="player-name">${escHtml(p.username)}</span>
          ${badge}
        </div>`;
    }).join("");
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

// 전역으로 joinRoomHandler 노출 (HTML onclick에서 호출)
window.joinRoom = joinRoomHandler;
