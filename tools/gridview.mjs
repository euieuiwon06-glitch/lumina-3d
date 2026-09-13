// 보행 격자를 위에서 본 이미지로 저장: node tools/gridview.mjs <scene> [out.png]
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const id = process.argv[2] ?? 'neighborhood';
const out = process.argv[3] ?? `tools/screens/grid-${id}.png`;
const meta = JSON.parse(readFileSync(`public/assets/scenes/${id}.json`, 'utf8'));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
await page.setContent('<canvas id="c"></canvas>');
await page.evaluate((meta) => {
  const g = meta.grid;
  const layers = g.layers.map((b64) => {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Int16Array(u8.buffer);
  });
  const S = Math.max(1, Math.floor(980 / Math.max(g.w, g.h)));
  const c = document.getElementById('c');
  c.width = g.w * S;
  c.height = g.h * S;
  const x = c.getContext('2d');
  x.fillStyle = '#222';
  x.fillRect(0, 0, c.width, c.height);
  let min = Infinity;
  let max = -Infinity;
  for (const L of layers) for (const v of L) if (v !== -32768) ((min = Math.min(min, v)), (max = Math.max(max, v)));
  for (let j = 0; j < g.h; j++) {
    for (let i = 0; i < g.w; i++) {
      const n = j * g.w + i;
      const vs = layers.map((L) => L[n]).filter((v) => v !== -32768);
      if (!vs.length) continue;
      const t = (Math.max(...vs) - min) / Math.max(1, max - min);
      x.fillStyle = vs.length > 1 ? '#ff0' : `hsl(${240 - t * 200},70%,${45 + t * 25}%)`;
      x.fillRect(i * S, (g.h - 1 - j) * S, S, S);
    }
  }
  x.font = '12px sans-serif';
  for (const [name, v] of Object.entries(meta.nav)) {
    const bx = v.p[0];
    const by = -v.p[2];
    const i = (bx - g.x0) / g.cell;
    const j = (by - g.y0) / g.cell;
    x.fillStyle = '#f0f';
    x.beginPath();
    x.arc(i * S, (g.h - 1 - j) * S, 5, 0, 7);
    x.fill();
    x.fillStyle = '#fff';
    x.fillText(name, i * S + 7, (g.h - 1 - j) * S + 4);
  }
  x.fillStyle = '#fff';
  x.fillText(`${meta.id} 높이 ${min / 100}~${max / 100}m, 노랑=여러 층`, 8, 16);
}, meta);
await (await page.$('#c')).screenshot({ path: out });
await browser.close();
console.log(out);
