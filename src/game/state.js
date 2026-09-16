// 게임 상태(저장 대상)와 행동. 표시 상태(열린 패널, 카메라, 연출)는 여기 두지 않는다.
import { ACCESSORIES, BASES, BODY_COLORS, CHEST_COLORS, COLORS, DISCOVERIES, FORMS, GUIDE_SOFT, MOTIONS, REPLY_SPOTS, ROUTES, SYMBOLS, byId, cleanName, createProfile, flowerReaction, isCoolLight } from './catalog.js';
import { DESTINATIONS, QUESTS, QUEST_ORDER, SLOT_QUEST, STATUS, carriedLights, evaluateQuests, isDestination, lightAt, lightById } from './quests.js';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'lumina-3d-save-v2';
export const LEGACY_KEYS = ['lumina-3d-save'];
export const SLOT_IDS = ['lantern', 'shelter', 'replyRest', 'replyPath', 'replySignal'];
export const SCENES = ['workshop', 'neighborhood', 'nursery', 'walkway', 'overlook', 'ice', 'solar', 'twilight'];
export const START_SCENE = 'workshop';
export const NPC_IDS = ['salgu', 'ribbon', 'bora', 'pogeun'];
export const RELATIONS = ['stranger', 'met', 'accepted', 'progress', 'resolved', 'companion'];
export const TUTORIAL_STEPS = ['move', 'look', 'bench', 'craft', 'place', 'tune', 'trade', 'voyage'];

/** 걸어서 이어진 장면. [장면:출구 표시] → [도착 장면, 도착 표시, 이동 방식] */
export const LINKS = {
  'workshop:ENTRY_정원_교환광장': ['neighborhood', 'ENTRY_정원_교환광장', 'door'],
  'neighborhood:ENTRY_정원_교환광장': ['workshop', 'ENTRY_정원_교환광장', 'door'],
  'workshop:ENTRY_씨앗온실': ['nursery', 'EXIT_빛제작실', 'door'],
  'nursery:EXIT_빛제작실': ['workshop', 'ENTRY_씨앗온실', 'door'],
  'neighborhood:EXIT_촉수산책로': ['walkway', 'ENTRY_주거구역', 'door'],
  'walkway:ENTRY_주거구역': ['neighborhood', 'EXIT_촉수산책로', 'door'],
  'walkway:EXIT_전망대_항해정원': ['overlook', 'ENTRY_촉수산책로', 'lift'],
  'overlook:ENTRY_촉수산책로': ['walkway', 'EXIT_전망대_항해정원', 'lift'],
};

/** 항해 도착·귀환 지점 */
export const DOCKS = {
  overlook: 'POI_출항준비_빛오르간',
  ice: 'ENTRY_해파리선착장',
  solar: 'ENTRY_해파리외부항해_착륙지점',
  twilight: 'ENTRY_외부항해_도착테라스',
};

function createWorld() {
  return {
    benchOpened: false,
    firstCrafted: false,
    tuned: false,
    tunedAssisted: false,
    bridgeRestored: false,
    budAwake: false,
    traded: false,
    woven: false,
    organFed: false,
    route: null,
    arrived: false,
    chapterDone: false,
    openingSeen: false,
  };
}

/** 두 번째 이야기(첫 항해 이후) 진행 */
export function createStory() {
  return {
    traceSeen: false, // 누군가 남긴 낯선 빛을 봄
    clues: [], // 얻은 단서: 'solar' | 'ice'
    shown: 0, // 보라에게 보여 준 단서 수
    flowerTries: 0,
    flowerOpen: false,
    iceTraces: [], // 비춘 결정 흔적 번호
    cluesWoven: false,
    jellyMet: false,
    guideStep: 0, // 작은 해파리가 따라온 빛길 수(3 = 선착장)
    replySent: false,
  };
}

const STORY_BOOLS = ['traceSeen', 'flowerOpen', 'cluesWoven', 'jellyMet', 'replySent'];

/**
 * 예전 저장에 새 필드를 안전한 기본값으로 채운다(완료한 진행은 그대로).
 * 새 퀘스트는 locked로 시작하고 evaluateQuests가 조건에 맞게 연다.
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== SAVE_VERSION) return raw;
  const r = clone(raw);
  if (r.quests && typeof r.quests === 'object') for (const id of QUEST_ORDER) if (!(id in r.quests)) r.quests[id] = 'locked';
  if (r.world && typeof r.world === 'object') r.world = { ...createWorld(), ...r.world };
  if (r.slots && typeof r.slots === 'object') for (const k of SLOT_IDS) if (!(k in r.slots)) r.slots[k] = null;
  r.story = { ...createStory(), ...(r.story && typeof r.story === 'object' ? r.story : {}) };
  return r;
}

export function createInitialState() {
  const state = {
    version: SAVE_VERSION,
    profile: createProfile(),
    scene: START_SCENE,
    arrival: null,
    positions: Object.fromEntries(SCENES.map((s) => [s, null])),
    materials: { seed: 0, shard: 0 },
    unlocks: [],
    lights: [],
    nextLightId: 1,
    slots: Object.fromEntries(SLOT_IDS.map((k) => [k, null])),
    quests: Object.fromEntries(QUEST_ORDER.map((id) => [id, 'locked'])),
    relations: Object.fromEntries(NPC_IDS.map((id) => [id, 'stranger'])),
    tutorial: { done: [] },
    world: createWorld(),
    ledger: [],
    draft: { form: 'orb', color: 'apricot', motion: 'pulse', brightness: 80 },
    voyage: { visited: { ice: false, solar: false, twilight: false }, trips: 0 },
    puzzle: { solved: false, attempts: 0 },
    discovered: [],
    story: createStory(),
  };
  evaluateQuests(state);
  return state;
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const isInt = (n, min = 0) => Number.isInteger(n) && n >= min;
const isPos = (p) => p === null || (p && ['x', 'y', 'z', 'yaw'].every((k) => Number.isFinite(p[k])));
const isBool = (v) => typeof v === 'boolean';

function validLight(l) {
  return (
    l &&
    isInt(l.id, 1) &&
    byId(FORMS, l.form) &&
    byId(COLORS, l.color) &&
    byId(MOTIONS, l.motion) &&
    Number.isFinite(l.brightness) &&
    l.brightness >= 0 &&
    l.brightness <= 100 &&
    ['crafted', 'traded', 'woven'].includes(l.origin)
  );
}

function validProfile(p) {
  return (
    p &&
    isBool(p.created) &&
    byId(BASES, p.base) &&
    byId(BODY_COLORS, p.body) &&
    byId(CHEST_COLORS, p.chest) &&
    byId(SYMBOLS, p.symbol) &&
    byId(ACCESSORIES, p.accessory) &&
    typeof p.name === 'string' &&
    p.name.length <= 12
  );
}

/**
 * 저장 데이터 검증. 구조가 조금이라도 어긋나면 전체를 새 상태로 되돌린다
 * (부분 복구가 보상 중복을 만들 수 있기 때문).
 */
export function sanitize(input) {
  try {
    const raw = migrate(input);
    if (!raw || typeof raw !== 'object' || raw.version !== SAVE_VERSION) throw new Error('version');
    if (!validProfile(raw.profile)) throw new Error('profile');
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
    if (!raw.relations || NPC_IDS.some((id) => !RELATIONS.includes(raw.relations[id]))) throw new Error('relations');
    if (!raw.tutorial || !Array.isArray(raw.tutorial.done)) throw new Error('tutorial');
    const wd = raw.world;
    const base = createWorld();
    if (!wd || Object.keys(base).some((k) => (k === 'route' ? !(wd.route === null || ROUTES.some((r) => r.id === wd.route)) : !isBool(wd[k]))))
      throw new Error('world');
    if (!Array.isArray(raw.ledger) || !raw.ledger.every((k) => typeof k === 'string')) throw new Error('ledger');
    for (const id of QUEST_ORDER) {
      if (raw.quests[id] === 'claimed' && !raw.ledger.includes(`reward:${id}`)) throw new Error('ledgerMismatch');
    }
    const d = raw.draft;
    if (!d || !byId(FORMS, d.form) || !byId(COLORS, d.color) || !byId(MOTIONS, d.motion) || !Number.isFinite(d.brightness)) throw new Error('draft');
    const v = raw.voyage;
    if (!v || !v.visited || DESTINATIONS.some((k) => !isBool(v.visited[k])) || !isInt(v.trips)) throw new Error('voyage');
    if (!raw.puzzle || !isBool(raw.puzzle.solved) || !isInt(raw.puzzle.attempts)) throw new Error('puzzle');
    if (!Array.isArray(raw.discovered)) throw new Error('discovered');
    const so = raw.story;
    if (
      !so ||
      STORY_BOOLS.some((k) => !isBool(so[k])) ||
      !Array.isArray(so.clues) ||
      !so.clues.every((c) => c === 'solar' || c === 'ice') ||
      !Array.isArray(so.iceTraces) ||
      !so.iceTraces.every((i) => isInt(i)) ||
      !isInt(so.shown) ||
      !isInt(so.flowerTries) ||
      !isInt(so.guideStep) ||
      so.guideStep > 3
    )
      throw new Error('story');
    const state = clone(raw);
    evaluateQuests(state);
    return { state, recovered: false };
  } catch (err) {
    return { state: createInitialState(), recovered: true, reason: err.message };
  }
}

export function loadState(storage) {
  let text = null;
  let legacy = false;
  try {
    text = storage?.getItem(SAVE_KEY) ?? null;
    legacy = LEGACY_KEYS.some((k) => storage?.getItem(k) !== null && storage?.getItem(k) !== undefined);
  } catch {
    return { state: createInitialState(), notice: '이 브라우저에서는 저장을 읽을 수 없어 새로 시작해요.', hasSave: false };
  }
  if (text === null) return { state: createInitialState(), notice: null, hasSave: false, legacy };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { state: createInitialState(), notice: '저장 데이터가 손상되어 새로 시작해요.', hasSave: false };
  }
  const { state, recovered } = sanitize(raw);
  return { state, notice: recovered ? '저장 데이터를 복구하지 못해 새로 시작해요.' : null, hasSave: !recovered && state.profile.created };
}

export function saveState(storage, state) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ 규칙

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

export const hasUnlock = (state, id) => !id || state.unlocks.includes(id);
export const isDiscovered = (state, id) => state.discovered.includes(id);

/** 기능을 여는 순서: 첫 제작은 색과 맥동만 → 첫 설치 뒤 형태 → 포근 부탁에서 밝기 */
export function craftOptions(state) {
  return {
    forms: hasUnlock(state, 'forms'),
    motions: hasUnlock(state, 'recipe') ? MOTIONS.filter((m) => hasUnlock(state, m.unlock)).map((m) => m.id) : ['pulse'],
    brightness: hasUnlock(state, 'brightness'),
    colors: COLORS.filter((c) => hasUnlock(state, c.unlock)).map((c) => c.id),
  };
}

/** 빛 만들기 비용: 첫 빛은 재료 없이. 두 번째 이야기에서는 손에 든 빛이 없을 때 한 개를 재료 없이(진행이 막히지 않게) */
export function craftCost(state) {
  if (!state.world.firstCrafted) return 0;
  const inHand = carriedLights(state).some((l) => l.origin === 'crafted');
  return state.story?.traceSeen && !inHand ? 0 : 1;
}

/** 퀘스트에 비춰 볼 빛: 들고 있는 내 빛 중 가장 최근 것(없으면 null). 비춰도 사라지지 않는다 */
export function lightInHand(state, lightId = null) {
  const carried = carriedLights(state).filter((l) => l.origin === 'crafted');
  if (lightId !== null) return carried.find((l) => l.id === lightId) ?? null;
  return carried[carried.length - 1] ?? null;
}

/** 답장 세 지점이 모두 조건을 채웠는지 */
export const replyReady = (state) => REPLY_SPOTS.every((r) => r.check(lightAt(state, r.slot)));

/** 지금 고를 수 있는 항로 */
export const availableRoutes = (state) => ROUTES.filter((r) => hasUnlock(state, r.requires));

export function slotAvailability(state, slotId, lightId = null) {
  const questId = SLOT_QUEST[slotId];
  const st = state.quests[questId];
  const placed = lightAt(state, slotId);
  if (st === 'claimed') return { canPlace: false, canRetrieve: false, reason: '주민이 아끼는 빛이라 그대로 두어요.' };
  if (st !== 'active' && st !== 'completed') {
    const q = QUESTS[questId];
    return { canPlace: false, canRetrieve: false, reason: `아직 잠든 자리예요. ‘${q.title}’ 부탁을 받으면 열려요.` };
  }
  if (slotId === 'lantern' && state.world.tuned) return { canPlace: false, canRetrieve: false, reason: '등불들이 이 빛에 박자를 맞췄어요.' };
  if (questId === 'reply' && state.story?.replySent) return { canPlace: false, canRetrieve: false, reason: '답장에 실어 보낸 빛이라 그대로 두어요.' };
  if (placed) return { canPlace: false, canRetrieve: true, reason: '이미 빛이 놓여 있어요. 거두면 다시 들고 다녀요.' };
  const carried = carriedLights(state).filter((l) => l.origin === 'crafted');
  if (!carried.length) return { canPlace: false, canRetrieve: false, reason: '들고 있는 빛이 없어요. 빛 제작실 작업대에서 빚을 수 있어요.' };
  if (lightId !== null && !carried.some((l) => l.id === lightId)) return { canPlace: false, canRetrieve: false, reason: '그 빛은 지금 들고 있지 않아요.' };
  return { canPlace: true, canRetrieve: false, reason: null };
}

export function canDepart(state) {
  if (isDestination(state.scene)) return { ok: true, to: 'overlook', reason: null };
  if (state.scene !== 'overlook') return { ok: false, to: null, reason: '항해 전망대의 항해 나무에서 출항할 수 있어요.' };
  if (!state.world.organFed) return { ok: false, to: null, reason: '항해 나무가 아직 반응하지 않아요. 엮은 빛이 필요해요.' };
  if (!state.world.route) return { ok: false, to: null, reason: '보라와 함께 목적지를 먼저 골라요.' };
  return { ok: true, to: state.world.route, reason: null };
}

const RELATION_RANK = (r) => RELATIONS.indexOf(r);
function raiseRelation(state, npc, rel) {
  if (!NPC_IDS.includes(npc)) return;
  if (RELATION_RANK(rel) > RELATION_RANK(state.relations[npc])) state.relations[npc] = rel;
}

/**
 * 순수 상태 전이. 원본 state를 바꾸지 않고 { state, events, error } 를 돌려준다.
 */
export function reduce(prev, action) {
  const state = clone(prev);
  const events = [];
  let error = null;
  const W = state.world;
  switch (action.type) {
    // ---------------------------------------------------- 내 모습
    case 'setProfile': {
      const p = { ...state.profile, ...action.profile };
      if (!byId(BASES, p.base) || !byId(BODY_COLORS, p.body) || !byId(CHEST_COLORS, p.chest) || !byId(SYMBOLS, p.symbol)) {
        error = '고를 수 없는 모습이에요.';
        break;
      }
      const acc = byId(ACCESSORIES, p.accessory);
      if (!acc || !hasUnlock(state, acc.unlock)) {
        error = '아직 받지 못한 장식이에요.';
        break;
      }
      p.name = cleanName(p.name);
      if (action.confirm) {
        if (!p.created) events.push({ type: 'profileCreated' });
        p.created = true;
      }
      state.profile = p;
      break;
    }
    case 'seeOpening':
      W.openingSeen = true;
      break;
    case 'tutorial': {
      const id = action.id;
      if (TUTORIAL_STEPS.includes(id) && !state.tutorial.done.includes(id)) {
        state.tutorial.done.push(id);
        events.push({ type: 'tutorialStep', id });
      }
      break;
    }
    // ---------------------------------------------------- 주민
    case 'meet':
      raiseRelation(state, action.npc, 'met');
      break;
    case 'walkTogether':
      if (state.relations[action.npc] !== 'resolved' && state.relations[action.npc] !== 'companion') {
        error = '아직 함께 걸을 사이가 아니에요.';
        break;
      }
      raiseRelation(state, action.npc, 'companion');
      break;
    case 'acceptQuest': {
      const id = action.id;
      if (state.quests[id] !== 'available') {
        error = '지금은 받을 수 없는 부탁이에요.';
        break;
      }
      state.quests[id] = 'active';
      grant(state, QUESTS[id].onAccept ?? [], `accept:${id}`, events);
      raiseRelation(state, QUESTS[id].giver, 'accepted');
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
      if (QUESTS[id].auto && !action.auto) {
        error = '이 목표는 스스로 완료돼요.';
        break;
      }
      state.ledger.push(key);
      grant(state, QUESTS[id].rewards, `rewardItem:${id}`, events);
      state.quests[id] = 'claimed';
      raiseRelation(state, QUESTS[id].giver, 'resolved');
      if (id === 'q04') {
        W.chapterDone = true;
        events.push({ type: 'chapterDone' });
      }
      events.push({ type: 'questClaimed', id });
      break;
    }
    // ---------------------------------------------------- 제작
    case 'openBench':
      if (!W.benchOpened) {
        W.benchOpened = true;
        events.push({ type: 'benchOpened' });
      }
      break;
    case 'setDraft': {
      const { key, value } = action;
      const opt = craftOptions(state);
      if (key === 'form') {
        if (!byId(FORMS, value)) error = '알 수 없는 형태예요.';
        else if (!opt.forms && value !== state.draft.form) error = '형태는 첫 빛을 놓은 뒤에 고를 수 있어요.';
        else state.draft.form = value;
      } else if (key === 'color') {
        if (opt.colors.includes(value)) state.draft.color = value;
        else error = '아직 배우지 못한 배색이에요.';
      } else if (key === 'motion') {
        if (opt.motions.includes(value)) state.draft.motion = value;
        else error = '아직 모르는 움직임이에요.';
      } else if (key === 'brightness' && Number.isFinite(value)) {
        if (!opt.brightness) error = '밝기 조절은 포근에게 배울 수 있어요.';
        else state.draft.brightness = Math.max(20, Math.min(100, Math.round(value)));
      } else error = '알 수 없는 제작 값이에요.';
      break;
    }
    case 'craftLight': {
      if (!W.benchOpened) {
        error = '작업대를 먼저 깨워요.';
        break;
      }
      const cost = craftCost(state);
      if (state.materials.seed < cost) {
        error = '별빛 씨앗이 필요해요. 주민 부탁이나 씨앗 온실에서 얻을 수 있어요.';
        break;
      }
      state.materials.seed -= cost;
      const d = state.draft;
      const light = { id: state.nextLightId++, form: d.form, color: d.color, motion: d.motion, brightness: d.brightness, origin: 'crafted' };
      state.lights.push(light);
      if (!W.firstCrafted) {
        W.firstCrafted = true;
        events.push({ type: 'firstLight', light });
      }
      events.push({ type: 'lightCrafted', light });
      break;
    }
    case 'reshapeLight': {
      const l = lightById(state, action.lightId);
      if (!l || l.origin !== 'crafted' || !carriedLights(state).some((c) => c.id === l.id)) {
        error = '들고 있는 내 빛만 다시 빚을 수 있어요.';
        break;
      }
      Object.assign(l, { form: state.draft.form, color: state.draft.color, motion: state.draft.motion, brightness: state.draft.brightness });
      events.push({ type: 'lightReshaped', light: { ...l } });
      break;
    }
    case 'placeLight': {
      const slotId = action.slot;
      if (!SLOT_IDS.includes(slotId)) {
        error = '없는 설치 지점이에요.';
        break;
      }
      const carried = carriedLights(state).filter((l) => l.origin === 'crafted');
      const lightId = action.lightId ?? carried[carried.length - 1]?.id ?? null;
      const av = slotAvailability(state, slotId, lightId);
      if (!av.canPlace) {
        error = av.reason;
        break;
      }
      state.slots[slotId] = lightId;
      events.push({ type: 'lightPlaced', slot: slotId, light: lightById(state, lightId) });
      break;
    }
    case 'retrieveLight': {
      const slotId = action.slot;
      const av = SLOT_IDS.includes(slotId) ? slotAvailability(state, slotId) : { canRetrieve: false, reason: '없는 설치 지점이에요.' };
      if (!av.canRetrieve) {
        error = av.reason;
        break;
      }
      state.slots[slotId] = null;
      events.push({ type: 'lightRetrieved', slot: slotId });
      break;
    }
    // ---------------------------------------------------- 길 복원
    case 'tuned': {
      if (!lightAt(state, 'lantern')) {
        error = '첫 등불에 빛을 먼저 놓아요.';
        break;
      }
      if (!W.tuned) {
        W.tuned = true;
        W.tunedAssisted = !!action.assisted;
        events.push({ type: 'lanternsTuned' });
      }
      break;
    }
    case 'restoreBridge':
      if (!W.tuned) {
        error = '등불의 박자가 아직 어긋나 있어요.';
        break;
      }
      if (!W.bridgeRestored) {
        W.bridgeRestored = true;
        raiseRelation(state, 'salgu', 'progress');
        grant(state, [{ kind: 'unlock', id: 'bridge' }], 'bridge', events);
        events.push({ type: 'bridgeRestored' });
      }
      break;
    // ---------------------------------------------------- 교환·엮기
    case 'wakeBud':
      if (state.quests.q03 !== 'active') {
        error = '리본의 이야기를 먼저 들어 보세요.';
        break;
      }
      if (!W.budAwake) {
        W.budAwake = true;
        events.push({ type: 'budAwake' });
      }
      break;
    case 'trade': {
      if (!W.budAwake) {
        error = '봉오리가 깨어나야 리본이 빛을 나눌 수 있어요.';
        break;
      }
      if (W.traded) {
        error = '이미 빛을 나눴어요.';
        break;
      }
      // 규칙: 리본은 내 빛의 원본이 아니라 복제한 작은 조각을 받는다(내 빛은 그대로)
      const light = { id: state.nextLightId++, form: 'orb', color: 'mint', motion: 'float', brightness: 70, origin: 'traded' };
      state.lights.push(light);
      W.traded = true;
      raiseRelation(state, 'ribbon', 'progress');
      grant(state, [], 'trade', events);
      events.push({ type: 'traded', light });
      break;
    }
    case 'weave': {
      const got = carriedLights(state).find((l) => l.origin === 'traded');
      const mine = state.lights.find((l) => l.origin === 'crafted');
      if (!got || !mine) {
        error = '내 빛의 제작법과 받은 빛이 함께 있어야 엮을 수 있어요.';
        break;
      }
      state.lights = state.lights.filter((l) => l.id !== got.id);
      const woven = { id: state.nextLightId++, form: 'thread', color: mine.color, motion: 'pulse', brightness: 80, origin: 'woven' };
      state.lights.push(woven);
      W.woven = true;
      events.push({ type: 'woven', light: woven });
      break;
    }
    // ---------------------------------------------------- 항해
    case 'feedOrgan': {
      if (state.scene !== 'overlook') {
        error = '항해 전망대의 항해 나무에 보낼 수 있어요.';
        break;
      }
      if (state.quests.q04 !== 'active') {
        error = '보라와 먼저 이야기해 보세요.';
        break;
      }
      const woven = carriedLights(state).find((l) => l.origin === 'woven');
      if (!woven) {
        error = '엮은 빛이 필요해요.';
        break;
      }
      state.lights = state.lights.filter((l) => l.id !== woven.id);
      W.organFed = true;
      events.push({ type: 'organFed' });
      break;
    }
    case 'chooseRoute': {
      if (!W.organFed) {
        error = '항해 나무가 먼저 깨어나야 해요.';
        break;
      }
      if (!availableRoutes(state).some((r) => r.id === action.route)) {
        error = '지금은 갈 수 없는 곳이에요.';
        break;
      }
      W.route = action.route;
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
      events.push({ type: 'departed', scene: check.to });
      break;
    }
    case 'arrivalControl': {
      if (!isDestination(state.scene)) break;
      if (!W.arrived) {
        W.arrived = true;
        events.push({ type: 'arrived', scene: state.scene });
      }
      break;
    }
    case 'travel': {
      const link = LINKS[`${state.scene}:${action.via}`];
      if (!link) {
        error = '이쪽으로는 아직 갈 수 없어요.';
        break;
      }
      if (link[0] === 'overlook' && !W.bridgeRestored) {
        error = '판석 다리가 흩어져 있어요. 등불 박자를 맞추면 길이 이어져요.';
        break;
      }
      state.scene = link[0];
      state.arrival = link[1];
      events.push({ type: 'entered', scene: link[0], via: link[2] });
      break;
    }
    case 'discover': {
      const info = DISCOVERIES[action.id];
      if (!info || info.scene !== state.scene) {
        error = '여기서는 찾을 수 없어요.';
        break;
      }
      if (state.discovered.includes(action.id)) {
        error = '이미 살펴본 곳이에요.';
        break;
      }
      state.discovered.push(action.id);
      grant(state, info.items, `discover:${action.id}`, events);
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
    // ---------------------------------------------------- 두 번째 이야기
    case 'seeTrace': {
      if (!W.chapterDone) {
        error = '첫 항해를 먼저 마쳐요.';
        break;
      }
      if (!state.story.traceSeen) {
        state.story.traceSeen = true;
        events.push({ type: 'traceSeen', scene: state.scene });
      }
      break;
    }
    case 'lightFlower': {
      const S = state.story;
      if (state.scene !== 'solar' || state.quests.flower !== 'active') {
        error = '살구의 부탁을 들은 뒤 꽃을 살펴볼 수 있어요.';
        break;
      }
      const l = lightInHand(state, action.lightId ?? null);
      if (!l) {
        error = '비출 빛이 없어요. 가까이에서 빛을 빚어 볼까요?';
        break;
      }
      const result = flowerReaction(l);
      S.flowerTries += 1;
      if (result === 'open' && !S.flowerOpen) S.flowerOpen = true;
      events.push({ type: 'flowerReact', result, light: { ...l } });
      break;
    }
    case 'readFlowerClue':
      if (!state.story.flowerOpen) {
        error = '꽃이 아직 몸을 오므리고 있어요.';
        break;
      }
      if (!state.story.clues.includes('solar')) {
        state.story.clues.push('solar');
        events.push({ type: 'clueFound', id: 'solar' });
      }
      break;
    case 'lightIceTrace': {
      const S = state.story;
      if (state.scene !== 'ice' || state.quests.icepath !== 'active') {
        error = '리본의 이야기를 들은 뒤 결정을 살펴볼 수 있어요.';
        break;
      }
      const idx = action.index;
      if (!isInt(idx) || idx > 2) {
        error = '없는 흔적이에요.';
        break;
      }
      if (S.iceTraces.includes(idx)) {
        error = '이미 드러난 흔적이에요.';
        break;
      }
      if (idx !== S.iceTraces.length) {
        error = '앞선 흔적이 가리키는 곳부터 비춰 봐요.';
        break;
      }
      const l = lightInHand(state, action.lightId ?? null);
      if (!l) {
        error = '비출 빛이 없어요. 가까이에서 빛을 빚어 볼까요?';
        break;
      }
      const ok = isCoolLight(l);
      if (ok) S.iceTraces.push(idx);
      events.push({ type: 'iceReact', index: idx, ok, light: { ...l } });
      break;
    }
    case 'readIceClue':
      if (state.story.iceTraces.length < 3) {
        error = '흔적이 아직 끊겨 있어요.';
        break;
      }
      if (!state.story.clues.includes('ice')) {
        state.story.clues.push('ice');
        events.push({ type: 'clueFound', id: 'ice' });
      }
      break;
    case 'showClues': {
      const S = state.story;
      if (!S.clues.length) {
        error = '아직 보여 줄 흔적이 없어요.';
        break;
      }
      if (S.shown !== S.clues.length) {
        S.shown = S.clues.length;
        events.push({ type: 'cluesShown', count: S.shown });
      }
      break;
    }
    case 'weaveClues': {
      const S = state.story;
      if (state.scene !== 'overlook') {
        error = '항해 전망대의 항해 나무에서 엮을 수 있어요.';
        break;
      }
      if (S.clues.length < 2) {
        error = '두 곳의 흔적이 모여야 이어 볼 수 있어요.';
        break;
      }
      if (!S.cluesWoven) {
        S.cluesWoven = true;
        S.shown = S.clues.length;
        events.push({ type: 'cluesWoven' });
      }
      break;
    }
    case 'meetJelly':
      if (state.scene !== 'twilight' || state.quests.guide !== 'active') {
        error = '두 흔적이 가리킨 곳에서 만날 수 있어요.';
        break;
      }
      if (!state.story.jellyMet) {
        state.story.jellyMet = true;
        events.push({ type: 'jellyMet' });
      }
      break;
    case 'guideLight': {
      const S = state.story;
      if (state.scene !== 'twilight' || !S.jellyMet || state.quests.guide !== 'active') {
        error = '작은 해파리를 먼저 찾아요.';
        break;
      }
      if (action.index !== S.guideStep) {
        error = action.index < S.guideStep ? '이미 빛길이 이어진 곳이에요.' : '작은 해파리 가까운 곳부터 빛을 놓아요.';
        break;
      }
      const l = lightInHand(state, action.lightId ?? null);
      if (!l) {
        error = '비출 빛이 없어요. 가까이에서 빛을 빚어 볼까요?';
        break;
      }
      const ok = l.brightness <= GUIDE_SOFT;
      if (ok) S.guideStep += 1;
      events.push({ type: 'jellyReact', index: action.index, ok, step: S.guideStep, afterglow: l.motion === 'afterglow', light: { ...l } });
      break;
    }
    case 'sendReply': {
      if (state.scene !== 'overlook' || state.quests.reply !== 'active') {
        error = '보라와 답장을 준비한 뒤 항해 나무에서 보내요.';
        break;
      }
      if (!replyReady(state)) {
        error = '세 곳의 빛이 아직 준비되지 않았어요.';
        break;
      }
      if (!state.story.replySent) {
        state.story.replySent = true;
        events.push({ type: 'replySent' });
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
      } else state.puzzle.attempts += 1;
      break;
    }
    default:
      error = `unknown action ${action.type}`;
  }
  if (error) return { state: prev, events: [], error };
  const qev = evaluateQuests(state);
  events.push(...qev);
  // 주민 없는 퀘스트는 완료되는 즉시 보상
  for (const e of qev) {
    if (e.type === 'questCompleted' && QUESTS[e.id].auto && !state.ledger.includes(`reward:${e.id}`)) {
      state.ledger.push(`reward:${e.id}`);
      grant(state, QUESTS[e.id].rewards, `rewardItem:${e.id}`, events);
      state.quests[e.id] = 'claimed';
      if (e.id === 'q04') {
        W.chapterDone = true;
        events.push({ type: 'chapterDone' });
      }
      events.push({ type: 'questClaimed', id: e.id });
      events.push(...evaluateQuests(state));
    }
  }
  return { state, events, error: null };
}
