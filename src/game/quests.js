// 퀘스트 정의와 조건 판정. 완료는 버튼이 아니라 실제 게임 상태로만 결정된다.
import { COOL_LIMIT, SOFT_BRIGHTNESS, WARM_LIMIT, colorTemp } from './catalog.js';

export const STATUS = ['locked', 'available', 'active', 'completed', 'claimed'];
const rank = (s) => STATUS.indexOf(s);
export const atLeast = (state, id, status) => rank(state.quests[id]) >= rank(status);

/** 해파리 밖 목적지(항해로만 갈 수 있는 곳) */
export const DESTINATIONS = ['ice', 'solar', 'twilight'];
export const isDestination = (scene) => DESTINATIONS.includes(scene);

export function lightAt(state, slotId) {
  const lightId = state.slots[slotId];
  return lightId ? (state.lights.find((l) => l.id === lightId) ?? null) : null;
}

const isPulse = (l) => l && (l.motion === 'pulse' || l.motion === 'slowpulse');

export const QUESTS = {
  shelter: {
    title: '조용한 쉼터',
    giver: 'pogeun',
    chain: true,
    unlock: () => true,
    lines: ['조금 눈이 부셔서 쉬기가 어려워요.', '빛 제작실 작업대에서 은은하게 맥동하는 빛을 빚어, 제 옆 쉼터에 놓아줄래요?'],
    doneLines: ['이제 눈을 감고 쉴 수 있겠어요.', '고마운 마음을 받아줄래요?'],
    tasks: [
      { id: 'placed', label: '쉼터에 빛 놓기', check: (s) => !!lightAt(s, 'shelter') },
      { id: 'pulse', label: '움직임을 맥동으로 바꾸기', check: (s) => isPulse(lightAt(s, 'shelter')) },
      {
        id: 'soft',
        label: `밝기를 은은하게(${SOFT_BRIGHTNESS} 이하)`,
        check: (s) => (lightAt(s, 'shelter')?.brightness ?? 101) <= SOFT_BRIGHTNESS,
      },
    ],
    onAccept: [{ kind: 'material', id: 'seed', amount: 1 }],
    rewards: [{ kind: 'material', id: 'seed', amount: 2 }],
  },
  apricot: {
    title: '살구빛 산책로',
    giver: 'salgu',
    chain: true,
    unlock: (s) => atLeast(s, 'shelter', 'claimed'),
    lines: ['산책로 끝 전망대에 다시 가 보고 싶어요.', '촉수 산책로 가운데 빈 봉오리를 따뜻한 빛으로 밝혀줄래요?'],
    doneLines: ['발밑이 따뜻해졌어요!', '제가 아끼던 배색을 알려줄게요.'],
    tasks: [
      { id: 'placed', label: '산책로 가운데에 빛 놓기', check: (s) => !!lightAt(s, 'path2') },
      { id: 'warm', label: '따뜻한 색으로 고르기', check: (s) => colorTemp(lightAt(s, 'path2')?.color) >= WARM_LIMIT },
    ],
    rewards: [
      { kind: 'material', id: 'seed', amount: 1 },
      { kind: 'unlock', id: 'sunset' },
    ],
  },
  voyage: {
    title: '첫 항로',
    giver: 'bora',
    unlock: (s) => atLeast(s, 'apricot', 'claimed'),
    lines: ['해파리가 조금 기운을 차렸어요.', '빛 오르간에 차가운 빛을 보내면 얼음 성운으로 헤엄쳐 갈 수 있어요.'],
    doneLines: ['얼음 성운의 공기, 상쾌했죠?', '항해의 기념으로 이걸 드릴게요.'],
    tasks: [
      {
        id: 'cool',
        label: '빛 오르간에 차가운 빛 보내기',
        check: (s) => {
          const l = lightAt(s, 'helm');
          return !!l && colorTemp(l.color) <= COOL_LIMIT;
        },
      },
      { id: 'arrive', label: '얼음 성운에 도착하기', check: (s) => s.voyage.visited.ice },
    ],
    rewards: [{ kind: 'material', id: 'seed', amount: 1 }],
  },
  song: {
    title: '결정의 노래',
    giver: 'ribbon',
    unlock: (s) => s.voyage.visited.ice,
    lines: ['결정들이 순서대로 노래하고 있어요.', '잘 듣고 같은 순서로 빛을 건드려 볼래요?'],
    doneLines: ['결정들이 기뻐하며 천천히 맥동해요.', '이 움직임을 기억으로 가져가요.'],
    tasks: [{ id: 'solved', label: '결정의 노래 따라 하기', check: (s) => s.puzzle.solved }],
    rewards: [
      { kind: 'unlock', id: 'slowpulse' },
      { kind: 'material', id: 'shard', amount: 1 },
    ],
  },
  finale: {
    title: '산책로의 마지막 빛',
    giver: 'pogeun',
    chain: true,
    unlock: (s) => atLeast(s, 'song', 'claimed') && !isDestination(s.scene),
    lines: ['얼음 성운에서 새로운 움직임을 배웠군요.', '산책로 끝 봉오리에 천천히 맥동하는 빛을 놓으면 길이 깨어날 거예요.'],
    doneLines: ['산책로가 완전히 깨어났어요!', '다 같이 전망대로 가요.'],
    tasks: [
      { id: 'placed', label: '산책로 끝에 빛 놓기', check: (s) => !!lightAt(s, 'path3') },
      { id: 'slow', label: '천천히 맥동하는 움직임 쓰기', check: (s) => lightAt(s, 'path3')?.motion === 'slowpulse' },
    ],
    rewards: [{ kind: 'material', id: 'shard', amount: 1 }],
  },
};

export const QUEST_ORDER = ['shelter', 'apricot', 'voyage', 'song', 'finale'];

/** 설치 지점은 연결된 퀘스트가 진행 중일 때 열리고, 보상을 받은 뒤에는 빛이 고정된다. */
export const SLOT_QUEST = { shelter: 'shelter', path2: 'apricot', helm: 'voyage', path3: 'finale' };

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
      state.quests[id] = 'available';
      events.push({ type: 'questAvailable', id });
    } else if (cur === 'active' || cur === 'completed') {
      const allDone = q.tasks.every((t) => t.check(state));
      if (cur === 'active' && allDone) {
        state.quests[id] = 'completed';
        events.push({ type: 'questCompleted', id });
      } else if (cur === 'completed' && !allDone) {
        state.quests[id] = 'active';
        events.push({ type: 'questReopened', id });
      }
    }
  }
  return events;
}

/** 산책로 진행도: 보상까지 끝낸 산책로 퀘스트 수 */
export function pathProgress(state) {
  const ids = ['shelter', 'apricot', 'finale'];
  return { done: ids.filter((id) => state.quests[id] === 'claimed').length, total: ids.length };
}

export const GIVER_NAMES = { pogeun: '포근', salgu: '살구', bora: '보라', ribbon: '리본' };
export const GIVER_PLACES = { pogeun: '캡슐 마을', salgu: '촉수 산책로', bora: '항해 전망대', ribbon: '얼음 성운' };

/** 지금 HUD에 보여줄 하나의 목표 */
export function currentObjective(state) {
  for (const id of QUEST_ORDER) {
    const st = state.quests[id];
    const q = QUESTS[id];
    if (st === 'active') {
      const next = taskResults(state, id).find((t) => !t.done);
      return { id, title: q.title, text: next ? next.label : '조건을 모두 채웠어요', status: st };
    }
    if (st === 'completed') {
      if (id === 'voyage' && isDestination(state.scene)) {
        return { id, title: q.title, text: '선착장에서 해파리로 돌아가 보라에게 알리기', status: st };
      }
      return { id, title: q.title, text: `${GIVER_NAMES[q.giver]}에게 선물 받기 · ${GIVER_PLACES[q.giver]}`, status: st };
    }
  }
  for (const id of QUEST_ORDER) {
    if (state.quests[id] === 'available') {
      const q = QUESTS[id];
      if (id === 'finale' && isDestination(state.scene)) continue;
      return { id, title: q.title, text: `${GIVER_NAMES[q.giver]}의 부탁 듣기 · ${GIVER_PLACES[q.giver]}`, status: 'available' };
    }
  }
  if (state.quests.finale === 'claimed') return { id: null, title: '잠든 산책로 깨우기', text: '산책로가 깨어났어요', status: 'claimed' };
  if (atLeast(state, 'song', 'claimed') && isDestination(state.scene)) {
    return { id: null, title: '잠든 산책로 깨우기', text: '선착장에서 해파리로 돌아가기', status: 'none' };
  }
  return { id: null, title: '잠든 산책로 깨우기', text: '주민들과 이야기해 보기', status: 'none' };
}
