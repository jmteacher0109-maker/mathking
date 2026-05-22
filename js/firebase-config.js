/**
 * ============================================================
 *  firebase-config.js  —  Firebase 초기화 및 공유 유틸리티
 * ============================================================
 * ⚠️  사용 전: 아래 firebaseConfig 값을
 *     Firebase Console > 프로젝트 설정 > 앱 > 웹앱 구성에서 복사하세요.
 * ============================================================
 */

const firebaseConfig = {
  apiKey: "AIzaSyCbkXyFyjSWwfXSpoFcEG38LOxqSa0J0sw",
  authDomain: "mathk-1e5d1.firebaseapp.com",
  databaseURL: "https://mathk-1e5d1-default-rtdb.firebaseio.com",
  projectId: "mathk-1e5d1",
  storageBucket: "mathk-1e5d1.firebasestorage.app",
  messagingSenderId: "433859326",
  appId: "1:433859326:web:88abca82a506e116af93af"
};

// ── Firebase 설정 여부 확인 ──────────────────────
const FIREBASE_READY = firebaseConfig.apiKey !== "YOUR_API_KEY";

// ── Firebase 초기화 ──────────────────────────────
let db = null;

try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
} catch (e) {
  console.warn("Firebase 초기화 실패. firebase-config.js 설정을 확인하세요.", e);
}

// ── Firebase 미설정 경고 배너 ────────────────────
if (!FIREBASE_READY) {
  window.addEventListener("DOMContentLoaded", () => {
    const banner = document.createElement("div");
    banner.style.cssText = `
      position:fixed; top:0; left:0; right:0; z-index:9999;
      background:#ef476f; color:#fff; text-align:center;
      padding:10px 16px; font-family:sans-serif; font-size:.88rem; font-weight:700;
    `;
    banner.innerHTML = `
      ⚠️ Firebase 미설정 — 랭킹·멀티플레이 기능이 작동하지 않습니다.
      <a href="README.md" style="color:#fff;text-decoration:underline;margin-left:8px">설정 방법 보기</a>
    `;
    document.body.prepend(banner);
  });
}

// ─────────────────────────────────────────────
//  공통 유틸 (모든 페이지에서 사용)
// ─────────────────────────────────────────────

function getUser() {
  try { return JSON.parse(localStorage.getItem("mathUser")) || null; }
  catch { return null; }
}

function saveUser(username) {
  const user = { id: _genId(), username: username.trim() };
  localStorage.setItem("mathUser", JSON.stringify(user));
  return user;
}

function removeUser() {
  localStorage.removeItem("mathUser");
}

function _genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function genRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    return true;
  }
}

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
