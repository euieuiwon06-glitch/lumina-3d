// 항해 연출 색감 확인: 연출의 여러 시점을 그대로 찍는다.
//   (dev 서버 실행 중) node tools/voyageshot.mjs [--tag before]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

import { createInitialState, reduce } from '../src/game/state.js';

const run = (state, ...actions) => {
  let s = state;
  for (const a of actions) {
    const r = reduce(s, a);
    if (r.error) throw new Error(`${a.type}: ${r.error}`);
    s = r.state;
  }
  return s;
};
const save = run(createInitialState(), { type: 'setProfile', profile: { name: '루미' }, confirm: true }, { type: 'seeOpening' }, { type: 'openBench' }, { type: 'craftLight' });

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const tag = arg('tag', 'now');
const dir = 'tools/screens/voyage';
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.addInitScript(
  ([k, v]) => {
    localStorage.setItem(k, v);
    localStorage.setItem('lumina-3d-settings', JSON.stringify({ reducedMotion: true }));
  },
  ['lumina-3d-save-v2', JSON.stringify(save)],
);
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5190/?skipIntro');
await page.waitForFunction(() => window.lumina && document.querySelector('.title-screen:not([hidden])'), null, { timeout: 60000 });
if (await page.locator('.title-skip:not([hidden])').count()) await page.locator('.title-skip').click();
await page.waitForTimeout(500);
await page.locator('.title-card .btn-quiet').first().click();
await page.waitForFunction(() => window.lumina.view.mode !== 'title' && window.lumina.world.root, null, { timeout: 90000 });
await page.waitForTimeout(2000);

for (const at of [1, 4, 8, 11]) {
  await page.evaluate((a) => window.lumina.voyagePreview(a, 12), at);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${dir}/${tag}-${String(at).padStart(2, '0')}s.png` });
  // 화면 평균 채도
  const s = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const t = document.createElement('canvas');
    t.width = 160;
    t.height = 90;
    t.getContext('2d').drawImage(cv, 0, 0, 160, 90);
    const d = t.getContext('2d').getImageData(0, 0, 160, 90).data;
    let sat = 0;
    let val = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255;
      const g = d[i + 1] / 255;
      const b = d[i + 2] / 255;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      sat += mx ? (mx - mn) / mx : 0;
      val += mx;
      n++;
    }
    return { sat: +(sat / n).toFixed(3), val: +(val / n).toFixed(3) };
  });
  console.log(`${at}s  평균 채도 ${s.sat}  평균 밝기 ${s.val}`);
}
await page.evaluate(() => window.lumina.voyagePreview(null));
console.log(errs.length ? `오류: ${errs.slice(0, 3).join(' / ')}` : '오류 0개');
await browser.close();
