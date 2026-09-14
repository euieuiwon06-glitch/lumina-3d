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
  { id: 'mint', label: '민트빛', hex: '#9FE3C8', temp: -0.6, unlock: 'mint' },
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
  recipe: { label: '첫 빛 제작법', icon: 'flower' },
  forms: { label: '빛의 형태 고르기', icon: 'flower' },
  brightness: { label: '밝기 조절', icon: 'orb' },
  bridge: { label: '촉수 다리 길', icon: 'thread' },
  mint: { label: '민트빛 배색', icon: 'crystal' },
  sunset: { label: '노을빛 배색', icon: 'flower' },
  slowpulse: { label: '천천히 맥동하는 기억', icon: 'mist' },
  petalScarf: { label: '꽃잎 목도리', icon: 'flower' },
  sunLight: { label: '햇살 씨앗의 빛', icon: 'orb' },
  auroraLight: { label: '오로라 결정의 빛', icon: 'crystal' },
};

/** 장면 안에서 한 번만 얻는 발견물 */
export const DISCOVERIES = {
  nurseryPool: { label: '씨앗 연못의 새싹', scene: 'nursery', items: [{ kind: 'material', id: 'seed', amount: 1 }] },
  solarGrove: { label: '태양씨앗 숲의 햇살 빛', scene: 'solar', items: [{ kind: 'unlock', id: 'sunLight' }, { kind: 'material', id: 'seed', amount: 1 }] },
  iceAurora: { label: '오로라 결정의 빛', scene: 'ice', items: [{ kind: 'unlock', id: 'auroraLight' }, { kind: 'material', id: 'shard', amount: 1 }] },
  twilightShard: { label: '따뜻함과 차가움의 공명 조각', scene: 'twilight', items: [{ kind: 'material', id: 'shard', amount: 1 }] },
};

/** 첫 항해에서 고를 수 있는 목적지(구현된 지역만) */
export const ROUTES = [
  { id: 'solar', label: '태양 정원', desc: '살구빛 꽃과 둥근 정원 섬이 떠 있는 따뜻한 곳', gift: '햇살 씨앗의 빛', warm: true },
  { id: 'ice', label: '얼음 성운', desc: '민트 결정과 오로라가 흐르는 차가운 곳', gift: '오로라 결정의 빛', warm: false },
];

// ------------------------------------------------------------------ 내 모습 만들기

/** 기본형: 능력 차이 없음. model은 캐릭터모델링.blend의 루미 */
export const BASES = [
  { id: 'ember', label: '불씨형', model: 'flame', desc: '둥근 머리 위 작은 불꽃이 숨 쉬듯 부풀어요' },
  { id: 'sprout', label: '새싹형', model: 'vine', desc: '머리 위 말린 새싹이 천천히 흔들려요' },
  { id: 'crystal', label: '결정형', model: 'hexa', desc: '부드러운 결정 머리 속 빛이 은은하게 반짝여요' },
];

export const BODY_COLORS = [
  { id: 'cream', label: '크림', hex: '#F7E6D6' },
  { id: 'lilac', label: '라일락', hex: '#D9C8F2' },
  { id: 'mint', label: '민트', hex: '#BFE8D6' },
  { id: 'apricot', label: '살구', hex: '#FFD3B4' },
  { id: 'sky', label: '하늘색', hex: '#C5DAFB' },
];

export const CHEST_COLORS = [
  { id: 'apricot', label: '살구빛', hex: '#FFB98A' },
  { id: 'mint', label: '민트빛', hex: '#9FE3C8' },
  { id: 'lilac', label: '라일락빛', hex: '#C9B2F2' },
  { id: 'cream', label: '크림빛', hex: '#FFF0C9' },
];

export const SYMBOLS = [
  { id: 'drop', label: '물방울' },
  { id: 'star', label: '별' },
  { id: 'moon', label: '달' },
];

export const ACCESSORIES = [
  { id: 'none', label: '장식 없음' },
  { id: 'scarf', label: '목도리' },
  { id: 'bracelet', label: '팔찌' },
  // 플레이 보상으로 열림
  { id: 'petalScarf', label: '꽃잎 목도리', unlock: 'petalScarf' },
];

export const DEFAULT_NAME = '루미';

export function createProfile() {
  return { created: false, base: 'ember', body: 'cream', chest: 'apricot', symbol: 'drop', accessory: 'none', name: DEFAULT_NAME };
}

/** 이름: 앞뒤 공백 제거, 12자, 비면 기본 이름 */
export function cleanName(name) {
  const t = String(name ?? '')
    .replace(/[<>]/g, '')
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, 12);
  return t || DEFAULT_NAME;
}

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
