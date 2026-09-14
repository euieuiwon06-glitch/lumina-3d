// 첫 챕터 "첫 번째 숨결" 퀘스트 정의와 조건 판정.
// 완료는 버튼이 아니라 실제 게임 상태로만 결정된다. (추가)LUMINA_초반플레이_통합기획 6·7장
import { SOFT_BRIGHTNESS } from './catalog.js';

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
};

export const QUEST_ORDER = ['q01', 'q02', 'q03', 'q04', 'shelter', 'song'];
export const MAIN_ORDER = ['q01', 'q02', 'q03', 'q04'];

/** 설치 지점과 연결된 퀘스트 */
export const SLOT_QUEST = { lantern: 'q02', shelter: 'shelter' };

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

export const GIVER_NAMES = { pogeun: '포근', salgu: '살구', bora: '보라', ribbon: '리본', ribbonIce: '리본' };
export const GIVER_PLACES = { pogeun: '캡슐 마을', salgu: '촉수 다리 앞', bora: '항해 전망대', ribbon: '다리 건너 교환 정원', ribbonIce: '얼음 성운' };

/** 챕터 진행도(메인 퀘스트 보상까지 끝낸 수) */
export function chapterProgress(state) {
  return { done: MAIN_ORDER.filter((id) => state.quests[id] === 'claimed').length, total: MAIN_ORDER.length };
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
    if (isDestination(state.scene)) return { id: null, title: '새로운 곳 둘러보기', text: '반짝이는 빛을 찾거나 선착장에서 돌아가기', status: 'claimed' };
    return { id: null, title: '첫 번째 숨결 완료', text: '다음 항로와 주민 부탁을 둘러보기', status: 'claimed' };
  }
  return { id: null, title: '해파리의 첫 항해 되살리기', text: '주변을 둘러보기', status: 'none' };
}
