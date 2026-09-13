// 게임 상태(저장 대상)와 행동. 표시 상태(열린 패널, 카메라, 애니메이션)는 여기 두지 않는다.
import { COLORS, COOL_LIMIT, DISCOVERIES, FORMS, MOTIONS, WARM_LIMIT, byId, colorTemp } from './catalog.js';
import { DESTINATIONS, QUESTS, QUEST_ORDER, SLOT_QUEST, STATUS, evaluateQuests, isDestination, lightAt } from './quests.js';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'lumina-3d-save';
export const SLOT_IDS = ['shelter', 'path2', 'helm', 'path3'];
export const SCENES = ['workshop', 'neighborhood', 'nursery', 'walkway', 'overlook', 'ice', 'solar', 'twilight'];
export const START_SCENE = 'workshop';

/** 걸어서 이어진 장면. [장면, 출구 표시] → [도착 장면, 도착 표시] */
export const LINKS = {
  'workshop:ENTRY_정원_교환광장': ['neighborhood', 'ENTRY_정원_교환광장'],
  'neighborhood:ENTRY_정원_교환광장': ['workshop', 'ENTRY_정원_교환광장'],
  'workshop:ENTRY_씨앗온실': ['nursery', 'EXIT_빛제작실'],
  'nursery:EXIT_빛제작실': ['workshop', 'ENTRY_씨앗온실'],
  'neighborhood:EXIT_촉수산책로': ['walkway', 'ENTRY_주거구역'],
  'walkway:ENTRY_주거구역': ['neighborhood', 'EXIT_촉수산책로'],
  'walkway:EXIT_전망대_항해정원': ['overlook', 'ENTRY_촉수산책로'],
  'overlook:ENTRY_촉수산책로': ['walkway', 'EXIT_전망대_항해정원'],
};

/** 항해 도착·귀환 지점 */
export const DOCKS = {
  overlook: 'POI_출항준비_빛오르간',
  ice: 'ENTRY_해파리선착장',
  solar: 'ENTRY_해파리외부항해_착륙지점',
  twilight: 'ENTRY_외부항해_도착테라스',
};

export function createInitialState() {
  const state = {
    version: SAVE_VERSION,
    scene: START_SCENE,
    arrival: null, // 다음 장면 진입 시 설 표시 이름(없으면 저장 위치 또는 기본 시작점)
    positions: Object.fromEntries(SCENES.map((s) => [s, null])),
    materials: { seed: 0, shard: 0 },
    unlocks: [],
    lights: [],
    nextLightId: 1,
    slots: { shelter: null, path2: null, helm: null, path3: null },
    quests: { shelter: 'locked', apricot: 'locked', voyage: 'locked', song: 'locked', finale: 'locked' },
    ledger: [], // 지급 완료된 보상 키. 같은 키는 두 번 지급하지 않는다
    draft: { form: 'flower', color: 'apricot', motion: 'float', brightness: 80 },
    voyage: { visited: { ice: false, solar: false, twilight: false }, trips: 0 },
    puzzle: { solved: false, attempts: 0 },
    flags: { introSeen: false, finaleSeen: false },
  };
  evaluateQuests(state);
  return state;
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const isInt = (n, min = 0) => Number.isInteger(n) && n >= min;
const isPos = (p) => p === null || (p && ['x', 'y', 'z', 'yaw'].every((k) => Number.isFinite(p[k])));

function validLight(l) {
  return (
    l &&
    isInt(l.id, 1) &&
    byId(FORMS, l.form) &&
    byId(COLORS, l.color) &&
    byId(MOTIONS, l.motion) &&
    Number.isFinite(l.brightness) &&
    l.brightness >= 0 &&
    l.brightness <= 100
  );
}

/**
 * 저장 데이터 검증. 구조가 조금이라도 어긋나면 해당 항목만 버리지 않고
 * 전체를 새 상태로 되돌린다(부분 복구가 보상 중복을 만들 수 있기 때문).
 */
export function sanitize(raw) {
  try {
    if (!raw || typeof raw !== 'object' || raw.version !== SAVE_VERSION) throw new Error('version');
    if (!SCENES.includes(raw.scene)) throw new Error('scene');
    if (raw.arrival !== null && typeof raw.arrival !== 'string') throw new Error('arrival');
    if (!raw.positions || SCENES.some((s) => !isPos(raw.positions[s] ?? null))) throw new Error('positions');
    if (!raw.materials || !isInt(raw.materials.seed) || !isInt(raw.materials.shard)) throw new Error('materials');
    if (!Array.isArray(raw.unlocks) || !raw.unlocks.every((u) => typeof u === 'string')) throw new Error('unlocks');
    if (!Array.isArray(raw.lights) || !raw.lights.every(validLight)) throw new Error('lights');
    if (!isInt(raw.nextLightId, 1) || raw.lights.some((l) => l.id >= raw.nextLightId)) throw new Error('lightId');
    if (!raw.slots || SLOT_IDS.some((k) => !(k in raw.slots))) throw new Error('slots');
    for (const k of SLOT_IDS) {
      const v = raw.slots[k];
      if (v !== null && !raw.lights.some((l) => l.id === v)) throw new Error('slotRef');
    }
    if (!raw.quests || QUEST_ORDER.some((id) => !STATUS.includes(raw.quests[id]))) throw new Error('quests');
    if (!Array.isArray(raw.ledger) || !raw.ledger.every((k) => typeof k === 'string')) throw new Error('ledger');
    for (const id of QUEST_ORDER) {
      if (raw.quests[id] === 'claimed' && !raw.ledger.includes(`reward:${id}`)) throw new Error('ledgerMismatch');
    }
    const d = raw.draft;
    if (!d || !byId(FORMS, d.form) || !byId(COLORS, d.color) || !byId(MOTIONS, d.motion) || !Number.isFinite(d.brightness))
      throw new Error('draft');
    const v = raw.voyage;
    if (!v || !v.visited || DESTINATIONS.some((k) => typeof v.visited[k] !== 'boolean') || !isInt(v.trips)) throw new Error('voyage');
    if (!raw.puzzle || typeof raw.puzzle.solved !== 'boolean' || !isInt(raw.puzzle.attempts)) throw new Error('puzzle');
    if (!raw.flags || typeof raw.flags.introSeen !== 'boolean' || typeof raw.flags.finaleSeen !== 'boolean') throw new Error('flags');
    const state = clone(raw);
    for (const s of SCENES) state.positions[s] ??= null;
    evaluateQuests(state);
    return { state, recovered: false };
  } catch (err) {
    return { state: createInitialState(), recovered: true, reason: err.message };
  }
}

export function loadState(storage) {
  let text = null;
  try {
    text = storage?.getItem(SAVE_KEY) ?? null;
  } catch {
    return { state: createInitialState(), notice: '이 브라우저에서는 저장을 읽을 수 없어 새로 시작해요.' };
  }
  if (text === null) return { state: createInitialState(), notice: null, fresh: true };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { state: createInitialState(), notice: '저장 데이터가 손상되어 새로 시작해요.' };
  }
  const { state, recovered } = sanitize(raw);
  return { state, notice: recovered ? '저장 데이터를 복구하지 못해 새로 시작해요.' : null };
}

export function saveState(storage, state) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ 행동

function grant(state, items, keyPrefix, events) {
  items.forEach((item, i) => {
    const key = `${keyPrefix}:${i}`;
    if (state.ledger.includes(key)) return;
    state.ledger.push(key);
    if (item.kind === 'material') state.materials[item.id] += item.amount;
    if (item.kind === 'unlock' && !state.unlocks.includes(item.id)) state.unlocks.push(item.id);
    events.push({ type: 'granted', item });
  });
}

export function hasUnlock(state, id) {
  return !id || state.unlocks.includes(id);
}

export const isDiscovered = (state, id) => state.ledger.includes(`discover:${id}`);

/** 설치 가능 여부와 불가 사유 */
export function slotAvailability(state, slotId) {
  const questId = SLOT_QUEST[slotId];
  const st = state.quests[questId];
  const placed = lightAt(state, slotId);
  if (st === 'claimed') return { canPlace: false, canRetrieve: false, reason: '주민이 아끼는 빛이라 그대로 두어요.' };
  if (st !== 'active' && st !== 'completed') {
    return { canPlace: false, canRetrieve: false, reason: `아직 잠든 자리예요. ‘${QUESTS[questId].title}’ 부탁을 받으면 열려요.` };
  }
  if (placed) return { canPlace: false, canRetrieve: true, reason: '이미 빛이 놓여 있어요. 거두면 씨앗으로 돌아와요.' };
  if (state.materials.seed < 1) return { canPlace: false, canRetrieve: false, reason: '별빛 씨앗이 없어요. 산책로·온실에서 찾아볼 수 있어요.' };
  return { canPlace: true, canRetrieve: false, reason: null };
}

/** 항해 정원(빛 오르간)의 빛이 가리키는 목적지 */
export function destinationFor(state) {
  const helm = lightAt(state, 'helm');
  if (!helm) return null;
  const t = colorTemp(helm.color);
  if (t <= COOL_LIMIT) return 'ice';
  if (t >= WARM_LIMIT) return 'solar';
  return 'twilight';
}

export function canDepart(state) {
  if (isDestination(state.scene)) return { ok: true, to: 'overlook', reason: null };
  if (state.scene !== 'overlook') return { ok: false, to: null, reason: '항해 전망대의 빛 오르간에서 출항할 수 있어요.' };
  const to = destinationFor(state);
  if (!to) return { ok: false, to: null, reason: '빛 오르간에 빛을 보내야 해파리가 움직여요.' };
  return { ok: true, to, reason: null };
}

/**
 * 순수 상태 전이. 원본 state를 바꾸지 않고 { state, events, error } 를 돌려준다.
 */
export function reduce(prev, action) {
  const state = clone(prev);
  const events = [];
  let error = null;
  switch (action.type) {
    case 'seeIntro':
      state.flags.introSeen = true;
      break;
    case 'seeFinale':
      state.flags.finaleSeen = true;
      break;
    case 'setDraft': {
      const { key, value } = action;
      if (key === 'form' && byId(FORMS, value)) state.draft.form = value;
      else if (key === 'color') {
        const c = byId(COLORS, value);
        if (c && hasUnlock(state, c.unlock)) state.draft.color = value;
        else error = '아직 배우지 못한 배색이에요.';
      } else if (key === 'motion') {
        const m = byId(MOTIONS, value);
        if (m && hasUnlock(state, m.unlock)) state.draft.motion = value;
        else error = '아직 모르는 움직임이에요.';
      } else if (key === 'brightness' && Number.isFinite(value)) {
        state.draft.brightness = Math.max(20, Math.min(100, Math.round(value)));
      } else error = '알 수 없는 제작 값이에요.';
      break;
    }
    case 'acceptQuest': {
      const id = action.id;
      if (state.quests[id] !== 'available') {
        error = '지금은 받을 수 없는 부탁이에요.';
        break;
      }
      state.quests[id] = 'active';
      grant(state, QUESTS[id].onAccept ?? [], `accept:${id}`, events);
      events.push({ type: 'questAccepted', id });
      break;
    }
    case 'claimReward': {
      const id = action.id;
      const key = `reward:${id}`;
      if (state.quests[id] !== 'completed' || state.ledger.includes(key)) {
        error = state.quests[id] === 'claimed' ? '이미 받은 선물이에요.' : '아직 부탁을 끝내지 않았어요.';
        break;
      }
      state.ledger.push(key);
      grant(state, QUESTS[id].rewards, `rewardItem:${id}`, events);
      state.quests[id] = 'claimed';
      events.push({ type: 'questClaimed', id });
      break;
    }
    case 'placeLight': {
      const slotId = action.slot;
      if (!SLOT_IDS.includes(slotId)) {
        error = '없는 설치 지점이에요.';
        break;
      }
      const av = slotAvailability(state, slotId);
      if (!av.canPlace) {
        error = av.reason;
        break;
      }
      const d = state.draft;
      if (!hasUnlock(state, byId(COLORS, d.color)?.unlock) || !hasUnlock(state, byId(MOTIONS, d.motion)?.unlock)) {
        error = '아직 쓸 수 없는 성질이 들어 있어요.';
        break;
      }
      // 제작: 씨앗 1개로 빛 인스턴스 생성 → 설치
      state.materials.seed -= 1;
      const light = { id: state.nextLightId++, form: d.form, color: d.color, motion: d.motion, brightness: d.brightness };
      state.lights.push(light);
      events.push({ type: 'lightCrafted', light });
      state.slots[slotId] = light.id;
      events.push({ type: 'lightPlaced', slot: slotId, light });
      break;
    }
    case 'retrieveLight': {
      const slotId = action.slot;
      const av = SLOT_IDS.includes(slotId) ? slotAvailability(state, slotId) : { canRetrieve: false, reason: '없는 설치 지점이에요.' };
      if (!av.canRetrieve) {
        error = av.reason;
        break;
      }
      const lightId = state.slots[slotId];
      state.slots[slotId] = null;
      state.lights = state.lights.filter((l) => l.id !== lightId);
      state.materials.seed += 1;
      events.push({ type: 'lightRetrieved', slot: slotId });
      break;
    }
    case 'travel': {
      const link = LINKS[`${state.scene}:${action.via}`];
      if (!link) {
        error = '이쪽으로는 아직 갈 수 없어요.';
        break;
      }
      state.scene = link[0];
      state.arrival = link[1];
      events.push({ type: 'entered', scene: link[0] });
      break;
    }
    case 'depart': {
      const check = canDepart(state);
      if (!check.ok) {
        error = check.reason;
        break;
      }
      state.scene = check.to;
      state.arrival = DOCKS[check.to];
      state.voyage.trips += 1;
      if (isDestination(check.to)) state.voyage.visited[check.to] = true;
      events.push({ type: 'arrived', scene: check.to });
      break;
    }
    case 'discover': {
      const info = DISCOVERIES[action.id];
      if (!info || info.scene !== state.scene) {
        error = '여기서는 찾을 수 없어요.';
        break;
      }
      const key = `discover:${action.id}`;
      if (state.ledger.includes(key)) {
        error = '이미 살펴본 곳이에요.';
        break;
      }
      state.ledger.push(key);
      grant(state, info.items, `discoverItem:${action.id}`, events);
      events.push({ type: 'discovered', id: action.id });
      break;
    }
    case 'setPosition': {
      const { scene, x, y, z, yaw } = action;
      if (SCENES.includes(scene) && [x, y, z, yaw].every(Number.isFinite)) {
        const r = (n) => Math.round(n * 100) / 100;
        state.positions[scene] = { x: r(x), y: r(y), z: r(z), yaw: r(yaw) };
        if (scene === state.scene) state.arrival = null;
      }
      break;
    }
    case 'puzzleResult': {
      if (state.scene !== 'ice') {
        error = '얼음 성운에서만 들을 수 있어요.';
        break;
      }
      if (action.success) {
        if (!state.puzzle.solved) events.push({ type: 'puzzleSolved' });
        state.puzzle.solved = true;
      } else {
        state.puzzle.attempts += 1;
      }
      break;
    }
    default:
      error = `unknown action ${action.type}`;
  }
  if (error) return { state: prev, events: [], error };
  events.push(...evaluateQuests(state));
  return { state, events, error: null };
}
