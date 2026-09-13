// 결정의 노래용 짧은 음. 소리가 없어도 퍼즐은 시각 신호만으로 풀 수 있다.

let ctx = null;
let muted = false;

export function setMuted(v) {
  muted = v;
}
export function isMuted() {
  return muted;
}

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function chime(freq, duration = 0.55, gain = 0.16) {
  if (muted || !ctx) return;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  out.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  out.connect(ctx.destination);
  for (const [mult, g] of [
    [1, 1],
    [2, 0.25],
    [3.01, 0.08],
  ]) {
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    og.gain.value = g;
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }
}

export function softBuzz() {
  if (muted || !ctx) return;
  chime(233.08, 0.4, 0.08);
}
