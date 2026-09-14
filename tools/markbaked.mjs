// 굽기 표시 갱신(개발용): node tools/markbaked.mjs workshop
import { readFileSync, writeFileSync } from 'node:fs';

for (const id of process.argv.slice(2)) {
  const p = `public/assets/scenes/${id}.json`;
  const m = JSON.parse(readFileSync(p, 'utf8'));
  m.baked = { display: true };
  writeFileSync(p, JSON.stringify(m));
  console.log(p, 'baked=display');
}
