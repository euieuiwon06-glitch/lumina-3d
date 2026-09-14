// 등불 조율: 어긋난 등불이 빛나는 순간에 맞춰 입력하는 타이밍 활동.
// 시간(초)을 인자로 받는 순수 함수라 테스트할 수 있다. 소리가 없어도 고리·밝기로 시점이 보인다.

export const PERIOD = 1.6; // 등불 한 번 맥동하는 주기(초)
export const BASE_WINDOW = 0.22; // 정점 앞뒤 허용(초)
export const WIDE_WINDOW = 0.42; // 두 번 실패하면 넓힌다

export function createTuning(lanterns = 2) {
  return { lanterns, index: 0, hits: 0, misses: 0, window: BASE_WINDOW, status: 'idle', startedAt: 0, lastResult: null, assisted: false };
}

export function start(t, now) {
  if (t.status === 'done') return t;
  return { ...t, status: 'playing', startedAt: now, lastResult: null };
}

/** 현재 등불의 밝기 0~1 (정점 = 주기의 끝) */
export function glowAt(t, now) {
  if (t.status !== 'playing') return 0;
  const phase = (((now - t.startedAt) % PERIOD) + PERIOD) % PERIOD;
  return Math.pow(Math.max(0, Math.cos((phase / PERIOD) * Math.PI * 2)), 3);
}

/** 가장 가까운 정점까지 남은/지난 시간(초, 절댓값) */
export function offsetFromPeak(t, now) {
  const phase = (((now - t.startedAt) % PERIOD) + PERIOD) % PERIOD;
  return Math.min(phase, PERIOD - phase);
}

export function press(t, now) {
  if (t.status !== 'playing') return t;
  const off = offsetFromPeak(t, now);
  if (off <= t.window) {
    const index = t.index + 1;
    const done = index >= t.lanterns;
    return { ...t, index, hits: t.hits + 1, status: done ? 'done' : 'playing', startedAt: now, lastResult: 'hit' };
  }
  const misses = t.misses + 1;
  return { ...t, misses, window: misses >= 2 ? WIDE_WINDOW : t.window, lastResult: 'miss' };
}

/** 자동 조율(두 번 실패 뒤 제공): 결과는 같고 기록만 남는다 */
export function autoTune(t) {
  if (t.status === 'done' || t.misses < 2) return t;
  return { ...t, index: t.lanterns, status: 'done', assisted: true, lastResult: 'hit' };
}
