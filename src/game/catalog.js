// 제작 요소·재료·발견물 정의. 표시 문자열은 실제 한글 텍스트로 관리한다.

export const FORMS = [
  { id: 'orb', label: '구슬' },
  { id: 'flower', label: '꽃' },
  { id: 'shard', label: '파편' },
  { id: 'thread', label: '실' },
  { id: 'mist', label: '안개' },
  { id: 'crystal', label: '결정' },
];

// temp: -1(차가움) ~ 1(따뜻함). 목적지 게이지와 퀘스트 조건에 사용
export const COLORS = [
  { id: 'apricot', label: '살구빛', hex: '#FFB98A', temp: 0.8 },
  { id: 'rose', label: '분홍빛', hex: '#F7B3CF', temp: 0.5 },
  { id: 'mint', label: '민트빛', hex: '#9FE3C8', temp: -0.6 },
  { id: 'cream', label: '크림빛', hex: '#FFF0C9', temp: 0.1 },
  { id: 'lilac', label: '라일락빛', hex: '#C9B2F2', temp: -0.1 },
  { id: 'sky', label: '하늘빛', hex: '#A6C6FF', temp: -0.8 },
  { id: 'sunset', label: '노을빛', hex: '#FF9480', temp: 1, unlock: 'sunset' },
];

export const MOTIONS = [
  { id: 'float', label: '부유' },
  { id: 'pulse', label: '맥동' },
  { id: 'spin', label: '회전' },
  { id: 'twinkle', label: '점멸' },
  { id: 'slowpulse', label: '천천히 맥동', unlock: 'slowpulse' },
];

export const MATERIALS = {
  seed: { label: '별빛 씨앗', icon: 'orb' },
  shard: { label: '결정 조각', icon: 'crystal' },
};

export const UNLOCKS = {
  sunset: { label: '노을빛 배색', icon: 'flower' },
  slowpulse: { label: '천천히 맥동하는 기억', icon: 'mist' },
};

/** 장면 안에서 한 번만 얻는 발견물 */
export const DISCOVERIES = {
  walkwaySeed: { label: '촉수 아래 숨은 씨앗', scene: 'walkway', items: [{ kind: 'material', id: 'seed', amount: 1 }] },
  nurseryPool: { label: '씨앗 연못의 새싹', scene: 'nursery', items: [{ kind: 'material', id: 'seed', amount: 1 }] },
  solarGrove: { label: '태양씨앗 숲의 온기', scene: 'solar', items: [{ kind: 'material', id: 'seed', amount: 1 }] },
  twilightShard: { label: '따뜻함과 차가움의 공명 조각', scene: 'twilight', items: [{ kind: 'material', id: 'shard', amount: 1 }] },
};

export const byId = (list, id) => list.find((x) => x.id === id);

export function lightName(light) {
  const c = byId(COLORS, light.color);
  const f = byId(FORMS, light.form);
  return `${c?.label ?? ''} ${f?.label ?? ''}`.trim();
}

export function colorTemp(colorId) {
  return byId(COLORS, colorId)?.temp ?? 0;
}

export const SOFT_BRIGHTNESS = 60;
export const COOL_LIMIT = -0.25;
export const WARM_LIMIT = 0.25;
