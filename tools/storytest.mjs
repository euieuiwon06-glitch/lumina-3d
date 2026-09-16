// 두 번째 이야기 "누군가 남긴 빛" 화면 검수: 첫 항해를 마친 저장에서 시작해 각 분기를 실제 걷기·클릭으로 진행
//   (dev 서버 실행 중) node tools/storytest.mjs [--w 1672 --h 941]
// 장면 사이 긴 항해만 저장 상태의 장면 값을 바꿔 건너뛴다(진행 상태는 브라우저에서 만들어진 것을 그대로 이어 씀).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

import { DOCKS, createInitialState, reduce } from '../src/game/state.js';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const W = Number(arg('w', 1672));
const H = Number(arg('h', 941));
const dir = `tools/screens/story-${W}x${H}`;
mkdirSync(dir, { recursive: true });
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
const at = (s, scene) => ({ ...s, scene });
const moveTo = (s, scene) => ({ ...s, scene, arrival: DOCKS[scene] ?? null, positions: { ...s.positions, [scene]: undefined } });

/** 첫 항해(얼음 성운)에 도착해 챕터를 끝낸 저장 */
function afterChapter(route) {
  let s = run(
    createInitialState(),
    { type: 'setProfile', profile: { name: '루미' }, confirm: true },
    { type: 'seeOpening' },
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
  return s;
}

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
let page;
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
const waitFor = (fn, timeout = 30000, a) => page.waitForFunction(fn, a, { timeout, polling: 100 });
const waitMode = (m, timeout = 60000) => waitFor((x) => window.lumina?.view.mode === x && !window.lumina.cinematic, timeout, m);

async function open(save, label) {
  if (page) await page.context().close();
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(([k, v]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(k, v);
      localStorage.setItem('lumina-3d-settings', JSON.stringify({ reducedMotion: false }));
      sessionStorage.setItem('seeded', '1');
    }
  }, [SAVE_KEY, JSON.stringify(save)]);
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror(${label}): ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console(${label}): ${m.text()}`));
  await page.goto('http://localhost:5190/');
  await waitFor(() => window.lumina && document.querySelector('.title-screen:not([hidden])'), 90000);
  if (await page.locator('.title-skip:not([hidden])').count()) await page.locator('.title-skip').click();
  await sleep(800);
  await page.locator('.title-card .btn-quiet').first().click();
  await waitFor(() => window.lumina.view.mode !== 'title' && window.lumina.world.root, 90000);
  await sleep(1000);
}
async function act(kind, id) {
  await waitMode('play');
  await ev(() => window.lumina.view.panel && window.lumina.closePanel?.(true));
  await ev(() => (window.lumina.view.panel = null));
  const found = await ev(([k, i]) => window.lumina.approach(k, i), [kind, id]);
  if (!found) throw new Error(`대상 없음 ${kind} ${id} — ${JSON.stringify(await ev(() => window.lumina.spots()))}`);
  await waitFor(
    ([k]) => {
      const v = window.lumina.view;
      if (v.mode !== 'play') return true;
      if (['slot', 'flower', 'iceTrace', 'guidePt'].includes(k)) return !!v.panel;
      return !window.lumina.walking;
    },
    90000,
    [kind],
  ).catch(() => {});
  await sleep(600);
}
async function choose(label) {
  const btn = page.locator('.dialogue .dlg-choices button', { hasText: label });
  for (let i = 0; i < 6 && !(await btn.count()); i++) {
    const next = page.locator('.dialogue .dlg-choices button', { hasText: /^다음$/ });
    if (!(await next.count())) break;
    await next.first().click();
    await sleep(350);
  }
  await btn.first().waitFor({ state: 'visible', timeout: 15000 });
  await btn.first().click();
  await sleep(350);
}
async function finishDialogue() {
  for (let i = 0; i < 8; i++) {
    if (!(await page.isVisible('.dialogue'))) return;
    const b = page.locator('.dialogue .dlg-choices button').first();
    const text = await b.innerText();
    if (!['다음', '닫기'].includes(text.trim())) return;
    await b.click();
    await sleep(300);
  }
}
async function talk(id) {
  await act('npc', id);
  await page.waitForSelector('.dialogue', { state: 'visible', timeout: 15000 });
}
/** 들고 있는 빛을 다시 빚거나(무료 조절) 새로 빚는다 */
async function setLight(draft) {
  return ev((d) => {
    const L = window.lumina;
    for (const [k, v] of Object.entries(d)) L.dispatch({ type: 'setDraft', key: k, value: v });
    const placed = new Set(Object.values(L.state.slots));
    const mine = L.state.lights.filter((l) => l.origin === 'crafted' && !placed.has(l.id));
    const last = mine[mine.length - 1];
    return (last && L.dispatch({ type: 'reshapeLight', lightId: last.id })) || L.dispatch({ type: 'craftLight' });
  }, draft);
}
async function useLight() {
  await page.waitForSelector('.use-panel:not([hidden])', { timeout: 10000 });
  await page.locator('.use-panel .sp-actions .btn-primary:not([hidden])').click();
  await sleep(900);
}
const resultText = () => ev(() => document.querySelector('.use-panel .use-result')?.textContent ?? '');

// ------------------------------------------------------------------ 1) 얼음 성운 먼저: 낯선 빛 → 흔적 세 곳
await open(afterChapter('ice'), 'ice');
await page.waitForSelector('.dialogue', { state: 'visible', timeout: 20000 });
await shot('ice-trace-event');
ok('기존 저장 이어하기 → 도착지에서 낯선 빛 사건', (await page.innerText('.dialogue')).includes('우리 해파리'));
await finishDialogue();
await waitFor(() => window.lumina.state.story.traceSeen, 5000).catch(() => {});
let st = await S();
ok('「누군가 남긴 빛」 자동 등록', st.quests.trace === 'active' && st.quests.icepath === 'available');
ok('목표 UI: 행동·이유 표시', /리본|흔적/.test(await page.innerText('.quest-card')), (await page.innerText('.quest-card')).slice(0, 120));
await talk('ribbonIce');
await choose('같이 살펴보자');
await finishDialogue();
ok('얼음 부탁 수락(함께)', (await S()).quests.icepath === 'active');
await sleep(1500);
await act('discovery', 'iceAurora');
await setLight({ color: 'apricot', brightness: 70 });
await act('iceTrace', 'trace0');
await useLight();
await shot('ice-warm-faint');
ok('따뜻한 빛: 흐린 반응 + 이유 안내, 실패 손실 없음', (await S()).story.iceTraces.length === 0 && /차가운/.test(await resultText()));
await setLight({ color: 'aurora', form: 'mist' });
await useLight();
ok('차가운 빛: 첫 흔적 드러남', (await S()).story.iceTraces.length === 1);
await shot('ice-glyph1');
await act('iceTrace', 'trace1');
await useLight();
await act('iceTrace', 'trace2');
await useLight();
await shot('ice-glyph3');
ok('세 흔적 순서대로 이어짐', (await S()).story.iceTraces.length === 3);
await page.locator('.use-panel .sp-actions .btn-primary:not([hidden])').click();
await sleep(1200);
st = await S();
ok('얼음 흔적 단서', st.story.clues.includes('ice'));
await shot('ice-clue');
await waitMode('play');
await talk('ribbonIce');
await finishDialogue();
await choose('잔상의 기억 받기');
await sleep(800);
st = await S();
ok('얼음 보상: 잔상', st.quests.icepath === 'claimed' && st.unlocks.includes('afterglow'));
const iceDone = st;

// 새로고침해도 흔적 유지
await open(iceDone, 'ice-reload');
await sleep(1500);
await shot('ice-reload-glow');
ok('새로고침 뒤 얼음 흔적·단서 유지', (await S()).story.iceTraces.length === 3 && (await S()).story.clues.length === 1);

// ------------------------------------------------------------------ 2) 전망대: 단서 하나 → 보라의 반응
await open(moveTo(iceDone, 'overlook'), 'overlook-1');
await talk('bora');
await choose('발견한 흔적 보여 주기');
const one = await page.innerText('.dialogue');
await shot('bora-one-clue');
ok('단서 하나: 보라 "그다음이 흐리네요"', one.includes('흐리네요'));
await finishDialogue();

// ------------------------------------------------------------------ 3) 태양 정원: 눈부셔서 숨은 꽃
let solarSave = run(at(await S(), 'overlook'), { type: 'chooseRoute', route: 'solar' }, { type: 'depart' }, { type: 'arrivalControl' });
await open(solarSave, 'solar');
await sleep(1200);
ok('이미 본 낯선 빛은 다시 나오지 않음', !(await page.isVisible('.dialogue')));
await talk('salguSolar');
await finishDialogue();
await choose('같이 살펴보자');
await finishDialogue();
ok('꽃 부탁 수락', (await S()).quests.flower === 'active');
await setLight({ color: 'apricot', brightness: 95, form: 'orb' });
await act('flower', 'flower');
await useLight();
await shot('flower-shrink');
ok('밝은 빛: 꽃이 움츠림 + 이유', !(await S()).story.flowerOpen && /밝/.test(await resultText()));
await setLight({ brightness: 40 });
await useLight();
await shot('flower-open');
ok('은은한 빛: 꽃이 열림', (await S()).story.flowerOpen);
await page.locator('.use-panel .sp-actions .btn-primary:not([hidden])').click();
await sleep(1200);
ok('꽃 단서(두 번째)', (await S()).story.clues.length === 2);
await waitMode('play');
await talk('salguSolar');
await finishDialogue();
await choose('햇살 조각 받기');
await sleep(800);
st = await S();
ok('꽃 보상 한 번만', st.quests.flower === 'claimed');
await open(st, 'solar-reload');
await sleep(1500);
await shot('solar-reload-flower');

// ------------------------------------------------------------------ 4) 전망대: 두 흔적 엮기 → 새 항로
await open(moveTo(st, 'overlook'), 'overlook-2');
await talk('bora');
await choose('발견한 흔적 보여 주기');
await finishDialogue();
await act('organ', 'organ');
await waitFor(() => window.lumina.view.mode === 'cinematic', 5000).catch(() => {});
await sleep(2500);
await shot('weave');
await waitMode('play', 20000).catch(() => {});
await finishDialogue();
st = await S();
ok('두 흔적 엮기 → 황혼 합류지 해금', st.story.cluesWoven && st.unlocks.includes('twilightRoute') && st.quests.trace === 'claimed');
await waitMode('play');
await act('organ', 'organ');
await page.waitForSelector('.routes', { state: 'visible', timeout: 10000 });
await shot('routes-twilight');
ok('항로 목록에 황혼 합류지', (await page.locator('.route-card', { hasText: '황혼 합류지' }).count()) === 1);
await page.locator('.route-card', { hasText: '황혼 합류지' }).click();
await page.locator('.routes .qm-actions .btn-primary').click();
await waitFor(() => window.lumina.state.scene === 'twilight' && window.lumina.view.mode === 'play', 120000);
await sleep(1500);
await shot('twilight-arrive');
ok('황혼 합류지 도착(실제 항해)', (await S()).scene === 'twilight' && (await S()).quests.guide === 'active');

// ------------------------------------------------------------------ 5) 이쪽으로 와도 괜찮아
await act('jelly', 'jelly');
await sleep(800);
ok('작은 해파리 만남', (await S()).story.jellyMet);
await setLight({ brightness: 95, motion: 'afterglow' });
await act('guidePt', 'guide0');
await useLight();
await shot('jelly-flinch');
ok('강한 빛: 움찔, 초기화 없음', (await S()).story.guideStep === 0 && /너무 밝/.test(await resultText()));
await setLight({ brightness: 35 });
await useLight();
ok('은은한 빛: 한 칸 이동', (await S()).story.guideStep === 1);
await sleep(1500);
await shot('jelly-step1');
await act('guidePt', 'guide1');
await useLight();
await act('guidePt', 'guide2');
await useLight();
await sleep(2500);
await shot('jelly-home');
st = await S();
ok('작은 해파리가 선착장까지', st.story.guideStep === 3 && ['completed', 'claimed'].includes(st.quests.guide));

// ------------------------------------------------------------------ 6) 우리 마을의 답장
await open(moveTo(st, 'overlook'), 'overlook-3');
await sleep(1200);
await shot('overlook-jelly-stay');
await talk('bora');
await finishDialogue();
await choose('답장 준비할게요');
await finishDialogue();
ok('답장 부탁 수락', (await S()).quests.reply === 'active');
await setLight({ brightness: 95, color: 'aurora', form: 'thread' });
await act('slot', 'replySignal');
await shot('reply-signal-panel');
ok('답장 자리 조건 표시', /어울리는 빛/.test(await page.innerText('.slot-panel:not(.use-panel)')));
await page.getByRole('button', { name: '놓기', exact: true }).click();
await sleep(600);
// 쉼터·산책길 자리는 해당 지역에서 놓는다(상태 규칙으로 놓고 화면은 전망대에서 확인)
let rs = await S();
rs = run(at(rs, 'neighborhood'), { type: 'setDraft', key: 'brightness', value: 40 }, { type: 'setDraft', key: 'color', value: 'apricot' }, { type: 'craftLight' }, { type: 'placeLight', slot: 'replyRest' });
rs = run(at(rs, 'walkway'), { type: 'setDraft', key: 'brightness', value: 65 }, { type: 'craftLight' }, { type: 'placeLight', slot: 'replyPath' });
await open(moveTo(rs, 'overlook'), 'overlook-4');
await act('organ', 'organ');
await waitFor(() => window.lumina.view.mode === 'cinematic', 5000).catch(() => {});
await sleep(4000);
await shot('reply-send');
await waitFor(() => window.lumina.state.story.replySent, 20000).catch(() => {});
await sleep(1500);
await shot('reply-answer');
await waitMode('play', 20000).catch(() => {});
await finishDialogue();
st = await S();
ok('답장 보내기', st.story.replySent && ['completed', 'claimed'].includes(st.quests.reply));
if (st.quests.reply === 'completed') {
  if (!(await page.isVisible('.dialogue'))) await talk('bora');
  await finishDialogue();
  await choose('함께 들어요');
  await sleep(800);
}
st = await S();
ok('답장 보상·자유 탐험 표시', st.quests.reply === 'claimed' && /자유 탐험/.test(await page.innerText('.quest-card')));
await shot('free-play');

console.log(errors.length ? `\n오류 ${errors.length}개\n${errors.slice(0, 10).join('\n')}` : '\n오류 0개');
console.log(`${results.filter((r) => r.ok).length}/${results.length} 통과`);
await browser.close();
