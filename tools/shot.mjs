// 검수용 스크린샷: node tools/shot.mjs "<쿼리>" <출력.png> [대기ms] [JS 식...]
import { chromium } from 'playwright';

const [query = '?skipIntro', out = 'tools/screens/shot.png', waitMs = '4000', ...evals] = process.argv.slice(2);
const w = Number(process.env.W ?? 1672);
const h = Number(process.env.H ?? 941);
const browser = await chromium.launch({
  channel: process.env.CHANNEL ?? 'msedge',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('response', (r) => r.status() >= 400 && logs.push(`[http ${r.status()}] ${r.url()}`));
await page.goto(`http://localhost:5190/${query}`);
await page.waitForFunction(() => window.lumina && window.lumina.view.mode !== 'loading', null, { timeout: 60000 }).catch(() => logs.push('timeout waiting for lumina'));
for (const e of evals) {
  if (/^wait:\d+$/.test(e)) {
    await page.waitForTimeout(Number(e.slice(5)));
    continue;
  }
  if (/^key:/.test(e)) {
    const [, key, ms] = e.split(':');
    await page.keyboard.down(key);
    await page.waitForTimeout(Number(ms ?? 500));
    await page.keyboard.up(key);
    continue;
  }
  try {
    const r = await page.evaluate(e);
    if (r !== undefined) logs.push(`[eval] ${e} → ${JSON.stringify(r)}`);
  } catch (err) {
    logs.push(`[eval error] ${e}: ${err.message}`);
  }
}
await page.waitForTimeout(Number(waitMs));
const info = await page.evaluate(() => ({
  mode: window.lumina?.view.mode,
  scene: window.lumina?.state.scene,
  fps: window.lumina?.perf.fps,
  player: window.lumina?.player?.position.toArray().map((n) => +n.toFixed(2)),
  gl: (() => {
    const c = document.getElementById('world').getContext('webgl2');
    const d = c?.getExtension('WEBGL_debug_renderer_info');
    return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : null;
  })(),
})).catch((e) => ({ err: e.message }));
await page.screenshot({ path: out });
console.log(JSON.stringify(info));
console.log(logs.filter((l) => !l.includes('[vite]')).slice(-25).join('\n'));
await browser.close();
