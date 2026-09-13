// UI 무대: 1672×941 시안 기준 px 단위를 유지한 채 창 전체를 덮는다.
// 3D 캔버스는 창 전체(레터박스 없음), UI는 짧은 변 기준으로 확대·축소하고 남는 쪽으로 넓어진다.

export const BASE_W = 1672;
export const BASE_H = 941;

export const stage = { scale: 1, W: BASE_W, H: BASE_H };

export function fitStage(viewW, viewH) {
  const scale = Math.min(viewW / BASE_W, viewH / BASE_H);
  return { scale, W: viewW / scale, H: viewH / scale };
}

/** 창 픽셀 → 무대 좌표 */
export function clientToStage(clientX, clientY) {
  return { x: clientX / stage.scale, y: clientY / stage.scale };
}

export function mountStage(stageEl, onResize) {
  function apply() {
    const fit = fitStage(window.innerWidth, window.innerHeight);
    Object.assign(stage, fit);
    stageEl.style.width = `${fit.W}px`;
    stageEl.style.height = `${fit.H}px`;
    stageEl.style.transform = `scale(${fit.scale})`;
    onResize?.(fit);
  }
  window.addEventListener('resize', apply);
  apply();
  return apply;
}
