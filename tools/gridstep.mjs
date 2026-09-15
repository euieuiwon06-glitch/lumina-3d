// 보행 격자 턱 높이(step)를 바꿔 보며 동선 연결을 점검: node tools/gridstep.mjs <scene> <step...>
import { readFileSync } from 'node:fs';

import { decodeGrid, findPath, floodReachable, nearestWalkable } from '../src/engine/walkgrid.js';

const [id, ...steps] = process.argv.slice(2);
const meta = JSON.parse(readFileSync(`public/assets/scenes/${id}.json`, 'utf8'));
const toThree = (p) => ({ x: p[0], y: p[1], z: p[2] });
const nav = Object.fromEntries(Object.entries(meta.nav).map(([k, v]) => [k, toThree(v.p)]));
const start = nav[Object.keys(nav).find((k) => k.startsWith('ENTRY_'))];
for (const s of steps.length ? steps : ['0.22']) {
  const g = decodeGrid(meta.grid);
  g.step = Number(s);
  const from = nearestWalkable(g, start.x, start.z, start.y, 40);
  const marks = floodReachable(g, from);
  const reach = marks.reduce((n, L) => n + L.reduce((a, b) => a + (b ? 1 : 0), 0), 0);
  const res = Object.entries(nav).map(([k, p]) => {
    const w = nearestWalkable(g, p.x, p.z, p.y - 1, 40);
    const path = w && findPath(g, from, w, 400000);
    return `${k}:${path ? 'ok' : 'X'}`;
  });
  console.log(`step ${s}: reachable cells ${reach} | ${res.join(' ')}`);
}
