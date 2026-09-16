// 첫 챕터 "첫 번째 숨결" 자동 플레이(실제 걷기·키·클릭으로 진행, 상태를 직접 고치지 않음)
//   (dev 서버 실행 중) node tools/playtest.mjs [--w 1672 --h 941]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const W = Number(arg('w', 1672));
const H = Number(arg('h', 941));
const dir = `tools/screens/chapter-${W}x${H}`;
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('response', (r) => r.status() >= 400 && errors.push(`http ${r.status()} ${r.url()}`));

let step = 0;
const results = [];
function ok(name, cond, detail = '') {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const ev = (fn, a) => page.evaluate(fn, a);
const shot = (name) => page.screenshot({ path: `${dir}/${String(++step).padStart(2, '0')}-${name}.png` });
const sleep = (ms) => page.waitForTimeout(ms);
const S = () => ev(() => window.lumina.state);
const mode = () => ev(() => window.lumina.view.mode);
const waitFor = (fn, timeout = 30000, a) => page.waitForFunction(fn, a, { timeout, polling: 100 });
const waitMode = (m, timeout = 60000) => waitFor((x) => window.lumina?.view.mode === x && !window.lumina.cinematic, timeout, m);

async function act(kind, id) {
  await waitMode('play');
  const found = await ev(([k, i]) => window.lumina.approach(k, i), [kind, id]);
  if (!found) throw new Error(`대상 없음 ${kind} ${id} — ${JSON.stringify(await ev(() => window.lumina.spots()))}`);
  await waitFor(([k]) => {
    const v = window.lumina.view;
    if (v.mode !== 'play') return true;
    if (['slot', 'workbench', 'puzzle', 'tune'].includes(k)) return !!v.panel;
    return !window.lumina.walking;
  }, 90000, [kind]).catch(() => {});
  await sleep(500);
}
async function click(selector, timeout = 10000) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
  await page.click(selector);
  await sleep(300);
}
async function choose(label) {
  const btn = page.locator('.dialogue .dlg-choices button', { hasText: label });
  await btn.first().waitFor({ state: 'visible', timeout: 15000 });
  await btn.first().click();
  await sleep(350);
}
/** 대화를 끝까지 넘긴다(선택지가 없을 때) */
async function finishDialogue() {
  for (let i = 0; i < 6; i++) {
    if (!(await page.isVisible('.dialogue'))) return;
    const b = page.locator('.dialogue .dlg-choices button').first();
    const text = await b.innerText();
    if (!['다음', '닫기'].includes(text.trim())) return;
    await b.click();
    await sleep(300);
  }
}
async function travel(exitId, sceneId) {
  await act('exit', exitId);
  await waitFor((s) => window.lumina.state.scene === s && window.lumina.view.mode === 'play', 90000, sceneId);
  await sleep(700);
  ok(`이동 → ${sceneId}`, (await S()).scene === sceneId);
}

// ------------------------------------------------------------------ 시작 화면
await page.goto('http://localhost:5190/?reset');
await waitFor(() => window.lumina && document.querySelector('.title-screen:not([hidden])'), 90000);
// 오프닝 영상: 첫 컷 자막(멈춘 항해)이 뜨는지 본 뒤 건너뛰기(건너뛰기 뒤 타이틀 패널이 떠야 함)
if (await page.locator('.title-skip:not([hidden])').count()) {
  await waitFor(() => /멈췄/.test(document.querySelector('.title-caption:not([hidden]) .qm-title')?.textContent ?? ''), 15000).catch(() => {});
  ok('오프닝 영상 자막(멈춘 항해)', /멈췄/.test(await ev(() => document.querySelector('.title-caption:not([hidden]) .qm-title')?.textContent ?? '')));
  await shot('opening');
  await page.locator('.title-skip').click();
}
await page.waitForTimeout(1000);
await sleep(600);
const rect = await ev(() => {
  const r = document.querySelector('.title-card').getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: innerWidth, h: innerHeight };
});
// 오프닝 영상 구도: 오른쪽에 캐릭터·빛, 타이틀 패널은 왼쪽 40% 안에서 세로 가운데
ok('시작 패널이 왼쪽 영역 세로 가운데', rect.cx < rect.w * 0.4 && Math.abs(rect.cy - rect.h / 2) < rect.h * 0.03, JSON.stringify(rect));
ok('저장 없으면 이어하기 비활성', await page.locator('.title-card .btn-quiet').first().isDisabled());
await shot('title');
await click('.title-card .btn-primary');

// ------------------------------------------------------------------ 내 모습 만들기
await page.waitForSelector('.creator', { state: 'visible' });
const pick = (label) => page.locator('.creator .creator-chip', { hasText: new RegExp(`^${label}$`) }).first().click();
await pick('결정형');
await click('.creator .qm-actions .btn-quiet');
await click('.title-card .btn-primary');
await page.waitForSelector('.creator', { state: 'visible' });
ok('닫았다 돌아와도 선택 보존', (await page.getAttribute('.creator .creator-chip:has-text("결정형")', 'aria-checked')) === 'true');
await pick('새싹형');
await pick('민트');
await pick('라일락빛');
await pick('별');
await pick('목도리');
await page.fill('#creatorName', '반짝이');
await sleep(800);
await shot('creator');
ok('보상 장식은 잠김', await page.locator('.creator .creator-chip', { hasText: '꽃잎 목도리' }).isDisabled());
await click('.creator .qm-actions .btn-primary');
let st = await S();
ok('캐릭터 저장', st.profile.created && st.profile.base === 'sprout' && st.profile.body === 'mint' && st.profile.name === '반짝이');

// ------------------------------------------------------------------ 첫 깨어남(도입 이야기는 오프닝 영상 자막으로 이동)
await waitMode('play');
st = await S();
ok('제작실에서 깨어남', st.scene === 'workshop' && st.quests.q01 === 'active');
await sleep(1500);
await shot('workshop');
ok('첫 안내는 이동', (await ev(() => window.lumina.hint())).includes('걸어'));

// 튜토리얼 1·2: 걷기와 둘러보기
await page.keyboard.down('KeyW');
await sleep(1300);
await page.keyboard.up('KeyW');
await page.mouse.move(W / 2, H / 2);
await page.mouse.down();
await page.mouse.move(W / 2 + 260, H / 2, { steps: 12 });
await page.mouse.up();
await sleep(300);
st = await S();
ok('걷기·둘러보기 튜토리얼 완료', st.tutorial.done.includes('move') && st.tutorial.done.includes('look'), st.tutorial.done.join(','));

// 점프: Space로 뛰어올랐다가 제자리에 내려앉는다
const y0 = await ev(() => window.lumina.player.position.y);
await page.keyboard.press('Space');
await sleep(250);
const yUp = await ev(() => window.lumina.player.position.y);
await sleep(900);
const yEnd = await ev(() => [window.lumina.player.position.y, !!window.lumina.player.air]);
ok('Space 점프 후 착지', yUp > y0 + 0.4 && !yEnd[1] && Math.abs(yEnd[0] - y0) < 0.05, `${y0.toFixed(2)} → ${yUp.toFixed(2)} → ${yEnd[0].toFixed(2)}`);

// Q01
await act('workbench', 'workbench');
ok('작업대 깨우기', (await S()).world.benchOpened);
ok('첫 제작은 맥동만', (await page.locator('.craft-panel .sp-motions .chip:not([hidden])').allInnerTexts()).filter((t) => !t.includes('빛')).join() === '맥동');
await page.locator('.craft-panel .creator-chip', { hasText: '라일락빛' }).click();
await sleep(400);
await shot('first-craft');
await click('.craft-panel .sp-actions .btn-primary');
st = await S();
ok('Q01 내 안의 작은 빛 완료(재료 없이)', st.quests.q01 === 'claimed' && st.materials.seed === 0 && st.lights.length === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(900);
ok('길 안내: 다음 목표로 가는 출구 표시', /살구/.test(await page.locator('.obj-pointer:not([hidden])').innerText().catch(() => '')));

// ------------------------------------------------------------------ Q02 친구에게 가는 길
await travel('ENTRY_정원_교환광장', 'neighborhood');
await shot('neighborhood');
await act('npc', 'salgu');
await page.waitForSelector('.dialogue', { state: 'visible' });
await finishDialogue();
await shot('dialogue-branch');
ok('대화 선택지 3개', (await page.locator('.dialogue .dlg-choices button').count()) === 3);
await choose('내 빛으로 해볼게');
await finishDialogue();
st = await S();
ok('Q02 수락 + 관계 변화', st.quests.q02 === 'active' && st.relations.salgu === 'accepted');
await travel('EXIT_촉수산책로', 'walkway');
await shot('walkway-folded');
ok('복원 전 전망대 승강대 잠김', (await ev(() => window.lumina.state.world.bridgeRestored)) === false);
await act('slot', 'lantern');
await click('.slot-panel:not(.craft-panel) .sp-actions .btn-primary:not([hidden])');
st = await S();
ok('첫 등불에 빛 놓기', !!st.slots.lantern);
await page.keyboard.press('Escape');
await act('tune', 'tune');
await page.waitForSelector('.tune-panel', { state: 'visible' });
await shot('tuning');
for (let i = 0; i < 2; i++) {
  await waitFor(() => document.querySelector('.tune-ring.is-window'), 10000);
  await page.keyboard.press('KeyE');
  await sleep(250);
}
await waitFor(() => window.lumina.state.world.tuned, 10000).catch(() => {});
ok('타이밍에 맞춰 조율 성공', (await S()).world.tuned && !(await S()).world.tunedAssisted);
await sleep(1500);
await shot('bridge-restoring');
await waitFor(() => window.lumina.state.world.bridgeRestored && window.lumina.view.mode === 'play', 20000);
ok('촉수 다리 복원', (await S()).world.bridgeRestored);
await sleep(2500);
await act('npc', 'salgu');
await finishDialogue();
await choose('고마워');
st = await S();
ok('Q02 보상·형태 해금', st.quests.q02 === 'claimed' && st.unlocks.includes('forms') && st.materials.seed === 2);
await finishDialogue();

// ------------------------------------------------------------------ Q03 너의 빛과 나의 빛
await act('npc', 'ribbon');
await finishDialogue();
await choose('봉오리를 깨워 볼게');
await finishDialogue();
ok('Q03 수락', (await S()).quests.q03 === 'active');
await page.waitForTimeout(900);
await shot('glimmer-hint');
ok('반짝임 안내: 클릭·E 방법과 길 안내 표시', /클릭/.test(await ev(() => window.lumina.hint() ?? '')) && /반짝이는 빛/.test(await page.locator('.obj-pointer:not([hidden])').innerText().catch(() => '')));
for (let i = 0; i < 3; i++) await act('glimmer', `glimmer${i}`);
await act('bud', 'bud');
await waitFor(() => window.lumina.state.world.budAwake, 5000);
ok('봉오리 깨우기', (await S()).world.budAwake);
await page.waitForSelector('.dialogue', { state: 'visible', timeout: 10000 });
await choose('빛 나누기');
await page.waitForSelector('.exchange', { state: 'visible' });
await shot('exchange-compare');
ok('교환 전 규칙 표시', (await page.innerText('.exchange')).includes('원본은 그대로'));
await click('.exchange .qm-actions .btn-primary');
await waitFor(() => window.lumina.state.world.traded, 5000);
await page.waitForSelector('.dialogue', { state: 'visible', timeout: 15000 });
await choose('빛 엮기');
await page.waitForSelector('.exchange', { state: 'visible' });
await click('.exchange .qm-actions .btn-primary');
st = await S();
ok('교환·엮기, 내 빛 보존', st.world.woven && st.lights.some((l) => l.origin === 'crafted') && st.lights.some((l) => l.origin === 'woven'));
await page.waitForSelector('.dialogue', { state: 'visible', timeout: 15000 });
await finishDialogue();
await choose('전망대로 가 볼게');
ok('Q03 완료', (await S()).quests.q03 === 'claimed');
await finishDialogue();

// ------------------------------------------------------------------ Q04 첫 번째 숨결
await travel('EXIT_전망대_항해정원', 'overlook');
await shot('overlook');
await act('npc', 'bora');
await choose('엮은 빛을 보낼게요');
await finishDialogue();
await act('organ', 'organ');
ok('항해 나무에 빛 보내기', (await S()).world.organFed);
await sleep(2000);
await shot('organ-flow');
await page.waitForSelector('.dialogue', { state: 'visible', timeout: 15000 });
await finishDialogue();
await page.waitForSelector('.routes', { state: 'visible', timeout: 10000 });
await shot('routes');
ok('항로 두 곳만', (await page.locator('.route-card').count()) === 2);
await page.locator('.route-card', { hasText: '얼음 성운' }).click();
await click('.routes .qm-actions .btn-primary');
await waitFor(() => window.lumina.view.mode === 'voyage' && document.querySelector('.voy:not([hidden])'), 20000);
await sleep(4000);
await shot('voyage');
st = await S();
ok('출항 직전 저장(목적지)·아직 챕터 미완료', st.scene === 'ice' && !st.world.chapterDone);
await page.waitForSelector('.dialogue', { state: 'visible', timeout: 90000 });
await shot('arrival');
ok('도착 반응 대사', (await page.innerText('.dialogue')).includes('움직인다'));
await finishDialogue();
await waitFor(() => window.lumina.state.world.chapterDone, 5000).catch(() => {});
st = await S();
ok('도착해 조작을 되찾으며 챕터 완료', st.world.arrived && st.world.chapterDone && st.quests.q04 === 'claimed');
await sleep(1200);
await shot('chapter-done');
// 첫 항해 뒤 낯선 빛 → 동행 주민 반응 → '누군가 남긴 빛' 자동 등록
await page.waitForSelector('.dialogue', { state: 'visible', timeout: 15000 });
await shot('trace-light');
const traceText = await page.innerText('.dialogue');
await finishDialogue();
await waitFor(() => window.lumina.state.story.traceSeen, 5000).catch(() => {});
st = await S();
ok('첫 항해 뒤 낯선 빛 · 새 목표 자동 등록', traceText.includes('우리 해파리') && st.story.traceSeen && st.quests.trace === 'active');
await sleep(800);
await act('discovery', 'iceAurora');
ok('새 지역 빛 발견', (await S()).unlocks.includes('auroraLight'));

// ------------------------------------------------------------------ 새로고침·이어하기
const before = await S();
await page.reload();
await waitFor(() => window.lumina && document.querySelector('.title-screen:not([hidden])'), 90000);
// 오프닝 영상이 나오면 건너뛰기(건너뛰기 뒤 타이틀 패널이 떠야 함)
if (await page.locator('.title-skip:not([hidden])').count()) await page.locator('.title-skip').click();
await page.waitForTimeout(1000);
ok('이어하기 활성', !(await page.locator('.title-card .btn-quiet').first().isDisabled()));
await click('.title-card .btn-quiet');
await waitMode('play');
st = await S();
ok('복원: 장면·캐릭터·챕터', st.scene === before.scene && st.profile.name === '반짝이' && st.world.chapterDone);
const dup = await ev(() => window.lumina.dispatch({ type: 'claimReward', id: 'q02' }));
ok('복원 뒤 보상 재수령 거부', dup === false && (await S()).materials.seed === before.materials.seed);
await shot('restored');
await act('exit', 'ENTRY_해파리선착장');
await waitFor(() => window.lumina.state.scene === 'overlook' && window.lumina.view.mode === 'play', 90000);
ok('선착장에서 귀환', (await S()).scene === 'overlook');

console.log(`\n오류 ${errors.length}개`);
errors.slice(0, 10).forEach((e) => console.log('  ', e));
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 통과`);
await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
