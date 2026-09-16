// 안내(목표 카드·안내 문구·목표 표시) 점검: 챕터1과 두 번째 이야기의 각 단계에서 무엇이 보이는지 찍어 본다.
//   (dev 서버 실행 중) node tools/guideprobe.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

import { DOCKS, createInitialState, reduce } from '../src/game/state.js';

const SAVE_KEY = 'lumina-3d-save-v2';

function run(state, ...actions) {
  let s = state;
  for (const a of actions) {
    const r = reduce(s, a);
    if (r.error) throw new Error(`${a.type}: ${r.error}`);
    s = r.state;
  }
  return s;
}
const tryRun = (state, ...actions) => {
  let s = state;
  for (const a of actions) {
    const r = reduce(s, a);
    if (!r.error) s = r.state;
  }
  return s;
};
const at = (s, scene) => ({ ...s, scene });
const moveTo = (s, scene) => ({ ...s, scene, arrival: DOCKS[scene] ?? null, positions: { ...s.positions, [scene]: undefined } });
const light = (d) => [...Object.entries(d).map(([key, value]) => ({ type: 'setDraft', key, value })), { type: 'craftLight' }];

function chapterStart() {
  return run(createInitialState(), { type: 'setProfile', profile: { name: '루미' }, confirm: true }, { type: 'seeOpening' });
}
function afterChapter(route) {
  let s = run(
    chapterStart(),
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
  return run(at(s, 'overlook'), { type: 'acceptQuest', id: 'q04' }, { type: 'feedOrgan' }, { type: 'chooseRoute', route }, { type: 'depart' }, { type: 'arrivalControl' });
}

const CP = [];
const add = (name, save) => CP.push({ name, save });

// ---------------------------------------------------------------- 챕터1 기준점
add('[1장] q01 작업대', chapterStart());
add('[1장] q02 살구 만나기', run(chapterStart(), { type: 'openBench' }, { type: 'craftLight' }));
add('[1장] q03 봉오리', run(chapterStart(), { type: 'openBench' }, { type: 'craftLight' }, { type: 'acceptQuest', id: 'q02' }, { type: 'placeLight', slot: 'lantern' }, { type: 'tuned' }, { type: 'restoreBridge' }, { type: 'claimReward', id: 'q02' }, { type: 'acceptQuest', id: 'q03' }));

// ---------------------------------------------------------------- 두 번째 이야기
const iceArrive = afterChapter('ice');
add('[2장] 도착 직후(낯선 빛 전)', iceArrive);

// 항해를 마치고 해파리 안으로 돌아온 뒤(낯선 빛을 아직 못 봄)
add('[복귀] 챕터 끝 · 캡슐 마을', moveTo(iceArrive, 'neighborhood'));
add('[복귀] 챕터 끝 · 빛 제작실', moveTo(iceArrive, 'workshop'));
add('[복귀] 챕터 끝 · 촉수 다리', moveTo(iceArrive, 'walkway'));
add('[복귀] 챕터 끝 · 항해 전망대', moveTo(iceArrive, 'overlook'));

const iceSeen = run(iceArrive, { type: 'seeTrace' });
add('[2장] 낯선 빛 본 뒤 · 얼음(리본 부탁 전)', iceSeen);

const iceActive = run(iceSeen, { type: 'acceptQuest', id: 'icepath' });
add('[2장] 얼음 부탁 수락(오로라 전)', iceActive);

const iceAurora = run(iceActive, { type: 'discover', id: 'iceAurora' });
add('[2장] 오로라 얻음(흔적 0/3)', iceAurora);

const iceCool = run(iceAurora, ...light({ color: 'aurora', form: 'mist' }));
const ice3 = run(iceCool, { type: 'lightIceTrace', index: 0 }, { type: 'lightIceTrace', index: 1 }, { type: 'lightIceTrace', index: 2 });
add('[2장] 흔적 3/3(단서 읽기 전)', ice3);

const iceClue = run(ice3, { type: 'readIceClue' });
add('[2장] 얼음 단서 획득(리본에게 알리기)', iceClue);

const iceClaimed = run(iceClue, { type: 'claimReward', id: 'icepath' });
add('[2장] 얼음 보상 받음 · 얼음에 서 있음', iceClaimed);

add('[2장] 전망대 · 단서 1(보라에게 보여주기 전)', moveTo(iceClaimed, 'overlook'));

const shown1 = run(moveTo(iceClaimed, 'overlook'), { type: 'showClues' });
add('[2장] 보라에게 보여준 뒤 · 다음 지역 고르기', shown1);

add('[해파리안] 이야기 중 · 빛 제작실', moveTo(shown1, 'workshop'));
add('[해파리안] 이야기 중 · 캡슐 마을', moveTo(shown1, 'neighborhood'));
add('[해파리안] 이야기 중 · 촉수 다리', moveTo(shown1, 'walkway'));

const solarArrive = run(shown1, { type: 'chooseRoute', route: 'solar' }, { type: 'depart' }, { type: 'arrivalControl' });
add('[2장] 태양 정원 도착(살구 부탁 전)', solarArrive);

const flowerActive = run(solarArrive, { type: 'acceptQuest', id: 'flower' });
add('[2장] 꽃 부탁 수락(아직 안 비춤)', flowerActive);

const flowerBright = run(flowerActive, ...light({ color: 'apricot', form: 'orb', brightness: 95 }));
const flowerTried = run(flowerBright, { type: 'lightFlower' });
add('[2장] 밝은 빛으로 실패한 뒤', flowerTried);

const flowerOpen = run(run(flowerTried, ...light({ color: 'apricot', form: 'orb', brightness: 35 })), { type: 'lightFlower' });
add('[2장] 꽃이 열림(단서 읽기 전)', flowerOpen);

const solarClue = run(flowerOpen, { type: 'readFlowerClue' });
add('[2장] 꽃 단서 획득(살구에게 알리기)', solarClue);

const solarClaimed = run(solarClue, { type: 'claimReward', id: 'flower' });
add('[2장] 태양 보상 받음 · 태양에 서 있음', solarClaimed);

add('[2장] 전망대 · 단서 2(엮기 전)', moveTo(solarClaimed, 'overlook'));

const woven = run(run(moveTo(solarClaimed, 'overlook'), { type: 'showClues' }), { type: 'weaveClues' });
add('[2장] 두 흔적 엮음 · 황혼 항로 해금', woven);

const twilight = run(woven, { type: 'chooseRoute', route: 'twilight' }, { type: 'depart' }, { type: 'arrivalControl' });
add('[2장] 황혼 합류지 도착(해파리 만나기 전)', twilight);

const jellyMet = run(twilight, { type: 'meetJelly' });
add('[2장] 작은 해파리 만남(빛길 0/3)', jellyMet);

const soft = run(jellyMet, ...light({ color: 'apricot', form: 'orb', brightness: 30 }));
const step1 = run(soft, { type: 'guideLight', index: 0 });
add('[2장] 빛길 1/3', step1);

const step3 = run(step1, { type: 'guideLight', index: 1 }, { type: 'guideLight', index: 2 });
add('[2장] 빛길 3/3(보상 전)', step3);

const guideClaimed = tryRun(step3, { type: 'claimReward', id: 'guide' });
add('[2장] 해파리 보상 받음 · 황혼에 서 있음', guideClaimed);

add('[2장] 전망대 · 보라의 답장 부탁 전', moveTo(guideClaimed, 'overlook'));

const replyActive = run(moveTo(guideClaimed, 'overlook'), { type: 'acceptQuest', id: 'reply' });
add('[2장] 답장 수락 · 전망대(세 자리 비어 있음)', replyActive);
add('[2장] 답장 진행 중 · 캡슐 마을', moveTo(replyActive, 'neighborhood'));
add('[2장] 답장 진행 중 · 촉수 다리', moveTo(replyActive, 'walkway'));

let three = run(moveTo(replyActive, 'neighborhood'), ...light({ color: 'apricot', brightness: 40 }), { type: 'placeLight', slot: 'replyRest' });
three = run(moveTo(three, 'walkway'), ...light({ color: 'apricot', brightness: 65 }), { type: 'placeLight', slot: 'replyPath' });
three = run(moveTo(three, 'overlook'), ...light({ color: 'aurora', form: 'thread', brightness: 95 }), { type: 'placeLight', slot: 'replySignal' });
add('[2장] 세 자리 다 놓음 · 보내기 전', three);

const sent = run(three, { type: 'sendReply' });
add('[2장] 답장 보냄(보라에게 듣기 전)', sent);

const claimed = tryRun(sent, { type: 'claimReward', id: 'reply' });
add('[2장] 답장 보상 받음 · 자유 탐험', claimed);

// ---------------------------------------------------------------- 실행
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const shots = process.argv.includes('--shots');
const LIST = only ? CP.filter((c) => c.name.includes(only)) : CP;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const rows = [];

for (const cp of LIST) {
  await ctx.addInitScript(() => {});
  const page = await ctx.newPage();
  await page.addInitScript(
    ([k, v]) => {
      localStorage.setItem(k, v);
      localStorage.setItem('lumina-3d-settings', JSON.stringify({ reducedMotion: true }));
    },
    [SAVE_KEY, JSON.stringify(cp.save)],
  );
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:5190/?skipIntro');
  try {
    await page.waitForFunction(() => window.lumina && document.querySelector('.title-screen:not([hidden])'), null, { timeout: 60000 });
    if (await page.locator('.title-skip:not([hidden])').count()) await page.locator('.title-skip').click();
    await page.waitForTimeout(500);
    await page.locator('.title-card .btn-quiet').first().click();
    await page.waitForFunction(() => window.lumina.view.mode !== 'title' && window.lumina.world.root, null, { timeout: 90000 });
    await page.waitForTimeout(2500);
    // 연출/대화가 떠 있으면 닫아 평상시 화면을 본다
    for (let i = 0; i < 10; i++) {
      if (!(await page.isVisible('.dialogue'))) break;
      const b = page.locator('.dialogue .dlg-choices button').first();
      if (!(await b.count())) break;
      await b.click();
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1200);
    const data = await page.evaluate(() => {
      const t = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
      const vis = (sel) => {
        const el = document.querySelector(sel);
        return !!el && !el.hidden && getComputedStyle(el).display !== 'none';
      };
      return {
        scene: window.lumina.state.scene,
        mode: window.lumina.view.mode,
        hintFn: window.lumina.hint(),
        hintShown: vis('.story-hint') ? t('.story-hint') : null,
        qTitle: t('.quest-card .q-title'),
        qText: t('.quest-card .q-text'),
        qTasks: [...document.querySelectorAll('.quest-card .q-tasks li')].map((li) => li.textContent.trim()),
        pointer: vis('.obj-pointer') ? t('.obj-pointer') : null,
      };
    });
    if (shots) {
      mkdirSync('tools/screens/guide', { recursive: true });
      await page.screenshot({ path: `tools/screens/guide/${cp.name.replace(/[^가-힣0-9a-zA-Z]+/g, '_')}.png` });
    }
    rows.push({ name: cp.name, ...data, errs });
  } catch (e) {
    rows.push({ name: cp.name, error: e.message, errs });
  }
  await page.close();
}

for (const r of rows) {
  console.log(`\n── ${r.name}  (${r.scene ?? '?'} / ${r.mode ?? '?'})`);
  if (r.error) {
    console.log(`   !! ${r.error}`);
    continue;
  }
  console.log(`   안내문구 : ${r.hintShown ?? (r.hintFn ? `(안 보임) ${r.hintFn}` : '— 없음 —')}`);
  console.log(`   목표카드 : ${r.qTitle} / ${r.qText}`);
  if (r.qTasks.length) console.log(`   할 일    : ${r.qTasks.join(' | ')}`);
  console.log(`   목표표시 : ${r.pointer ?? '— 없음 —'}`);
  if (r.errs.length) console.log(`   오류     : ${r.errs.slice(0, 2).join(' / ')}`);
}
await browser.close();
