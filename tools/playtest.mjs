// 전체 데모 자동 플레이: 새 게임 → 쉼터 → 산책로 → 첫 항로(얼음 성운) → 결정의 노래 → 마지막 빛 → 새로고침 복원
//   (dev 서버 실행 중) node tools/playtest.mjs [--w 1672 --h 941]
// 걷기·상호작용은 게임의 실제 경로 이동(approach)과 화면 버튼 클릭으로 수행한다. 상태를 직접 고치지 않는다.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const W = Number(arg('w', 1672));
const H = Number(arg('h', 941));
const dir = `tools/screens/play-${W}x${H}`;
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
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const ev = (fn, a) => page.evaluate(fn, a);
const shot = async (name) => page.screenshot({ path: `${dir}/${String(++step).padStart(2, '0')}-${name}.png` });
const sleep = (ms) => page.waitForTimeout(ms);
const mode = () => ev(() => window.lumina?.view.mode);
async function waitPlay(timeout = 60000) {
  await page.waitForFunction(() => window.lumina && window.lumina.view.mode === 'play', null, { timeout });
  await sleep(400);
}
async function waitFor(fn, timeout = 30000, a) {
  await page.waitForFunction(fn, a, { timeout, polling: 100 });
}
const S = () => ev(() => window.lumina.state);

/** 대상까지 실제로 걸어가 상호작용하고, 걷기가 끝날 때까지 기다린다 */
async function act(kind, id, expect = null) {
  const found = await ev(([k, i]) => window.lumina.approach(k, i), [kind, id]);
  if (!found) throw new Error(`대상 없음 ${kind} ${id}`);
  const t0 = Date.now();
  await waitFor(
    ([k]) => {
      const v = window.lumina.view;
      if (v.mode !== 'play') return true;
      if (k === 'slot' || k === 'workbench' || k === 'puzzle') return !!v.panel;
      return !window.lumina.walking;
    },
    90000,
    [kind],
  ).catch(() => {});
  await sleep(500);
  const toastText = await ev(() => document.querySelector('.toast:not([hidden])')?.textContent);
  if (toastText && /찾지 못|갈 수 없/.test(toastText)) console.log(`  (알림) ${toastText}`);
  if (expect) await waitFor(expect, 20000).catch(() => {});
  return Date.now() - t0;
}
async function click(selector) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
  await page.click(selector);
  await sleep(300);
}
async function travel(exitId, sceneId) {
  await act('exit', exitId);
  await waitFor((s) => window.lumina.state.scene === s && window.lumina.view.mode === 'play', 60000, sceneId);
  await sleep(600);
  ok(`이동 → ${sceneId}`, (await S()).scene === sceneId);
}
async function chooseMotion(label) {
  await act('workbench', 'workbench');
  await page.locator('.craft-panel .chip', { hasText: new RegExp(`^${label}$`) }).click();
  await sleep(200);
}
async function setBrightness(v) {
  await page.locator('#brightness').fill(String(v));
  await page.locator('#brightness').dispatchEvent('input');
  await sleep(200);
}

// ------------------------------------------------------------------ 시작
await page.goto('http://localhost:5190/?reset');
await waitFor(() => window.lumina && document.querySelector('.intro:not([hidden])'), 60000).catch(() => {});
await shot('intro');
ok('인트로 표시', await page.isVisible('.intro'));
await click('.intro .btn-primary');
await waitPlay();
let st = await S();
ok('빛 제작실에서 시작', st.scene === 'workshop');
await ev(() => {
  window.lumina.camera.distance = 5;
});
await sleep(800);
await shot('workshop');

// 작업대 열어 보기
await act('workbench', 'workbench');
ok('작업대 패널', await page.isVisible('.craft-panel'));
await shot('workbench');
await page.keyboard.press('Escape');

// 마을로
await travel('ENTRY_정원_교환광장', 'neighborhood');
await shot('neighborhood');

// 쉼터: 잠긴 설치 지점부터 확인
await act('slot', 'shelter');
ok('부탁 전 설치 지점은 잠김', await page.locator('.slot-panel:not(.craft-panel) .btn-primary').first().isDisabled());
await page.keyboard.press('Escape');

await act('npc', 'pogeun');
ok('포근 부탁 모달', (await mode()) === 'modal');
await shot('quest-modal');
await click('.qm-actions .btn-primary');
st = await S();
ok('쉼터 부탁 수락 + 씨앗 1', st.quests.shelter === 'active' && st.materials.seed === 1);
await click('.qm-actions .btn-quiet');

// 일부러 조건이 틀린 빛(부유·밝기 80)을 놓아 본다
await act('slot', 'shelter');
await shot('slot-panel');
await click('.slot-panel:not(.craft-panel) .sp-actions .btn-primary:not([hidden])');
st = await S();
ok('틀린 빛은 완료되지 않음', st.quests.shelter === 'active' && st.slots.shelter !== null);
await sleep(600);
await shot('light-placed-wrong');
await click('.slot-panel:not(.craft-panel) .sp-actions .btn-quiet:not([hidden])');
ok('거두면 씨앗 복귀', (await S()).materials.seed === 1);
await page.keyboard.press('Escape');

// 작업대에서 맥동·밝기 50
await travel('ENTRY_정원_교환광장', 'workshop');
await chooseMotion('맥동');
await setBrightness(50);
st = await S();
ok('작업대: 맥동·밝기 50', st.draft.motion === 'pulse' && st.draft.brightness === 50);
await shot('workbench-pulse');
await page.keyboard.press('Escape');
await travel('ENTRY_정원_교환광장', 'neighborhood');
await act('slot', 'shelter');
await click('.slot-panel:not(.craft-panel) .sp-actions .btn-primary:not([hidden])');
st = await S();
ok('쉼터 조건 충족 → completed', st.quests.shelter === 'completed');
await sleep(800);
await shot('shelter-done');
await page.keyboard.press('Escape');
await act('npc', 'pogeun');
await click('.qm-actions .btn-primary');
st = await S();
ok('쉼터 보상(씨앗 2) 한 번', st.quests.shelter === 'claimed' && st.materials.seed === 2);
await click('.qm-actions .btn-quiet');

// 산책로
await travel('EXIT_촉수산책로', 'walkway');
await shot('walkway');
await act('discovery', 'walkwaySeed');
ok('숨은 씨앗 발견', (await S()).materials.seed === 3, JSON.stringify(await ev(() => ({ p: window.lumina.player.position.toArray(), w: window.lumina.walking, mode: window.lumina.view.mode, spots: window.lumina.spots().filter((s) => s.kind === 'discovery'), seed: window.lumina.state.materials.seed, ledger: window.lumina.state.ledger }))));
await act('npc', 'salgu');
await click('.qm-actions .btn-primary');
await click('.qm-actions .btn-quiet');
await act('slot', 'path2');
await click('.slot-panel:not(.craft-panel) .sp-actions .btn-primary:not([hidden])');
st = await S();
ok('살구빛 산책로 completed', st.quests.apricot === 'completed');
await page.keyboard.press('Escape');
await act('npc', 'salgu');
await click('.qm-actions .btn-primary');
st = await S();
ok('노을빛 배색 해금', st.unlocks.includes('sunset') && st.quests.apricot === 'claimed');
await click('.qm-actions .btn-quiet');
await shot('walkway-lit');

// 전망대
await travel('EXIT_전망대_항해정원', 'overlook');
await shot('overlook');
await act('npc', 'bora');
await click('.qm-actions .btn-primary');
await click('.qm-actions .btn-quiet');
// 하늘빛(차가움)
await page.click('.swatch.sw-5');
await act('slot', 'helm');
await click('.slot-panel:not(.craft-panel) .sp-actions .btn-primary:not([hidden])');
await sleep(400);
await shot('helm-cool');
const departText = await page.locator('.slot-panel:not(.craft-panel) .sp-actions .btn-primary:not([hidden])').innerText();
ok('출항 버튼이 얼음 성운을 가리킴', departText.includes('얼음 성운'), departText);
await page.locator('.slot-panel:not(.craft-panel) .sp-actions .btn-primary:not([hidden])').click();
await sleep(1500);
await shot('voyage');
await waitFor(() => window.lumina.state.scene === 'ice' && window.lumina.view.mode === 'play', 60000);
await sleep(800);
st = await S();
ok('얼음 성운 도착 + 첫 항로 completed', st.scene === 'ice' && st.quests.voyage === 'completed');
await shot('ice');

// 결정의 노래
await act('npc', 'ribbon');
await click('.qm-actions .btn-primary');
await click('.qm-actions .btn-quiet');
await act('puzzle', 'puzzle');
await shot('puzzle-panel');
await click('.puzzle-panel .pz-actions .btn-primary');
await waitFor(() => window.lumina.view.puzzle.status === 'input', 15000);
// 틀리게
await page.click('.pz-pad.pad-1');
await sleep(400);
ok('퍼즐 실패 표시', (await ev(() => window.lumina.view.puzzle.status)) === 'failure');
await shot('puzzle-fail');
await click('.puzzle-panel .pz-actions .btn-primary');
await waitFor(() => window.lumina.view.puzzle.status === 'input', 15000);
for (const i of [0, 2, 1, 2]) {
  await page.click(`.pz-pad.pad-${i}`);
  await sleep(350);
}
st = await S();
ok('퍼즐 성공', st.puzzle.solved && st.puzzle.attempts === 1);
await sleep(600);
await shot('puzzle-success');
await page.keyboard.press('Escape');
await act('npc', 'ribbon');
await click('.qm-actions .btn-primary');
st = await S();
ok('천천히 맥동하는 기억', st.unlocks.includes('slowpulse'));
await click('.qm-actions .btn-quiet');

// 귀환
await click('.return-btn');
await waitFor(() => window.lumina.state.scene === 'overlook' && window.lumina.view.mode === 'play', 60000);
await sleep(600);
ok('전망대로 귀환', (await S()).scene === 'overlook');
await act('npc', 'bora');
await click('.qm-actions .btn-primary');
await click('.qm-actions .btn-quiet');
ok('첫 항로 보상', (await S()).quests.voyage === 'claimed');

// 마지막 빛
await travel('ENTRY_촉수산책로', 'walkway');
await travel('ENTRY_주거구역', 'neighborhood');
await act('npc', 'pogeun');
await click('.qm-actions .btn-primary');
await click('.qm-actions .btn-quiet');
ok('마지막 부탁 수락', (await S()).quests.finale === 'active');
await travel('ENTRY_정원_교환광장', 'workshop');
await chooseMotion('천천히 맥동');
await page.keyboard.press('Escape');
await travel('ENTRY_정원_교환광장', 'neighborhood');
await travel('EXIT_촉수산책로', 'walkway');
await act('slot', 'path3');
await click('.slot-panel:not(.craft-panel) .sp-actions .btn-primary:not([hidden])');
ok('마지막 빛 completed', (await S()).quests.finale === 'completed');
await page.keyboard.press('Escape');
await travel('ENTRY_주거구역', 'neighborhood');
await act('npc', 'pogeun');
await click('.qm-actions .btn-primary');
await waitFor(() => window.lumina.view.mode === 'finale', 10000).catch(() => {});
await sleep(800);
ok('마무리 장면', (await mode()) === 'finale');
await shot('finale');
await click('.finale .btn-primary');

// 새로고침 복원·중복 보상 방지
const before = await S();
await page.reload();
await waitPlay();
const after = await S();
ok('새로고침 뒤 진행 복원', after.quests.finale === 'claimed' && after.scene === before.scene && after.materials.shard === before.materials.shard);
const dup = await ev(() => window.lumina.dispatch({ type: 'claimReward', id: 'finale' }));
ok('복원 뒤 보상 재수령 거부', dup === false && (await S()).materials.shard === before.materials.shard);
await shot('restored');

const fps = await ev(() => window.lumina.perf.fps);
console.log(`\nfps(헤드리스) ${fps}`);
console.log(`오류 ${errors.length}개`);
errors.slice(0, 10).forEach((e) => console.log('  ', e));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
