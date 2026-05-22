/**
 * ============================================================
 *  multiplayer.js  —  멀티플레이 방 관리 시스템
 * ============================================================
 *  - 방 생성 / 참가 / 퇴장
 *  - 실시간 플레이어 목록 동기화
 *  - 게임 시작 / 카운트다운 신호
 *  - 점수 실시간 동기화
 * ============================================================
 */

// 현재 활성 Firebase 리스너들 (정리용)
const _listeners = [];

function _on(ref, event, cb) {
  ref.on(event, cb);
  _listeners.push({ ref, event, cb });
}

/** 모든 Firebase 리스너 해제 */
function detachAllListeners() {
  _listeners.forEach(({ ref, event, cb }) => ref.off(event, cb));
  _listeners.length = 0;
}

// ────────────────────────────────────────
//  내부 상태
// ────────────────────────────────────────
let _currentRoom  = null;   // { code, gameId, isHost }
let _roomRef      = null;
let _onPlayersCb  = null;   // (players) => void
let _onStatusCb   = null;   // (status, data) => void

// ────────────────────────────────────────
//  방 생성
// ────────────────────────────────────────
async function createRoom(gameId) {
  const user = getUser();
  if (!user) throw new Error("로그인이 필요합니다.");

  if (!FIREBASE_READY || !db) {
    throw new Error("Firebase가 설정되지 않았습니다.\nfirebase-config.js에 프로젝트 정보를 입력해주세요.");
  }

  const game = getGame(gameId);
  if (!game) throw new Error("게임을 찾을 수 없습니다.");

  // 고유 방 코드 생성 (충돌 방지 루프)
  let code;
  for (let i = 0; i < 5; i++) {
    code = genRoomCode();
    const snap = await db.ref(`rooms/${code}`).get();
    if (!snap.exists()) break;
  }

  const roomData = {
    code,
    gameId,
    gameName:      game.name,
    gameDuration:  game.gameDuration,
    hostId:        user.id,
    hostName:      user.username,
    status:        "waiting",         // waiting | countdown | playing | finished
    countdownStartAt: null,
    gameStartAt:   null,
    createdAt:     firebase.database.ServerValue.TIMESTAMP,
    players: {
      [user.id]: {
        username: user.username,
        score:    0,
        ready:    true,
        finished: false,
        joinedAt: firebase.database.ServerValue.TIMESTAMP,
      }
    }
  };

  await db.ref(`rooms/${code}`).set(roomData);

  _currentRoom = { code, gameId, isHost: true };
  _roomRef = db.ref(`rooms/${code}`);

  // 접속 해제 시 방 자동 삭제
  _roomRef.onDisconnect().remove();

  return code;
}

// ────────────────────────────────────────
//  방 참가
// ────────────────────────────────────────
async function joinRoom(code) {
  const user = getUser();
  if (!user) throw new Error("로그인이 필요합니다.");

  if (!FIREBASE_READY || !db) {
    throw new Error("Firebase가 설정되지 않았습니다.\nfirebase-config.js에 프로젝트 정보를 입력해주세요.");
  }

  code = code.toUpperCase().trim();
  const snap = await db.ref(`rooms/${code}`).get();

  if (!snap.exists()) throw new Error("방을 찾을 수 없습니다. 코드를 확인하세요.");

  const room = snap.val();
  if (room.status !== "waiting") throw new Error("이미 시작된 게임입니다.");

  const playerCount = Object.keys(room.players || {}).length;
  if (playerCount >= 8) throw new Error("방이 가득 찼습니다. (최대 8명)");

  await db.ref(`rooms/${code}/players/${user.id}`).set({
    username: user.username,
    score:    0,
    ready:    true,
    finished: false,
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
  });

  _currentRoom = { code, gameId: room.gameId, isHost: false };
  _roomRef = db.ref(`rooms/${code}`);

  // 나가면 자신만 삭제
  db.ref(`rooms/${code}/players/${user.id}`).onDisconnect().remove();

  return room;
}

// ────────────────────────────────────────
//  플레이어 목록 실시간 구독
// ────────────────────────────────────────
function subscribeToPlayers(cb) {
  if (!_roomRef) return;
  _onPlayersCb = cb;
  _on(_roomRef.child("players"), "value", snap => {
    const players = snap.val() || {};
    cb(players);
  });
}

// ────────────────────────────────────────
//  방 상태 실시간 구독 (status, countdown 등)
// ────────────────────────────────────────
function subscribeToRoomStatus(cb) {
  if (!_roomRef) return;
  _onStatusCb = cb;
  _on(_roomRef, "value", snap => {
    if (!snap.exists()) {
      cb("removed", null);
      return;
    }
    const room = snap.val();
    cb(room.status, room);
  });
}

// ────────────────────────────────────────
//  게임 시작 (호스트 전용)
// ────────────────────────────────────────
async function hostStartGame() {
  if (!_roomRef || !_currentRoom?.isHost) throw new Error("권한 없음");

  await _roomRef.update({
    status:           "countdown",
    countdownStartAt: firebase.database.ServerValue.TIMESTAMP,
  });
}

// ────────────────────────────────────────
//  점수 제출 (게임 중)
// ────────────────────────────────────────
async function submitScore(score, finished = false) {
  const user = getUser();
  if (!user || !_roomRef) return;
  await _roomRef.child(`players/${user.id}`).update({ score, finished });
}

// ────────────────────────────────────────
//  게임 종료 처리 (호스트가 방 상태 변경)
// ────────────────────────────────────────
async function markGameFinished() {
  if (!_roomRef || !_currentRoom?.isHost) return;
  await _roomRef.update({ status: "finished" });
}

// ────────────────────────────────────────
//  방 퇴장
// ────────────────────────────────────────
async function leaveRoom() {
  const user = getUser();
  if (!user || !_roomRef) return;

  detachAllListeners();

  if (_currentRoom?.isHost) {
    // 호스트가 나가면 방 전체 삭제
    await _roomRef.remove();
  } else {
    // 게스트는 자신만 삭제
    await _roomRef.child(`players/${user.id}`).remove();
  }

  _currentRoom = null;
  _roomRef     = null;
}

// ────────────────────────────────────────
//  현재 방 정보 조회
// ────────────────────────────────────────
function getCurrentRoom()  { return _currentRoom; }
function getCurrentRoomRef() { return _roomRef; }

// ────────────────────────────────────────
//  카운트다운 처리 (클라이언트 측)
// ────────────────────────────────────────
function startCountdownUI(serverTimestamp, onComplete) {
  const COUNTDOWN = 3;  // 초
  const elapsed   = (Date.now() - serverTimestamp) / 1000;
  let   remaining = Math.max(0, COUNTDOWN - elapsed);

  const el = document.getElementById("countdownDisplay");
  const subEl = document.getElementById("countdownSub");

  function tick() {
    if (!el) return;
    const val = Math.ceil(remaining);
    el.textContent = val > 0 ? val : "GO!";
    el.style.color  = val > 1 ? "var(--yellow)" : "var(--green)";

    if (remaining <= 0) {
      setTimeout(onComplete, 400);
      return;
    }
    remaining -= 0.05;
    setTimeout(tick, 50);
  }
  tick();
}

// ────────────────────────────────────────
//  랭킹 저장 (솔로 최고점 갱신)
// ────────────────────────────────────────
async function saveRanking(gameId, score) {
  const user = getUser();
  if (!user || !FIREBASE_READY || !db) return false;

  const rankRef = db.ref(`rankings/${gameId}/${user.id}`);
  const snap    = await rankRef.get();

  if (!snap.exists() || snap.val().bestScore < score) {
    await rankRef.set({
      username:  user.username,
      bestScore: score,
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
    });
    return true; // 신기록
  }
  return false;
}

// ────────────────────────────────────────
//  랭킹 조회 (상위 N명)
// ────────────────────────────────────────
async function fetchRanking(gameId, limit = 15) {
  if (!FIREBASE_READY || !db) return [];
  const snap = await db.ref(`rankings/${gameId}`)
    .orderByChild("bestScore")
    .limitToLast(limit)
    .get();

  if (!snap.exists()) return [];

  const entries = [];
  snap.forEach(child => entries.push({ id: child.key, ...child.val() }));
  // 내림차순 정렬
  entries.sort((a, b) => b.bestScore - a.bestScore);
  return entries;
}

// ────────────────────────────────────────
//  랭킹 실시간 구독
// ────────────────────────────────────────
function subscribeToRanking(gameId, limit = 15, cb) {
  if (!FIREBASE_READY || !db) { cb([]); return; }
  const ref = db.ref(`rankings/${gameId}`)
    .orderByChild("bestScore")
    .limitToLast(limit);

  _on(ref, "value", snap => {
    if (!snap.exists()) { cb([]); return; }
    const entries = [];
    snap.forEach(child => entries.push({ id: child.key, ...child.val() }));
    entries.sort((a, b) => b.bestScore - a.bestScore);
    cb(entries);
  });
}
