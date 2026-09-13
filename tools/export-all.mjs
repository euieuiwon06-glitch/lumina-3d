// 블렌더 원본(../../비주얼) → public/assets 일괄 변환. 원본 .blend는 수정하지 않는다.
//   node tools/export-all.mjs                 모든 장면
//   node tools/export-all.mjs walkway ice     지정 장면만
//   node tools/export-all.mjs --characters    캐릭터만
//   추가 플래그(--no-pano, --no-grid, --no-glb)는 장면 스크립트로 전달
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const visual = path.resolve(root, '../../비주얼');
const kit = path.join(visual, 'LUMINA_추가배경_제작목록/Blender');

export const SCENE_FILES = {
  workshop: '01_light_workshop/LUMINA_01_light_workshop.blend',
  neighborhood: '02_capsule_neighborhood/LUMINA_02_capsule_neighborhood.blend',
  walkway: '03_tentacle_walkway/LUMINA_03_tentacle_walkway.blend',
  overlook: '04_navigation_overlook/LUMINA_04_navigation_overlook.blend',
  nursery: '05_seed_nursery/LUMINA_05_seed_nursery.blend',
  solar: '06_solar_garden/LUMINA_06_solar_garden.blend',
  twilight: '07_twilight_confluence/LUMINA_07_twilight_confluence.blend',
  ice: '08_ice_nebula_clean/LUMINA_08_ice_nebula_clean.blend',
};

const blender =
  process.env.BLENDER ??
  ['C:/Program Files/Blender Foundation/Blender 4.5/blender.exe', '/Applications/Blender.app/Contents/MacOS/Blender', 'blender'].find(
    (p) => p === 'blender' || existsSync(p),
  );

function run(file, script, args) {
  const t = Date.now();
  const r = spawnSync(blender, ['-b', file, '--python', path.join(here, 'blender', script), '--', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  const lines = `${r.stdout}\n${r.stderr}`.split('\n').filter((l) => /\[export|CHARS|Error|Traceback|File "/.test(l));
  console.log(lines.join('\n'));
  console.log(`  → ${((Date.now() - t) / 1000).toFixed(0)}s, exit ${r.status}`);
  return r.status === 0 && !lines.some((l) => l.includes('Traceback'));
}

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--') && a !== '--characters');
let ok = true;
if (argv.includes('--characters')) {
  ok = run(path.join(visual, '블렌더/캐릭터모델링.blend'), 'export_characters.py', [path.join(root, 'public/assets/characters')]);
} else {
  const ids = argv.filter((a) => !a.startsWith('--'));
  for (const id of ids.length ? ids : Object.keys(SCENE_FILES)) {
    console.log(`\n=== ${id}`);
    ok = run(path.join(kit, SCENE_FILES[id]), 'export_scene.py', [id, path.join(root, 'public/assets/scenes'), ...flags]) && ok;
  }
}
process.exit(ok ? 0 : 1);
