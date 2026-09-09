/*
  안드로이드 껍데기 앱과 이야기하는 자리.

  이 가계부는 원래 브라우저에서 도는 웹앱이고, 앞으로도 그렇다. 다만 브라우저가
  못 하는 두 가지가 있어서 그것만 껍데기 앱(passbook-android)에 맡긴다.

    1. **결제 알림 읽기** — 브라우저에는 알림을 보는 통로가 아예 없다.
       권한 문제가 아니라 기능이 없어서, 무엇을 허용해도 안 된다.
    2. **자동 백업** — 브라우저는 사용자가 누르지 않으면 파일을 저장할 수 없다.

  **껍데기가 없으면 전부 조용히 넘어간다.** 크롬으로 열었을 때 아무것도 안
  깨지고, 그냥 이 기능들이 없는 것처럼 군다. 그래야 앱과 브라우저 양쪽에서
  같은 코드가 돈다.
*/

function bridge() {
  return typeof window !== "undefined" ? window.PassbookNative : undefined;
}

/** 지금 껍데기 앱 안에서 돌고 있나 */
export function inNativeApp() {
  return !!bridge();
}

/* ── 결제 알림 ────────────────────────────────────────────────────────── */

/**
 * 쌓인 결제 알림을 가져온다. **가져오면 앱 쪽 큐는 비워진다** —
 * 두 번 등록되는 것이 안 등록되는 것보다 나쁘기 때문이다.
 * 돌려주는 모양: [{ text, pkg, at }]
 */
export function pullPendingPayments() {
  const b = bridge();
  if (!b?.pullPending) return [];
  try {
    const raw = b.pullPending();
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * 아직 안 가져온 알림이 몇 건인가. 큐를 비우지 않고 세기만 한다.
 * 껍데기가 없거나 못 세면 null.
 */
export function pendingCount() {
  const b = bridge();
  if (!b?.pendingCount) return null;
  try {
    return Number(b.pendingCount());
  } catch {
    return null;
  }
}

/** 알림 접근 권한이 켜져 있나. 껍데기가 없으면 null(해당 없음). */
export function hasNotificationAccess() {
  const b = bridge();
  if (!b?.hasNotificationAccess) return null;
  try {
    return !!b.hasNotificationAccess();
  } catch {
    return null;
  }
}

/** 권한 화면을 연다 — 이 권한은 코드로 못 켜고 사람이 직접 켜야 한다 */
export function openNotificationSettings() {
  const b = bridge();
  try {
    b?.openNotificationAccessSettings?.();
  } catch {
    /* 못 열어도 앱은 계속 돈다 */
  }
}

/* ── 자동 백업 ────────────────────────────────────────────────────────── */

/**
 * 데이터를 파일로 떨어뜨린다. 저장된 파일 이름을 돌려주고, 못 하면 null.
 *
 * 하루에 한 파일이라 자주 불러도 파일이 쌓이지 않는다 — 같은 날이면 덮어쓴다.
 */
export function saveBackup(data) {
  const b = bridge();
  if (!b?.saveBackup) return null;
  try {
    const name = b.saveBackup(JSON.stringify(data));
    return name || null;
  } catch {
    return null;
  }
}

/** 백업 목록 — 최신순 [{ name, size }] */
export function listBackups() {
  const b = bridge();
  if (!b?.listBackups) return [];
  try {
    const arr = JSON.parse(b.listBackups() || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** 백업 파일 하나를 읽어 객체로. 실패하면 null. */
export function readBackup(name) {
  const b = bridge();
  if (!b?.readBackup) return null;
  try {
    const text = b.readBackup(name);
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}
