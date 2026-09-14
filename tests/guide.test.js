import assert from 'node:assert/strict';
import { test } from 'node:test';

import { guideTarget, nextExit, objectiveGoal } from '../src/game/guide.js';
import { createInitialState, reduce } from '../src/game/state.js';

function run(s, ...actions) {
  for (const a of actions) {
    const r = reduce(s, a);
    assert.equal(r.error, null, `${a.type}: ${r.error}`);
    s = r.state;
  }
  return s;
}

test('다른 장면 목표는 거기로 이어지는 출구로 안내', () => {
  assert.equal(nextExit('workshop', 'walkway'), 'ENTRY_정원_교환광장');
  assert.equal(nextExit('neighborhood', 'overlook'), 'EXIT_촉수산책로');
  assert.equal(nextExit('nursery', 'overlook'), 'EXIT_빛제작실');
  assert.equal(nextExit('ice', 'walkway'), 'ENTRY_해파리선착장');
  assert.equal(nextExit('walkway', 'walkway'), null);
});

test('챕터 진행에 따라 목표가 바뀐다', () => {
  let s = run(createInitialState(), { type: 'setProfile', profile: {}, confirm: true });
  assert.deepEqual(guideTarget(s), { scene: 'workshop', kind: 'workbench', id: 'workbench', label: '둥근 작업대', final: true });
  s = run(s, { type: 'openBench' }, { type: 'craftLight' });
  // 살구는 수락 전 캡슐 마을에 있다 → 제작실에서는 마을로 나가는 문
  assert.equal(objectiveGoal(s).scene, 'neighborhood');
  const t = guideTarget(s);
  assert.equal(t.kind, 'exit');
  assert.equal(t.id, 'ENTRY_정원_교환광장');
  s = run({ ...s, scene: 'neighborhood' }, { type: 'acceptQuest', id: 'q02' });
  assert.equal(objectiveGoal(s).id, 'lantern');
  assert.equal(guideTarget(s).id, 'EXIT_촉수산책로');
});
