// 결정의 노래: 결정이 빛나는(소리 나는) 순서를 기억해 같은 순서로 건드리는 퍼즐.
// 시간 진행(재생 타이밍)은 UI가 담당하고, 여기서는 상태 전이만 다룬다.

export const SONG = [0, 2, 1, 2];

export function createPuzzle(sequence = SONG) {
  return { sequence: [...sequence], status: 'idle', input: [], wrongAt: -1, heard: false };
}

/** 듣기 시작(처음 듣기·다시 듣기·다시 하기 공통). 입력은 비운다. */
export function listen(p) {
  if (p.status === 'success') return p;
  return { ...p, status: 'listening', input: [], wrongAt: -1 };
}

export function finishListening(p) {
  if (p.status !== 'listening') return p;
  return { ...p, status: 'input', heard: true };
}

export function press(p, crystal) {
  if (p.status !== 'input') return p;
  const index = p.input.length;
  const input = [...p.input, crystal];
  if (p.sequence[index] !== crystal) return { ...p, input, status: 'failure', wrongAt: index };
  if (input.length === p.sequence.length) return { ...p, input, status: 'success' };
  return { ...p, input };
}

export function progress(p) {
  return { done: p.status === 'success' ? p.sequence.length : p.status === 'failure' ? p.wrongAt : p.input.length, total: p.sequence.length };
}
