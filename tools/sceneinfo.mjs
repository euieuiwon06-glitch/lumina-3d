// 장면 에셋 점검: 메시·폴리곤 수와 재질, 그리고 Cycles 굽기(정점 색)가 들어갔는지 본다.
//   (dev 서버 실행 중) node tools/sceneinfo.mjs twilight ice solar
import { chromium } from 'playwright';

const ids = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });

for (const id of ids.length ? ids : ['workshop', 'neighborhood', 'walkway', 'overlook', 'solar', 'ice', 'twilight']) {
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:5190/?skipIntro&dev&scene=${id}`);
  await page.waitForFunction(() => window.lumina?.world?.root, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  const d = await page.evaluate(() => {
    const o = { meshes: 0, verts: 0, tris: 0, baked: 0, mats: new Set() };
    window.lumina.world.root.traverse((m) => {
      if (!m.isMesh) return;
      o.meshes++;
      const g = m.geometry;
      o.verts += g.attributes.position?.count ?? 0;
      o.tris += (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3;
      if (g.attributes.color) o.baked++;
      for (const x of Array.isArray(m.material) ? m.material : [m.material]) o.mats.add(`${x.type}${x.vertexColors ? '(vc)' : ''}`);
    });
    return { ...o, mats: [...o.mats], bakedMeta: !!window.lumina.world.meta?.baked };
  });
  console.log(
    `${id.padEnd(13)} 메시 ${String(d.meshes).padStart(4)} · ${Math.round(d.tris).toLocaleString().padStart(9)} tris · ` +
      `굽기 ${d.baked}/${d.meshes}${d.bakedMeta ? ' (meta.baked)' : ''} · ${d.mats.join(', ')}${errs.length ? ` · 오류 ${errs.length}` : ''}`,
  );
  await page.context().close();
}
await browser.close();
