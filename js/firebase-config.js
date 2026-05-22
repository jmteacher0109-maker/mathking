/**
 * ============================================================
 *  firebase-config.js  —  Firebase 초기화 및 공유 유틸리티
 * ============================================================
 * ⚠️  사용 전: 아래 firebaseConfig 값을
 *     Firebase Console > 프로젝트 설정 > 앱 > 웹앱 구성에서 복사하세요.
 * ============================================================
 */

const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ─────────────────────────────────────────
//  공통 유틸 (모든 페이지에서 사용)
// ─────────────────────────────────────────

/** 현재 로그인 사용자 반환 (localStorage 기반) */
function getUser() {
  try {
    return JSON.parse(localStorage.getItem("mathUser")) || null;
  } catch { return null; }
}

/** 사용자 저장 */
function saveUser(username) {
  const user = {
    id: _genId(),
    username: username.trim()
  };
  localStorage.setItem("mathUser", JSON.stringify(user));
  return user;
}

/** 사용자 삭제 (로그아웃) */
function removeUser() {
  localStorage.removeItem("mathUser");
}

/** 유니크 ID 생성 */
function _genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

/** 6자리 방 코드 생성 */
function genRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/** 클립보드 복사 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    return true;
  }
}

/** 토스트 메시지 표시 */
function showToast(msg, type = "info") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
