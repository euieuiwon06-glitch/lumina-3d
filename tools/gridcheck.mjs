// 보행 격자 점검: 각 장면에서 시작점 → 모든 동선 표시까지 경로가 있는지
//   node tools/gridcheck.mjs [scene...]
import { readFileSync } from 'node:fs';

import { decodeGrid, findPath, nearestWalkable } from '../src/engine/walkgrid.js';

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['workshop', 'neighborhood', 'nursery', 'walkway', 'overlook', 'ice', 'solar', 'twilight'];
for (const id of ids) {
  let meta;
  try {
    meta = JSON.parse(readFileSync(`public/assets/scenes/${id}.json`, 'utf8'));
  } catch {
    console.log(`${id}: 없음`);
    continue;
  }
  const g = decodeGrid(meta.grid);
  let cells = 0;
  for (const L of g.layers) for (const v of L) if (v !== -32768) cells++;
  console.log(`\n== ${id}: ${g.w}x${g.h}, 층 ${g.layers.length}, 걷는 칸 ${cells}`);
  const names = Object.keys(meta.nav).filter((k) => /^(PLAYER_START|ENTRY_|EXIT_|POI_|QUEST_)/.test(k));
  const snap = (name) => {
    const [x, y, z] = meta.nav[name].p;
    const lift = name.startsWith('QUEST_') ? 1.2 : name.startsWith('POI_') ? 0.8 : 0;
    return { raw: { x, y: y - lift, z }, w: nearestWalkable(g, x, z, y - lift, 24) };
  };
  const start = snap(names.find((n) => n === 'PLAYER_START') ?? names.find((n) => n.startsWith('ENTRY_')) ?? names[0]);
  for (const n of names) {
    const s = snap(n);
    if (!s.w) {
      console.log(`  ${n}: 근처 걷는 칸 없음`);
      continue;
    }
    const off = Math.hypot(s.w.x - s.raw.x, s.w.z - s.raw.z).toFixed(1);
    const p = start.w && findPath(g, start.w, s.w, 400000);
    console.log(`  ${n}: 칸까지 ${off}m, 높이 ${s.w.y.toFixed(2)} (표시 ${s.raw.y.toFixed(2)}), 경로 ${p ? `${p.length}점` : '없음'}`);
  }
}
