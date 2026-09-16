// 장면 화면 확인: 특정 장면을 바로 열어 몇 방향에서 찍는다.
//   (dev 서버 실행 중) node tools/sceneshot.mjs twilight [--tag before] [--w 1280 --h 720]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const id = process.argv[2] ?? 'twilight';
const tag = arg('tag', 'now');
const W = Number(arg('w', 1280));
const H = Number(arg('h', 720));
const dir = `tools/screens/scene-${id}`;
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:5190/?skipIntro&dev&scene=${id}`);
await page.waitForFunction(() => window.lumina?.world?.root, null, { timeout: 120000 });
await page.waitForTimeout(3500);

const shot = async (name) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${dir}/${tag}-${name}.png` });
  return page.evaluate(() => {
    const t = { sat: 0, val: 0 };
    return t;
  });
};
await shot('a');
for (const [i, turns] of [3, 3, 2].entries()) {
  for (let k = 0; k < turns; k++) {
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(350);
  }
  await shot(`b${i + 1}`);
}
console.log(errs.length ? `오류: ${errs.slice(0, 3).join(' / ')}` : '오류 0개');
console.log(`${dir}/${tag}-*.png`);
await browser.close();
