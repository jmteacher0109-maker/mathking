/**
 * ============================================================
 *  game-registry.js  —  게임 목록 레지스트리
 * ============================================================
 * 새 게임 추가:  GAMES 배열에 객체 하나 추가
 * 게임 삭제:     GAMES 배열에서 해당 객체 제거
 * 나머지 코드는 수정 불필요!
 * ============================================================
 */

const GAMES = [
  {
    id:           "multiplication",      // 고유 ID (Firebase 경로에 사용)
    name:         "곱셈구구",
    emoji:        "✖️",
    description:  "10초 안에 곱셈 문제를 최대한 많이 풀어라!",
    file:         "games/multiplication/game.html",
    color:        "#f15bb5",             // 카드 포인트 컬러
    colorDark:    "#c1166a",
    soloEnabled:  true,
    multiEnabled: true,
    gameDuration: 10,                    // 초 단위 게임 시간
  },

  // ── 게임 추가 예시 (아직 미구현) ──────────────────────────
  // {
  //   id:           "addition-rush",
  //   name:         "덧셈 러시",
  //   emoji:        "➕",
  //   description:  "15초 안에 덧셈 문제를 풀어라!",
  //   file:         "game-addition-rush.html",
  //   color:        "#06d6a0",
  //   colorDark:    "#048a66",
  //   soloEnabled:  true,
  //   multiEnabled: true,
  //   gameDuration: 15,
  // },
];

/** ID로 게임 정보 조회 */
function getGame(id) {
  return GAMES.find(g => g.id === id) || null;
}
