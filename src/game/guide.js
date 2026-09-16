// 길 안내: 지금 메인 목표가 "어느 장면의 무엇"인지 정하고,
// 다른 장면에 있으면 거기로 이어지는 출구를 알려준다. DOM·three 의존 없음(테스트 대상).
import { QUESTS, isDestination } from './quests.js';
import { LINKS } from './state.js';
import { NPCS, SCENE_INFO } from './scenes.js';

const npcGoal = (state, id) => {
  const where = NPCS[id]?.where(state);
  return where ? { scene: where.scene, kind: 'npc', id, label: NPCS[id].name } : null;
};

/** 현재 목표 지점 { scene, kind, id, label } 또는 null */
export function objectiveGoal(state) {
  const S = state;
  const W = S.world;
  const Q = S.quests;
  if (Q.q01 === 'active') return { scene: 'workshop', kind: 'workbench', id: 'workbench', label: '둥근 작업대' };
  if (Q.q02 === 'available') return npcGoal(S, 'salgu');
  if (Q.q02 === 'active') {
    if (!S.slots.lantern) return { scene: 'walkway', kind: 'slot', id: 'lantern', label: '첫 등불' };
    if (!W.tuned) return { scene: 'walkway', kind: 'tune', id: 'tune', label: '어긋난 등불' };
    return null;
  }
  if (Q.q02 === 'completed') return npcGoal(S, 'salgu');
  if (Q.q03 === 'available') return npcGoal(S, 'ribbon');
  if (Q.q03 === 'active') {
    if (!W.budAwake) return { scene: 'walkway', kind: 'bud', id: 'bud', label: '닫힌 빛 봉오리' };
    return npcGoal(S, 'ribbon');
  }
  if (Q.q03 === 'completed') return npcGoal(S, 'ribbon');
  if (Q.q04 === 'available') return npcGoal(S, 'bora');
  if (Q.q04 === 'active' && !isDestination(S.scene)) return { scene: 'overlook', kind: 'organ', id: 'organ', label: '항해 나무' };
  if (W.chapterDone && S.story.traceSeen) {
    const g = storyGoal(S);
    if (g !== undefined) return g;
  }
  // 챕터 뒤: 도착지에서는 아직 못 찾은 빛, 그다음 선착장
  if (W.chapterDone && isDestination(S.scene)) {
    const d = (SCENE_INFO[S.scene].discoveries ?? []).find((x) => !S.discovered.includes(x.id));
    return d ? { scene: S.scene, kind: 'discovery', id: d.id, label: d.label } : null;
  }
  // 선택형 부탁을 받은 상태면 그쪽으로
  if (Q.shelter === 'active') return { scene: 'neighborhood', kind: 'slot', id: 'shelter', label: '포근의 쉼터' };
  if (Q.shelter === 'completed') return npcGoal(S, 'pogeun');
  // 첫 항해를 마치고 해파리 안으로 돌아왔는데 아직 낯선 빛을 못 봤다면 전망대로 이끈다
  if (W.chapterDone && !S.story.traceSeen && !isDestination(S.scene)) return { ...ORGAN, label: '항해 나무 · 다음 항로 고르기' };
  return null;
}

const ORGAN = { scene: 'overlook', kind: 'organ', id: 'organ', label: '항해 나무' };

/** 두 번째 이야기의 목표 지점. undefined면 기존 규칙으로 */
function storyGoal(S) {
  const Q = S.quests;
  const T = S.story;
  const clue = (id) => T.clues.includes(id);
  if (Q.trace !== 'claimed') {
    // 지금 있는 지역의 흔적부터
    if (S.scene === 'solar' && !clue('solar')) {
      if (Q.flower === 'available') return npcGoal(S, 'salguSolar');
      if (Q.flower === 'active') return { scene: 'solar', kind: 'flower', id: 'flower', label: T.flowerOpen ? '꽃 속 빛의 흔적' : '숨은 꽃' };
    }
    if (S.scene === 'ice' && !clue('ice')) {
      if (Q.icepath === 'available') return npcGoal(S, 'ribbonIce');
      if (Q.icepath === 'active') {
        if (!S.discovered.includes('iceAurora')) return { scene: 'ice', kind: 'discovery', id: 'iceAurora', label: '오로라 결정' };
        const n = Math.min(2, T.iceTraces.length);
        return { scene: 'ice', kind: 'iceTrace', id: `trace${n}`, label: T.iceTraces.length >= 3 ? '이어진 흔적' : '결정 속 흔적' };
      }
    }
    if (Q.flower === 'completed') return npcGoal(S, 'salguSolar');
    if (Q.icepath === 'completed') return npcGoal(S, 'ribbonIce');
    if (T.clues.length >= 1 && T.shown < 1) return npcGoal(S, 'bora');
    if (T.clues.length >= 2) return { ...ORGAN, label: '항해 나무 · 두 흔적 엮기' };
    // 다음 지역으로: 전망대의 항해 나무에서 항로를 고른다
    const want = clue('solar') ? 'ice' : clue('ice') ? 'solar' : null;
    if (want) return { scene: want, kind: 'npc', id: want === 'solar' ? 'salguSolar' : 'ribbonIce', label: want === 'solar' ? '태양 정원' : '얼음 성운' };
    return isDestination(S.scene) ? { ...ORGAN, label: '항해 나무 · 다른 지역 찾기' } : { ...ORGAN, label: '항해 나무 · 항로 고르기' };
  }
  if (Q.guide === 'active') {
    if (S.scene !== 'twilight') return { scene: 'twilight', kind: 'jelly', id: 'jelly', label: '황혼 합류지' };
    if (!T.jellyMet) return { scene: 'twilight', kind: 'jelly', id: 'jelly', label: '작은 해파리' };
    return { scene: 'twilight', kind: 'guidePt', id: `guide${Math.min(2, T.guideStep)}`, label: '빛길 지점' };
  }
  if (Q.reply === 'available' || Q.reply === 'completed') return npcGoal(S, 'bora');
  if (Q.reply === 'active') {
    const where = { replyRest: ['neighborhood', '쉼터 답장 자리'], replyPath: ['walkway', '산책길 답장 자리'], replySignal: ['overlook', '전망대 답장 자리'] };
    // 지금 있는 지역의 빈 자리부터 안내한다
    const open = Object.entries(where).filter(([slot]) => !QUESTS.reply.tasks.find((t) => t.id === slot).check(S));
    const pick = open.find(([, [scene]]) => scene === S.scene) ?? open[0];
    if (pick) return { scene: pick[1][0], kind: 'slot', id: pick[0], label: pick[1][1] };
    return { ...ORGAN, label: '항해 나무 · 답장 보내기' };
  }
  return undefined;
}

/** 장면 이동 그래프: 장면 → [{ via: 출구 표시, to: 장면 }] */
export function sceneGraph() {
  const g = {};
  for (const [key, [to]] of Object.entries(LINKS)) {
    const [from, via] = key.split(':');
    (g[from] ??= []).push({ via, to });
  }
  for (const [id, info] of Object.entries(SCENE_INFO)) {
    if (!info.destination) continue;
    const dock = info.exits.find((e) => e.kind === 'dock');
    if (dock) (g[id] ??= []).push({ via: dock.at, to: 'overlook' });
  }
  return g;
}

/** from 장면에서 goal 장면으로 가려면 먼저 나갈 출구(표시 이름). 같은 장면이면 null, 길이 없으면 undefined */
export function nextExit(from, goal, graph = sceneGraph()) {
  if (from === goal) return null;
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const e of graph[cur] ?? []) {
      if (prev.has(e.to)) continue;
      prev.set(e.to, { scene: cur, via: e.via });
      if (e.to === goal) {
        // 목표에서 거슬러 올라가 출발 장면에서 나간 첫 출구를 찾는다
        let p = prev.get(e.to);
        while (p && p.scene !== from) p = prev.get(p.scene);
        return p?.via;
      }
      queue.push(e.to);
    }
  }
  return undefined;
}

/** 목표를 현재 장면 기준 안내 대상으로 바꾼다 { kind, id, label, final } */
export function guideTarget(state) {
  const goal = objectiveGoal(state);
  if (!goal) return null;
  if (goal.scene === state.scene) return { ...goal, final: true };
  // 먼 지역은 걸어서 못 가므로 전망대의 항해 나무에서 항로를 고르게 안내한다
  let dest = goal.scene;
  if (isDestination(goal.scene)) {
    if (state.scene === 'overlook') return { scene: 'overlook', kind: 'organ', id: 'organ', label: '항해 나무에서 항로 고르기', final: false, towards: goal };
    dest = 'overlook';
  }
  const via = nextExit(state.scene, dest);
  if (!via) return null;
  const exitInfo = SCENE_INFO[state.scene].exits.find((e) => e.at === via);
  return { scene: state.scene, kind: 'exit', id: via, label: exitInfo?.label ?? '다음 장소로', final: false, towards: goal };
}

export { QUESTS };
