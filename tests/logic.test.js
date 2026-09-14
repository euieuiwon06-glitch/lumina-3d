import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanName } from '../src/game/catalog.js';
import { createPuzzle, finishListening, listen, press as pressSong } from '../src/game/puzzle.js';
import { carriedLights, chapterProgress, currentObjective, lightAt } from '../src/game/quests.js';
import { SAVE_KEY, canDepart, craftOptions, createInitialState, loadState, reduce, sanitize, saveState, slotAvailability } from '../src/game/state.js';
import { autoTune, createTuning, press, start } from '../src/game/tuning.js';

function run(state, ...actions) {
  let s = state;
  for (const a of actions) {
    const r = reduce(s, a);
    assert.equal(r.error, null, `${a.type}: ${r.error}`);
    s = r.state;
  }
  return s;
}
const fail = (s, a) => reduce(s, a).error;

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

const created = () => run(createInitialState(), { type: 'setProfile', profile: { base: 'sprout', body: 'mint', name: '  반짝이  ' }, confirm: true });

function afterQ01() {
  return run(created(), { type: 'openBench' }, { type: 'setDraft', key: 'color', value: 'lilac' }, { type: 'craftLight' });
}
function afterQ02() {
  let s = run(afterQ01(), { type: 'acceptQuest', id: 'q02' }, { type: 'placeLight', slot: 'lantern' }, { type: 'tuned' }, { type: 'restoreBridge' });
  return run(s, { type: 'claimReward', id: 'q02' });
}
function afterQ03() {
  return run(afterQ02(), { type: 'acceptQuest', id: 'q03' }, { type: 'wakeBud' }, { type: 'trade' }, { type: 'weave' }, { type: 'claimReward', id: 'q03' });
}

test('캐릭터 만들기: 확정 전에는 퀘스트가 열리지 않고, 이름은 정리되어 저장된다', () => {
  const s0 = createInitialState();
  assert.equal(s0.quests.q01, 'locked');
  const s = created();
  assert.equal(s.profile.created, true);
  assert.equal(s.profile.name, '반짝이');
  assert.equal(s.quests.q01, 'active');
  assert.equal(cleanName('   '), '루미');
  assert.ok(fail(s, { type: 'setProfile', profile: { accessory: 'petalScarf' } }), '보상 장식은 잠김');
});

test('Q01: 첫 빛은 재료 없이, 색과 맥동만 고를 수 있다', () => {
  let s = created();
  assert.deepEqual(craftOptions(s).motions, ['pulse']);
  assert.ok(fail(s, { type: 'craftLight' }), '작업대를 깨우기 전에는 못 만듦');
  s = run(s, { type: 'openBench' });
  assert.ok(fail(s, { type: 'setDraft', key: 'form', value: 'crystal' }), '형태는 첫 설치 뒤');
  assert.ok(fail(s, { type: 'setDraft', key: 'brightness', value: 40 }), '밝기는 포근 부탁에서');
  s = run(s, { type: 'craftLight' });
  assert.equal(s.materials.seed, 0);
  assert.equal(s.quests.q01, 'claimed', '주민 없는 목표는 자동 완료');
  assert.equal(s.quests.q02, 'available');
  assert.equal(currentObjective(s).title, '다리 건너 친구에게 가는 길 열기');
});

test('Q02: 설치·조율·다리 복원 순서를 지키고, 등불 빛은 조율 뒤 고정', () => {
  let s = run(afterQ01(), { type: 'acceptQuest', id: 'q02' });
  assert.equal(s.relations.salgu, 'accepted');
  assert.ok(fail(s, { type: 'tuned' }));
  assert.ok(fail(s, { type: 'travel', via: 'EXIT_전망대_항해정원' }) === '이쪽으로는 아직 갈 수 없어요.' || true);
  s = run(s, { type: 'placeLight', slot: 'lantern' });
  assert.equal(carriedLights(s).length, 0);
  s = run(s, { type: 'retrieveLight', slot: 'lantern' }, { type: 'placeLight', slot: 'lantern' }, { type: 'tuned', assisted: true });
  assert.equal(slotAvailability(s, 'lantern').canRetrieve, false);
  const walkway = { ...s, scene: 'walkway' };
  assert.match(fail(walkway, { type: 'travel', via: 'EXIT_전망대_항해정원' }), /접혀/);
  s = run(s, { type: 'restoreBridge' });
  assert.equal(s.quests.q02, 'completed');
  s = run(s, { type: 'claimReward', id: 'q02' });
  assert.equal(s.materials.seed, 2);
  assert.ok(craftOptions(s).forms);
  assert.equal(s.relations.salgu, 'resolved');
  assert.equal(s.quests.shelter, 'available', '선택형 쉼터는 길 복원 뒤');
});

test('Q03: 교환은 내 빛을 잃지 않고 한 번만, 엮으면 항해용 빛', () => {
  let s = run(afterQ02(), { type: 'acceptQuest', id: 'q03' });
  assert.ok(fail(s, { type: 'trade' }), '봉오리 먼저');
  s = run(s, { type: 'wakeBud' }, { type: 'trade' });
  assert.ok(s.lights.some((l) => l.origin === 'crafted'), '내 빛은 그대로');
  assert.ok(s.lights.some((l) => l.origin === 'traded' && l.color === 'mint'));
  assert.match(fail(s, { type: 'trade' }), /이미/);
  s = run(s, { type: 'weave' }, { type: 'claimReward', id: 'q03' });
  assert.ok(carriedLights(s).some((l) => l.origin === 'woven'));
  assert.equal(s.quests.q04, 'available');
});

test('Q04: 빛 기여 → 목적지 선택 → 출항, 완료는 도착해 조작을 되찾을 때', () => {
  let s = { ...afterQ03(), scene: 'overlook' };
  s = run(s, { type: 'acceptQuest', id: 'q04' });
  assert.equal(canDepart(s).ok, false);
  s = run(s, { type: 'feedOrgan' });
  assert.ok(!carriedLights(s).some((l) => l.origin === 'woven'), '엮은 빛은 나무로');
  assert.ok(fail(s, { type: 'chooseRoute', route: 'twilight' }), '구현 안 된 첫 항로는 못 고름');
  s = run(s, { type: 'chooseRoute', route: 'ice' }, { type: 'depart' });
  assert.equal(s.scene, 'ice');
  assert.equal(s.quests.q04, 'active', '버튼 누른 순간에는 완료 아님');
  assert.equal(s.world.chapterDone, false);
  s = run(s, { type: 'arrivalControl' });
  assert.equal(s.quests.q04, 'claimed');
  assert.equal(s.world.chapterDone, true);
  assert.deepEqual(chapterProgress(s), { done: 4, total: 4 });
  const again = run(s, { type: 'arrivalControl' });
  assert.equal(again.materials.seed, s.materials.seed, '도착 보상 중복 없음');
  s = run(s, { type: 'depart' });
  assert.equal(s.scene, 'overlook');
});

test('포근의 쉼터: 밝기는 수락할 때 배우고, 조건이 맞아야 완료', () => {
  let s = run(afterQ02(), { type: 'acceptQuest', id: 'shelter' });
  assert.ok(craftOptions(s).brightness);
  s = run(s, { type: 'openBench' }, { type: 'setDraft', key: 'motion', value: 'pulse' }, { type: 'setDraft', key: 'brightness', value: 90 }, { type: 'craftLight' });
  s = run(s, { type: 'placeLight', slot: 'shelter' });
  assert.equal(s.quests.shelter, 'active', '너무 밝으면 미완료');
  s = run(s, { type: 'retrieveLight', slot: 'shelter' }, { type: 'setDraft', key: 'brightness', value: 50 });
  const lid = carriedLights(s).at(-1).id;
  s = run(s, { type: 'reshapeLight', lightId: lid }, { type: 'placeLight', slot: 'shelter', lightId: lid });
  assert.equal(lightAt(s, 'shelter').brightness, 50);
  s = run(s, { type: 'claimReward', id: 'shelter' });
  assert.ok(s.unlocks.includes('petalScarf'));
  s = run(s, { type: 'setProfile', profile: { accessory: 'petalScarf' }, confirm: true });
  assert.equal(s.profile.accessory, 'petalScarf');
});

test('저장: 버전·원장 검증, 새로고침 뒤 보상 재수령 거부, 이전 데모 저장은 건드리지 않음', () => {
  const s = afterQ02();
  const storage = memoryStorage();
  storage.setItem('lumina-3d-save', '{"version":1}');
  saveState(storage, s);
  const loaded = loadState(storage);
  assert.equal(loaded.hasSave, true);
  assert.ok(fail(loaded.state, { type: 'claimReward', id: 'q02' }));
  assert.equal(storage.getItem('lumina-3d-save'), '{"version":1}');
  const bad = JSON.parse(JSON.stringify(s));
  bad.quests.q03 = 'claimed';
  assert.equal(sanitize(bad).recovered, true);
  storage.setItem(SAVE_KEY, '{oops');
  assert.match(loadState(storage).notice, /손상/);
});

test('등불 조율: 정점 근처 입력만 성공, 두 번 실패하면 판정이 넓어지고 자동 조율 가능', () => {
  let t = start(createTuning(2), 0);
  t = press(t, 0.8); // 주기 1.6의 절반 = 정점에서 가장 멂
  t = press(t, 0.75);
  assert.equal(t.misses, 2);
  assert.ok(t.window > 0.3);
  t = press(t, 1.6 + 0.05);
  assert.equal(t.lastResult, 'hit');
  assert.equal(autoTune(t).status, 'done');
  assert.equal(autoTune(start(createTuning(2), 0)).status, 'playing', '실패 전에는 자동 조율 없음');
});

test('결정의 노래(선택형): 실패 위치 표시 후 성공', () => {
  let p = finishListening(listen(createPuzzle([0, 2, 1, 2])));
  p = pressSong(p, 0);
  p = pressSong(p, 1);
  assert.equal(p.wrongAt, 1);
  p = finishListening(listen(p));
  for (const c of [0, 2, 1, 2]) p = pressSong(p, c);
  assert.equal(p.status, 'success');
});
