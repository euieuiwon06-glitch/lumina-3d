// 첫 챕터 "첫 번째 숨결" 퀘스트 정의와 조건 판정.
// 완료는 버튼이 아니라 실제 게임 상태로만 결정된다. (추가)LUMINA_초반플레이_통합기획 6·7장
import { REPLY_SPOTS, SOFT_BRIGHTNESS } from './catalog.js';

export const STATUS = ['locked', 'available', 'active', 'completed', 'claimed'];
const rank = (s) => STATUS.indexOf(s);
export const atLeast = (state, id, status) => rank(state.quests[id]) >= rank(status);

/** 해파리 밖 목적지(항해로만 갈 수 있는 곳) */
export const DESTINATIONS = ['ice', 'solar', 'twilight'];
export const isDestination = (scene) => DESTINATIONS.includes(scene);

export function lightById(state, id) {
  return state.lights.find((l) => l.id === id) ?? null;
}
export function lightAt(state, slotId) {
  const id = state.slots[slotId];
  return id ? lightById(state, id) : null;
}
/** 들고 다니는 빛(어느 자리에도 놓이지 않은 빛) */
export function carriedLights(state) {
  const placed = new Set(Object.values(state.slots).filter(Boolean));
  return state.lights.filter((l) => !placed.has(l.id));
}

const isPulse = (l) => l && (l.motion === 'pulse' || l.motion === 'slowpulse');
const w = (s) => s.world;
const st = (s) => s.story;
const hasClue = (s, id) => st(s).clues.includes(id);

export const QUESTS = {
  q01: {
    title: '내 안의 작은 빛',
    goal: '작업대에서 첫 빛 만들기',
    main: true,
    giver: null,
    auto: true, // 조건을 채우면 바로 보상(주민 없음)
    unlock: (s) => s.profile.created,
    tasks: [
      { id: 'bench', label: '작업대의 잠든 빛 깨우기', check: (s) => w(s).benchOpened },
      { id: 'craft', label: '색과 맥동을 골라 첫 빛 완성하기', check: (s) => w(s).firstCrafted },
    ],
    rewards: [{ kind: 'unlock', id: 'recipe' }],
  },
  q02: {
    title: '친구에게 가는 길',
    goal: '다리 건너 친구에게 가는 길 열기',
    main: true,
    giver: 'salgu',
    unlock: (s) => atLeast(s, 'q01', 'claimed'),
    lines: ['다리 건너에 친구가 있어.', '등불이 꺼진 뒤로 만나러 갈 수가 없어.'],
    doneLines: ['길이 펼쳐졌어! 리본을 만나러 가자.', '고마워. 이건 우리 둘이 모은 씨앗이야.'],
    tasks: [
      { id: 'place', label: '첫 등불에 내 빛 놓기', check: (s) => !!lightAt(s, 'lantern') },
      { id: 'tune', label: '남은 등불의 박자 맞추기', check: (s) => w(s).tuned },
      { id: 'bridge', label: '촉수 다리 깨우기', check: (s) => w(s).bridgeRestored },
    ],
    rewards: [
      { kind: 'material', id: 'seed', amount: 2 },
      { kind: 'unlock', id: 'forms' },
    ],
  },
  q03: {
    title: '너의 빛과 나의 빛',
    goal: '빛을 나누고 항해용 빛 엮기',
    main: true,
    giver: 'ribbon',
    unlock: (s) => atLeast(s, 'q02', 'claimed'),
    lines: ['항해 나무는 한 가지 빛으로는 깨어나지 않아.', '저기 닫힌 봉오리를 깨워 주면 내 민트빛을 나눠 줄게.'],
    doneLines: ['두 빛이 한 줄기로 엮였네.', '이 빛이라면 항해 나무가 대답할 거야.'],
    tasks: [
      { id: 'bud', label: '닫힌 빛 봉오리 깨우기', check: (s) => w(s).budAwake },
      { id: 'trade', label: '리본과 빛 나누기', check: (s) => w(s).traded },
      { id: 'weave', label: '내 빛과 받은 빛 엮기', check: (s) => w(s).woven },
    ],
    rewards: [{ kind: 'unlock', id: 'mint' }],
  },
  q04: {
    title: '첫 번째 숨결',
    goal: '해파리의 첫 항해 되살리기',
    main: true,
    giver: 'bora',
    unlock: (s) => atLeast(s, 'q03', 'claimed'),
    lines: ['항해 나무가 우리 빛을 기다리고 있어요.', '엮은 빛을 보내 주면 갈 수 있는 곳을 읽어 드릴게요.'],
    doneLines: ['해파리가 다시 숨을 쉬어요.', '다음 항로도 함께 정해요.'],
    tasks: [
      { id: 'feed', label: '항해 나무에 엮은 빛 보내기', check: (s) => w(s).organFed },
      { id: 'route', label: '첫 목적지 고르기', check: (s) => !!w(s).route },
      { id: 'arrive', label: '새로운 곳에 내리기', check: (s) => w(s).arrived },
    ],
    auto: true, // 도착해 조작을 되찾는 순간 완료
    rewards: [{ kind: 'material', id: 'seed', amount: 2 }],
  },
  shelter: {
    title: '조용한 쉼터',
    goal: '포근이 쉴 수 있는 빛 놓기',
    main: false,
    giver: 'pogeun',
    unlock: (s) => atLeast(s, 'q02', 'claimed'),
    lines: ['조금 눈이 부셔서 쉬기가 어려워요.', '은은하게 맥동하는 빛을 제 쉼터에 놓아줄래요? 밝기 조절을 알려 줄게요.'],
    doneLines: ['이제 눈을 감고 쉴 수 있겠어요.', '제가 짠 꽃잎 목도리예요. 받아 줄래요?'],
    tasks: [
      { id: 'placed', label: '쉼터에 빛 놓기', check: (s) => !!lightAt(s, 'shelter') },
      { id: 'pulse', label: '움직임을 맥동으로', check: (s) => isPulse(lightAt(s, 'shelter')) },
      { id: 'soft', label: `밝기 ${SOFT_BRIGHTNESS} 이하로 은은하게`, check: (s) => (lightAt(s, 'shelter')?.brightness ?? 101) <= SOFT_BRIGHTNESS },
    ],
    onAccept: [
      { kind: 'unlock', id: 'brightness' },
      { kind: 'material', id: 'seed', amount: 1 },
    ],
    rewards: [
      { kind: 'material', id: 'seed', amount: 2 },
      { kind: 'unlock', id: 'petalScarf' },
    ],
  },
  song: {
    title: '결정의 노래',
    goal: '결정이 부르는 순서 따라 하기',
    main: false,
    giver: 'ribbonIce',
    unlock: (s) => s.voyage.visited.ice && s.world.chapterDone,
    lines: ['결정들이 순서대로 노래하고 있어.', '잘 듣고 같은 순서로 빛을 건드려 볼래?'],
    doneLines: ['결정들이 기뻐하며 천천히 맥동해.', '이 움직임을 기억으로 가져가.'],
    tasks: [{ id: 'solved', label: '결정의 노래 따라 하기', check: (s) => s.puzzle.solved }],
    rewards: [
      { kind: 'unlock', id: 'slowpulse' },
      { kind: 'material', id: 'shard', amount: 1 },
    ],
  },
  // ---------------------------------------------------------------- 두 번째 이야기: 빛으로 발견하고, 돕고, 연결하기
  trace: {
    title: '누군가 남긴 빛',
    goal: '다른 해파리가 남긴 빛 따라가기',
    main: true,
    giver: null,
    auto: true,
    unlock: (s) => w(s).chapterDone && st(s).traceSeen,
    tasks: [
      { id: 'clue1', label: '태양 정원이나 얼음 성운에서 흔적 찾기', check: (s) => st(s).clues.length >= 1 },
      { id: 'show', label: '보라에게 발견한 빛 보여 주기', check: (s) => st(s).shown >= 1 },
      { id: 'clue2', label: '다른 곳에 남은 두 번째 흔적 찾기', check: (s) => st(s).clues.length >= 2 },
      { id: 'weave', label: '항해 나무에서 두 흔적 엮기', check: (s) => st(s).cluesWoven },
    ],
    rewards: [
      { kind: 'unlock', id: 'twilightRoute' },
      { kind: 'material', id: 'seed', amount: 1 },
    ],
  },
  flower: {
    title: '눈부셔서 숨은 꽃',
    goal: '꽃이 편안하게 열리게 하기',
    main: true,
    giver: 'salguSolar',
    unlock: (s) => w(s).chapterDone && st(s).traceSeen,
    lines: ['여긴 이렇게 밝은데, 저 숲 끝 꽃만 안 피네.', '빛이 모자란 건 아닌 것 같아. 가까이서 볼까?'],
    doneLines: ['꽃이 편안해 보여. 안에 있던 빛, 우리 해파리 빛이 아니었지?', '이건 꽃이 준 햇살 조각이야. 노을빛을 빚을 수 있을 거야.'],
    tasks: [
      { id: 'try', label: '꽃에 빛을 비춰 반응 살피기', check: (s) => st(s).flowerTries >= 1 },
      { id: 'open', label: '꽃이 편안하게 열리도록 빛을 낮추기', check: (s) => st(s).flowerOpen },
      { id: 'clue', label: '꽃 속 빛의 흔적 살피기', check: (s) => hasClue(s, 'solar') },
    ],
    onAccept: [
      { kind: 'unlock', id: 'brightness' },
      { kind: 'material', id: 'seed', amount: 1 },
    ],
    rewards: [
      { kind: 'unlock', id: 'sunset' },
      { kind: 'material', id: 'seed', amount: 1 },
    ],
  },
  icepath: {
    title: '얼음 속에 남은 길',
    goal: '지역의 빛으로 결정 속 흔적 찾기',
    main: true,
    giver: 'ribbonIce',
    unlock: (s) => w(s).chapterDone && st(s).traceSeen,
    lines: ['결정 안에 뭔가 있어.', '여기서 찾은 차가운 빛을 비추면 더 잘 보일 것 같은데.'],
    doneLines: ['흔적이 한 줄로 이어졌어. 작은 누군가가 이쪽으로 헤엄쳐 갔나 봐.', '빛이 지나간 자리를 남기는 법을 기억해 가.'],
    tasks: [
      { id: 'aurora', label: '오로라 결정에서 지역의 빛 얻기', check: (s) => s.discovered.includes('iceAurora') },
      { id: 'traces', label: '차가운 빛으로 결정 흔적 세 곳 비추기', check: (s) => st(s).iceTraces.length >= 3 },
      { id: 'clue', label: '이어진 흔적의 방향 읽기', check: (s) => hasClue(s, 'ice') },
    ],
    onAccept: [{ kind: 'material', id: 'seed', amount: 1 }],
    rewards: [
      { kind: 'unlock', id: 'afterglow' },
      { kind: 'material', id: 'shard', amount: 1 },
    ],
  },
  guide: {
    title: '이쪽으로 와도 괜찮아',
    goal: '작은 해파리를 선착장까지 안내하기',
    main: true,
    giver: null,
    auto: true,
    unlock: (s) => st(s).cluesWoven,
    tasks: [
      { id: 'find', label: '황혼 합류지에서 작은 해파리 찾기', check: (s) => st(s).jellyMet },
      { id: 'path', label: '은은한 빛으로 빛길 잇기', check: (s) => st(s).guideStep >= 2 },
      { id: 'home', label: '선착장까지 데려오기', check: (s) => st(s).guideStep >= 3 },
    ],
    rewards: [{ kind: 'material', id: 'seed', amount: 2 }],
  },
  reply: {
    title: '우리 마을의 답장',
    goal: '우리 마을의 빛으로 답장 보내기',
    main: true,
    giver: 'bora',
    unlock: (s) => atLeast(s, 'guide', 'claimed'),
    lines: ['작은 해파리가 품고 있던 빛은 친구들에게 보내려던 편지였어요.', '우리 마을의 빛을 더해 답장을 보내요. 세 곳에 빛을 놓아 주세요.'],
    doneLines: ['멀리서 작은 빛들이 대답했어요.', '이제 우리 해파리도, 작은 손님도 길을 잃지 않을 거예요.'],
    tasks: [
      ...REPLY_SPOTS.map((r) => ({ id: r.slot, label: `${r.label} 놓기 · ${r.need}`, check: (s) => r.check(lightAt(s, r.slot)) })),
      { id: 'send', label: '항해 나무에서 답장 보내기', check: (s) => st(s).replySent },
    ],
    onAccept: [{ kind: 'material', id: 'seed', amount: 2 }],
    rewards: [{ kind: 'material', id: 'seed', amount: 3 }],
  },
};

export const QUEST_ORDER = ['q01', 'q02', 'q03', 'q04', 'shelter', 'song', 'trace', 'flower', 'icepath', 'guide', 'reply'];
export const MAIN_ORDER = ['q01', 'q02', 'q03', 'q04'];
export const STORY_ORDER = ['trace', 'flower', 'icepath', 'guide', 'reply'];

/** 설치 지점과 연결된 퀘스트 */
export const SLOT_QUEST = { lantern: 'q02', shelter: 'shelter', replyRest: 'reply', replyPath: 'reply', replySignal: 'reply' };

export function taskResults(state, id) {
  return QUESTS[id].tasks.map((t) => ({ id: t.id, label: t.label, done: !!t.check(state) }));
}

/** 상태 변화 뒤 퀘스트 상태를 다시 계산한다. claimed는 되돌리지 않는다. */
export function evaluateQuests(state) {
  const events = [];
  for (const id of QUEST_ORDER) {
    const q = QUESTS[id];
    const cur = state.quests[id];
    if (cur === 'locked' && q.unlock(state)) {
      // 주민이 없는 퀘스트는 열리자마자 진행 중
      state.quests[id] = q.giver ? 'available' : 'active';
      events.push({ type: q.giver ? 'questAvailable' : 'questAccepted', id });
    }
    const now = state.quests[id];
    if (now === 'active' || now === 'completed') {
      const allDone = q.tasks.every((t) => t.check(state));
      if (now === 'active' && allDone) {
        state.quests[id] = 'completed';
        events.push({ type: 'questCompleted', id });
      } else if (now === 'completed' && !allDone) {
        state.quests[id] = 'active';
        events.push({ type: 'questReopened', id });
      }
    }
  }
  return events;
}

export const GIVER_NAMES = { pogeun: '포근', salgu: '살구', bora: '보라', ribbon: '리본', ribbonIce: '리본', salguSolar: '살구' };
export const GIVER_PLACES = { pogeun: '캡슐 마을', salgu: '촉수 다리 앞', bora: '항해 전망대', ribbon: '다리 건너 교환 정원', ribbonIce: '얼음 성운 선착장', salguSolar: '태양 정원 선착장' };
export const REGION_NAMES = { solar: '태양 정원', ice: '얼음 성운', twilight: '황혼 합류지', overlook: '항해 전망대' };

/** 챕터 진행도(메인 퀘스트 보상까지 끝낸 수). 첫 챕터를 마치면 두 번째 이야기 기준 */
export function chapterProgress(state) {
  if (state.world.chapterDone && state.story.traceSeen) {
    return { done: STORY_ORDER.filter((id) => state.quests[id] === 'claimed').length, total: STORY_ORDER.length, story: true };
  }
  return { done: MAIN_ORDER.filter((id) => state.quests[id] === 'claimed').length, total: MAIN_ORDER.length, story: false };
}

/** 항해 기록: 발견한 지역·단서·아직 확인하지 못한 방향 */
export function voyageLog(state) {
  const S = state.story;
  const visited = ['solar', 'ice', 'twilight'].filter((k) => state.voyage.visited[k]).map((k) => REGION_NAMES[k]);
  const clues = S.clues.map((c) => (c === 'solar' ? '태양 정원: 꽃 속에서 쉬어 간 작은 빛' : '얼음 성운: 결정을 따라 이어진 헤엄 자국'));
  let next = null;
  if (!S.traceSeen) next = null;
  else if (S.clues.length < 2) next = S.clues.includes('solar') ? '얼음 성운에 남은 흔적' : S.clues.includes('ice') ? '태양 정원에 남은 흔적' : '태양 정원·얼음 성운 중 한 곳';
  else if (!S.cluesWoven) next = '두 흔적을 엮으면 드러날 방향';
  else if (S.guideStep < 3) next = '황혼 합류지의 작은 해파리';
  else if (!S.replySent) next = '다른 해파리들에게 보낼 답장';
  return { visited, clues, next };
}

/** 두 번째 이야기의 현재 목표(행동 + 이유) */
function storyObjective(state) {
  const Q = state.quests;
  const S = state.story;
  const sc = state.scene;
  const talk = (id) => `${GIVER_NAMES[QUESTS[id].giver]}와 이야기하기 · ${GIVER_PLACES[QUESTS[id].giver]}`;
  const taskOf = (id) => taskResults(state, id).find((t) => !t.done)?.label ?? '조건을 모두 채웠어요';
  if (!S.traceSeen) return null;
  if (Q.trace !== 'claimed') {
    // 지금 있는 곳의 흔적 퀘스트가 먼저
    const local = sc === 'solar' ? 'flower' : sc === 'ice' ? 'icepath' : null;
    if (local && !S.clues.includes(sc)) {
      if (Q[local] === 'available') return { id: local, title: QUESTS[local].goal, text: talk(local), status: 'available' };
      if (Q[local] === 'active') return { id: local, title: QUESTS[local].goal, text: taskOf(local), status: 'active' };
    }
    for (const id of ['flower', 'icepath']) {
      if (Q[id] === 'completed') return { id, title: QUESTS[id].goal, text: `${GIVER_NAMES[QUESTS[id].giver]}에게 발견한 흔적 알리기 · ${GIVER_PLACES[QUESTS[id].giver]}`, status: 'completed' };
    }
    if (S.clues.length === 0) return { id: 'trace', title: QUESTS.trace.goal, text: '태양 정원이나 얼음 성운으로 항해해 흔적 찾기', status: 'active' };
    if (S.shown < 1) return { id: 'trace', title: QUESTS.trace.goal, text: '보라에게 발견한 빛 보여 주기 · 항해 전망대', status: 'active' };
    if (S.clues.length < 2) {
      const other = S.clues.includes('solar') ? '얼음 성운' : '태양 정원';
      return { id: 'trace', title: QUESTS.trace.goal, text: `${other}에 남은 두 번째 흔적 찾기 · 항해 나무에서 항로 고르기`, status: 'active' };
    }
    return { id: 'trace', title: QUESTS.trace.goal, text: '항해 나무에서 두 흔적을 엮어 방향 찾기', status: 'active' };
  }
  if (Q.guide === 'active') {
    if (sc !== 'twilight') return { id: 'guide', title: QUESTS.guide.goal, text: '항해 나무에서 황혼 합류지로 항해하기', status: 'active' };
    if (!S.jellyMet) return { id: 'guide', title: QUESTS.guide.goal, text: '희미한 빛 사이의 작은 해파리 찾기', status: 'active' };
    return { id: 'guide', title: QUESTS.guide.goal, text: `작은 해파리가 따라올 은은한 빛길 잇기 (${S.guideStep} / 3)`, status: 'active' };
  }
  if (Q.reply === 'available') return { id: 'reply', title: QUESTS.reply.goal, text: talk('reply'), status: 'available' };
  if (Q.reply === 'active') return { id: 'reply', title: QUESTS.reply.goal, text: taskOf('reply'), status: 'active' };
  if (Q.reply === 'completed') return { id: 'reply', title: QUESTS.reply.goal, text: '보라에게 답장이 닿았는지 확인하기 · 항해 전망대', status: 'completed' };
  if (Q.reply === 'claimed') return { id: null, title: '자유 탐험', text: '빛을 빚고 꾸미며 둘러봐요 · 다음 이야기는 준비 중이에요', status: 'free' };
  return null;
}

/** HUD에 보여줄 현재 목표 하나: "행동과 목적"을 함께 */
export function currentObjective(state) {
  for (const id of MAIN_ORDER) {
    const st = state.quests[id];
    const q = QUESTS[id];
    if (st === 'claimed') continue;
    if (st === 'active') {
      const next = taskResults(state, id).find((t) => !t.done);
      return { id, title: q.goal, text: next ? next.label : '조건을 모두 채웠어요', status: st };
    }
    if (st === 'completed') {
      if (id === 'q04') return { id, title: q.goal, text: '새로운 곳에 내리기', status: st };
      return { id, title: q.goal, text: `${GIVER_NAMES[q.giver]}에게 알리기 · ${GIVER_PLACES[q.giver]}`, status: st };
    }
    if (st === 'available') return { id, title: q.goal, text: `${GIVER_NAMES[q.giver]}와 이야기하기 · ${GIVER_PLACES[q.giver]}`, status: st };
    break;
  }
  if (state.world.chapterDone) {
    const so = storyObjective(state);
    if (so) return so;
    if (isDestination(state.scene)) return { id: null, title: '새로운 곳 둘러보기', text: '반짝이는 빛을 찾거나 선착장에서 돌아가기', status: 'claimed' };
    return { id: null, title: '첫 번째 숨결 완료', text: '다음 항로와 주민 부탁을 둘러보기', status: 'claimed' };
  }
  return { id: null, title: '해파리의 첫 항해 되살리기', text: '주변을 둘러보기', status: 'none' };
}
