import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPuzzle, finishListening, listen, press } from '../src/game/puzzle.js';
import { currentObjective, lightAt } from '../src/game/quests.js';
import { SAVE_KEY, canDepart, createInitialState, loadState, reduce, sanitize, saveState, slotAvailability } from '../src/game/state.js';

function run(state, ...actions) {
  let s = state;
  for (const a of actions) {
    const r = reduce(s, a);
    assert.equal(r.error, null, `${a.type}: ${r.error}`);
    s = r.state;
  }
  return s;
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('새 게임은 빛 제작실에서 시작하고 첫 부탁만 받을 수 있다', () => {
  const s = createInitialState();
  assert.equal(s.scene, 'workshop');
  assert.equal(s.quests.shelter, 'available');
  assert.equal(s.quests.apricot, 'locked');
  assert.equal(currentObjective(s).text, '포근의 부탁 듣기 · 캡슐 마을');
});

test('쉼터 부탁: 조건이 틀린 설치는 완료되지 않고, 거두고 다시 놓으면 완료된다', () => {
  let s = run(createInitialState(), { type: 'acceptQuest', id: 'shelter' });
  assert.equal(s.materials.seed, 1);
  // 부유·밝기 80 → 조건 불충족
  s = run(s, { type: 'placeLight', slot: 'shelter' });
  assert.equal(s.quests.shelter, 'active');
  assert.equal(s.materials.seed, 0);
  // 버튼으로 완료 처리할 수 없다
  assert.match(reduce(s, { type: 'claimReward', id: 'shelter' }).error, /끝내지/);
  s = run(s, { type: 'retrieveLight', slot: 'shelter' }, { type: 'setDraft', key: 'motion', value: 'pulse' }, { type: 'setDraft', key: 'brightness', value: 55 });
  assert.equal(s.materials.seed, 1);
  s = run(s, { type: 'placeLight', slot: 'shelter' });
  assert.equal(s.quests.shelter, 'completed');
  s = run(s, { type: 'claimReward', id: 'shelter' });
  assert.equal(s.quests.shelter, 'claimed');
  assert.equal(s.materials.seed, 2);
  assert.equal(s.quests.apricot, 'available');
});

test('보상은 한 번만: 같은 행동을 반복하거나 저장 후 불러와도 다시 받지 못한다', () => {
  let s = run(
    createInitialState(),
    { type: 'acceptQuest', id: 'shelter' },
    { type: 'setDraft', key: 'motion', value: 'pulse' },
    { type: 'setDraft', key: 'brightness', value: 40 },
    { type: 'placeLight', slot: 'shelter' },
    { type: 'claimReward', id: 'shelter' },
  );
  const seeds = s.materials.seed;
  assert.ok(reduce(s, { type: 'claimReward', id: 'shelter' }).error);
  const storage = memoryStorage();
  saveState(storage, s);
  const loaded = loadState(storage).state;
  assert.ok(reduce(loaded, { type: 'claimReward', id: 'shelter' }).error);
  assert.equal(loaded.materials.seed, seeds);
  // 받은 빛은 거둘 수 없다
  assert.equal(slotAvailability(loaded, 'shelter').canRetrieve, false);
});

test('저장 데이터 검증: 원장 없이 claimed로 조작하면 새 상태로 되돌린다', () => {
  const s = createInitialState();
  const bad = { ...s, quests: { ...s.quests, shelter: 'claimed' } };
  const r = sanitize(JSON.parse(JSON.stringify(bad)));
  assert.equal(r.recovered, true);
  assert.equal(r.state.quests.shelter, 'available');
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, '{broken');
  assert.match(loadState(storage).notice, /손상/);
});

test('장면 이동은 연결된 출구로만, 위치 저장은 장면별로', () => {
  let s = run(createInitialState(), { type: 'travel', via: 'ENTRY_정원_교환광장' });
  assert.equal(s.scene, 'neighborhood');
  assert.equal(s.arrival, 'ENTRY_정원_교환광장');
  assert.ok(reduce(s, { type: 'travel', via: 'ENTRY_씨앗온실' }).error);
  s = run(s, { type: 'setPosition', scene: 'neighborhood', x: 1.234, y: 0, z: -3, yaw: 1.5 });
  assert.deepEqual(s.positions.neighborhood, { x: 1.23, y: 0, z: -3, yaw: 1.5 });
  assert.equal(s.arrival, null);
  const storage = memoryStorage();
  saveState(storage, s);
  assert.deepEqual(loadState(storage).state.positions.neighborhood, s.positions.neighborhood);
});

function toVoyage() {
  return run(
    createInitialState(),
    { type: 'acceptQuest', id: 'shelter' },
    { type: 'setDraft', key: 'motion', value: 'pulse' },
    { type: 'setDraft', key: 'brightness', value: 40 },
    { type: 'placeLight', slot: 'shelter' },
    { type: 'claimReward', id: 'shelter' },
    { type: 'acceptQuest', id: 'apricot' },
    { type: 'setDraft', key: 'color', value: 'apricot' },
    { type: 'placeLight', slot: 'path2' },
    { type: 'claimReward', id: 'apricot' },
    { type: 'acceptQuest', id: 'voyage' },
  );
}

test('항해: 전망대에서만, 빛의 온도로 목적지가 정해진다', () => {
  let s = toVoyage();
  assert.equal(canDepart(s).ok, false); // 제작실에서는 출항 불가
  s = { ...s, scene: 'overlook' };
  assert.match(canDepart(s).reason, /빛을 보내야/);
  // 따뜻한 빛 → 태양 정원(탐험 가능), 첫 항로 조건은 채우지 못함
  s = run(s, { type: 'placeLight', slot: 'helm' });
  assert.equal(canDepart(s).to, 'solar');
  let warm = run(s, { type: 'depart' });
  assert.equal(warm.scene, 'solar');
  assert.equal(warm.voyage.visited.solar, true);
  assert.equal(warm.quests.voyage, 'active');
  // 돌아와서 차가운 빛으로 바꾼다
  warm = run(warm, { type: 'depart' });
  assert.equal(warm.scene, 'overlook');
  s = run(warm, { type: 'retrieveLight', slot: 'helm' }, { type: 'setDraft', key: 'color', value: 'sky' }, { type: 'placeLight', slot: 'helm' });
  assert.equal(canDepart(s).to, 'ice');
  s = run(s, { type: 'depart' });
  assert.equal(s.scene, 'ice');
  assert.equal(s.arrival, 'ENTRY_해파리선착장');
  assert.equal(s.quests.voyage, 'completed');
  assert.equal(s.quests.song, 'available');
  // 중간 색 → 황혼 합류지
  const mid = { ...toVoyage(), scene: 'overlook' };
  const midS = run(mid, { type: 'setDraft', key: 'color', value: 'cream' }, { type: 'placeLight', slot: 'helm' });
  assert.equal(canDepart(midS).to, 'twilight');
});

test('발견물은 해당 장면에서 한 번만 얻는다', () => {
  let s = { ...createInitialState(), scene: 'walkway' };
  assert.ok(reduce(s, { type: 'discover', id: 'nurseryPool' }).error);
  s = run(s, { type: 'discover', id: 'walkwaySeed' });
  assert.equal(s.materials.seed, 1);
  assert.match(reduce(s, { type: 'discover', id: 'walkwaySeed' }).error, /이미/);
});

test('결정의 노래: 실패 위치 표시, 다시 듣기 후 성공', () => {
  let p = finishListening(listen(createPuzzle([0, 2, 1, 2])));
  p = press(p, 0);
  p = press(p, 1);
  assert.equal(p.status, 'failure');
  assert.equal(p.wrongAt, 1);
  p = finishListening(listen(p));
  for (const c of [0, 2, 1, 2]) p = press(p, c);
  assert.equal(p.status, 'success');
});

test('마지막 빛은 목적지에서는 열리지 않고 해파리로 돌아오면 열린다', () => {
  let s = toVoyage();
  s = run({ ...s, scene: 'overlook' }, { type: 'setDraft', key: 'color', value: 'sky' }, { type: 'placeLight', slot: 'helm' }, { type: 'depart' });
  s = run(s, { type: 'acceptQuest', id: 'song' }, { type: 'puzzleResult', success: false }, { type: 'puzzleResult', success: true }, { type: 'claimReward', id: 'song' });
  assert.equal(s.puzzle.attempts, 1);
  assert.equal(s.quests.finale, 'locked');
  s = run(s, { type: 'depart' });
  assert.equal(s.quests.finale, 'available');
  s = run(s, { type: 'claimReward', id: 'voyage' }, { type: 'acceptQuest', id: 'finale' }, { type: 'setDraft', key: 'motion', value: 'slowpulse' }, { type: 'placeLight', slot: 'path3' });
  assert.equal(lightAt(s, 'path3').motion, 'slowpulse');
  assert.equal(s.quests.finale, 'completed');
});
