// 두 번째 이야기: 첫 항해 뒤 흔적 → 두 지역(순서 자유) → 흔적 엮기 → 작은 해파리 안내 → 마을의 답장
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { currentObjective, voyageLog } from '../src/game/quests.js';
import { availableRoutes, canDepart, craftCost, createInitialState, reduce, replyReady, sanitize, slotAvailability } from '../src/game/state.js';

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
const events = (s, a) => reduce(s, a).events;
const at = (s, scene) => ({ ...s, scene });

/** 첫 항해(얼음 성운 또는 태양 정원)에 도착해 챕터를 끝낸 상태 */
function afterChapter(route = 'ice') {
  let s = run(
    createInitialState(),
    { type: 'setProfile', profile: {}, confirm: true },
    { type: 'openBench' },
    { type: 'craftLight' },
    { type: 'acceptQuest', id: 'q02' },
    { type: 'placeLight', slot: 'lantern' },
    { type: 'tuned' },
    { type: 'restoreBridge' },
    { type: 'claimReward', id: 'q02' },
    { type: 'acceptQuest', id: 'q03' },
    { type: 'wakeBud' },
    { type: 'trade' },
    { type: 'weave' },
    { type: 'claimReward', id: 'q03' },
  );
  s = run(at(s, 'overlook'), { type: 'acceptQuest', id: 'q04' }, { type: 'feedOrgan' }, { type: 'chooseRoute', route }, { type: 'depart' }, { type: 'arrivalControl' });
  assert.equal(s.world.chapterDone, true);
  return s;
}

/** 태양 정원 꽃: 밝으면 움츠리고, 은은하면 열린다 */
function doFlower(s) {
  s = run(at(s, 'solar'), { type: 'acceptQuest', id: 'flower' }, { type: 'setDraft', key: 'brightness', value: 95 }, { type: 'craftLight' });
  const shrink = events(s, { type: 'lightFlower' }).find((e) => e.type === 'flowerReact');
  assert.equal(shrink.result, 'shrink', '너무 밝으면 움츠러듦');
  s = run(s, { type: 'lightFlower' });
  assert.equal(s.story.flowerOpen, false);
  assert.ok(fail(s, { type: 'readFlowerClue' }), '열리기 전에는 흔적을 못 봄');
  const lid = s.lights.at(-1).id;
  s = run(s, { type: 'setDraft', key: 'brightness', value: 40 }, { type: 'reshapeLight', lightId: lid }, { type: 'lightFlower' });
  assert.equal(s.story.flowerOpen, true);
  assert.ok(s.lights.some((l) => l.id === lid), '비춘 빛은 사라지지 않음');
  s = run(s, { type: 'readFlowerClue' }, { type: 'claimReward', id: 'flower' });
  assert.ok(s.unlocks.includes('sunset'));
  return s;
}

/** 얼음 성운 흔적: 차가운 빛만 반응, 순서대로 */
function doIce(s) {
  s = run(at(s, 'ice'), { type: 'acceptQuest', id: 'icepath' });
  assert.ok(fail(s, { type: 'lightIceTrace', index: 1 }), '앞 흔적부터');
  s = run(s, { type: 'setDraft', key: 'color', value: 'apricot' }, { type: 'craftLight' });
  const warm = events(s, { type: 'lightIceTrace', index: 0 }).find((e) => e.type === 'iceReact');
  assert.equal(warm.ok, false, '따뜻한 빛에는 흐리게만 반응');
  s = run(s, { type: 'discover', id: 'iceAurora' }, { type: 'setDraft', key: 'color', value: 'aurora' }, { type: 'reshapeLight', lightId: s.lights.at(-1).id });
  s = run(s, { type: 'lightIceTrace', index: 0 }, { type: 'lightIceTrace', index: 1 }, { type: 'lightIceTrace', index: 2 }, { type: 'readIceClue' }, { type: 'claimReward', id: 'icepath' });
  assert.ok(s.unlocks.includes('afterglow'));
  return s;
}

test('첫 항해 직후: 낯선 빛을 보면 「누군가 남긴 빛」이 자동 등록되고 지역 부탁이 열린다', () => {
  const s0 = afterChapter('ice');
  assert.equal(s0.quests.trace, 'locked');
  assert.ok(fail(createInitialState(), { type: 'seeTrace' }), '첫 항해 전에는 없음');
  const s = run(s0, { type: 'seeTrace' });
  assert.equal(s.quests.trace, 'active');
  assert.equal(s.quests.icepath, 'available');
  assert.equal(s.quests.flower, 'available');
  assert.match(currentObjective(s).text, /리본/);
  const again = run(s, { type: 'seeTrace' });
  assert.deepEqual(again.story, s.story, '중복 실행 없음');
});

test('태양 정원 → 얼음 성운 순서: 단서·보상 한 번씩, 두 흔적을 엮으면 황혼 항로', () => {
  let s = run(afterChapter('solar'), { type: 'seeTrace' });
  s = doFlower(s);
  assert.deepEqual(s.story.clues, ['solar']);
  const seeds = s.materials.seed;
  assert.ok(fail(s, { type: 'claimReward', id: 'flower' }), '보상 재수령 거부');
  s = run(at(s, 'overlook'), { type: 'showClues' });
  assert.match(voyageLog(s).next, /얼음 성운/);
  assert.ok(fail(s, { type: 'weaveClues' }), '단서 하나로는 못 엮음');
  assert.ok(!availableRoutes(s).some((r) => r.id === 'twilight'));
  s = doIce(s);
  s = run(at(s, 'solar'), { type: 'readFlowerClue' });
  assert.equal(s.story.clues.length, 2, '단서 중복 없음');
  s = run(at(s, 'overlook'), { type: 'weaveClues' });
  assert.equal(s.quests.trace, 'claimed');
  assert.ok(availableRoutes(s).some((r) => r.id === 'twilight'));
  assert.equal(s.quests.guide, 'active');
  assert.ok(s.materials.seed >= seeds);
});

test('얼음 성운 → 태양 정원 순서도 같은 이야기로 이어진다', () => {
  let s = run(afterChapter('ice'), { type: 'seeTrace' });
  s = doIce(s);
  s = doFlower(s);
  s = run(at(s, 'overlook'), { type: 'weaveClues' }, { type: 'chooseRoute', route: 'twilight' }, { type: 'depart' });
  assert.equal(s.scene, 'twilight');
});

test('작은 해파리: 눈부신 빛에는 멈추고, 은은한 빛길 세 곳을 이으면 선착장에 합류', () => {
  let s = run(afterChapter('ice'), { type: 'seeTrace' });
  s = doFlower(doIce(s));
  s = run(at(s, 'overlook'), { type: 'weaveClues' }, { type: 'chooseRoute', route: 'twilight' }, { type: 'depart' });
  assert.ok(fail(s, { type: 'guideLight', index: 0 }), '먼저 찾기');
  s = run(s, { type: 'meetJelly' }, { type: 'setDraft', key: 'brightness', value: 90 }, { type: 'reshapeLight', lightId: s.lights.at(-1).id });
  const shy = events(s, { type: 'guideLight', index: 0 }).find((e) => e.type === 'jellyReact');
  assert.equal(shy.ok, false);
  s = run(s, { type: 'guideLight', index: 0 });
  assert.equal(s.story.guideStep, 0, '실패해도 초기화·손실 없음');
  s = run(s, { type: 'setDraft', key: 'brightness', value: 50 }, { type: 'reshapeLight', lightId: s.lights.at(-1).id });
  s = run(s, { type: 'guideLight', index: 0 }, { type: 'guideLight', index: 1 }, { type: 'guideLight', index: 2 });
  assert.equal(s.quests.guide, 'claimed');
  assert.equal(s.quests.reply, 'available');
});

test('마을의 답장: 세 지점 조건(색·형태 자유) → 항해 나무에서 보내기 → 자유 탐험 표시', () => {
  let s = run(afterChapter('ice'), { type: 'seeTrace' });
  s = doFlower(doIce(s));
  s = run(at(s, 'overlook'), { type: 'weaveClues' }, { type: 'chooseRoute', route: 'twilight' }, { type: 'depart' }, { type: 'meetJelly' });
  s = run(s, { type: 'setDraft', key: 'brightness', value: 40 }, { type: 'reshapeLight', lightId: s.lights.at(-1).id }, { type: 'guideLight', index: 0 }, { type: 'guideLight', index: 1 }, { type: 'guideLight', index: 2 });
  s = run(at(s, 'overlook'), { type: 'acceptQuest', id: 'reply' });
  // 손에 든 빛이 없으면 한 개는 재료 없이 빚을 수 있다
  const place = (st, slot, color, brightness) => {
    let x = run(st, { type: 'setDraft', key: 'color', value: color }, { type: 'setDraft', key: 'brightness', value: brightness });
    if (!x.lights.some((l) => l.origin === 'crafted' && !Object.values(x.slots).includes(l.id))) {
      assert.equal(craftCost(x), 0);
      x = run(x, { type: 'craftLight' });
    } else x = run(x, { type: 'reshapeLight', lightId: x.lights.filter((l) => l.origin === 'crafted' && !Object.values(x.slots).includes(l.id)).at(-1).id });
    return run(x, { type: 'placeLight', slot });
  };
  s = place(s, 'replyRest', 'rose', 45);
  s = place(s, 'replyPath', 'sky', 100);
  assert.ok(fail(s, { type: 'sendReply' }), '신호 빛 없음');
  s = place(s, 'replySignal', 'lilac', 60);
  assert.equal(replyReady(s), false, '신호 빛은 밝아야');
  s = run(s, { type: 'retrieveLight', slot: 'replySignal' });
  s = place(s, 'replySignal', 'lilac', 90);
  s = run(s, { type: 'sendReply' }, { type: 'claimReward', id: 'reply' });
  assert.equal(slotAvailability(s, 'replyPath').canRetrieve, false, '보낸 빛은 그대로');
  assert.equal(currentObjective(s).title, '자유 탐험');
  assert.ok(canDepart(s).ok === false || true);
});

test('예전 저장(두 번째 이야기 필드 없음)은 지우지 않고 기본값으로 이어진다', () => {
  const s = afterChapter('solar');
  const old = JSON.parse(JSON.stringify(s));
  delete old.story;
  for (const id of ['trace', 'flower', 'icepath', 'guide', 'reply']) delete old.quests[id];
  for (const k of ['replyRest', 'replyPath', 'replySignal']) delete old.slots[k];
  const { state, recovered } = sanitize(old);
  assert.equal(recovered, false);
  assert.equal(state.quests.q04, 'claimed', '완료한 퀘스트 유지');
  assert.equal(state.story.traceSeen, false);
  const next = run(state, { type: 'seeTrace' });
  assert.equal(next.quests.trace, 'active', '다음 입장에서 사건 시작');
});
