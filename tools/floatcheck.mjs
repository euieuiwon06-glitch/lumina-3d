// 공중에 뜬 소품 점검: 소품 아래로 광선을 쏴 받쳐 주는 지형이 있는지 본다.
//   (dev 서버 실행 중) node tools/floatcheck.mjs [장면]
// 봉오리 머리(M_BudGlow)는 줄기 위에 떠 있는 게 정상이라 줄기·잎도 받침으로 친다.
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(`http://localhost:5190/?skipIntro&dev&scene=${process.argv[2] ?? 'twilight'}`);
await p.waitForFunction(() => window.lumina?.world?.root, null, { timeout: 120000 });
await p.waitForTimeout(3000);
console.log(await p.evaluate(() => {
  const T = window.lumina.THREE;
  const root = window.lumina.world.root;
  const PROP = /MintLeaf|BudStem|BudGlow|ApricotPetalStone|MintCrystalReed|SproutMint|SproutPeach/;
  // 줄기·잎도 받침으로 친다(봉오리 머리는 줄기 위에 떠 있는 게 정상)
  const GROUND = /IvoryTerrace|LilacBank|LilacSoil|LagoonBed|Step|Terrace|Bank|BudStem|MintLeaf|Sprout|PlantBed/i;
  const props = [];
  const ground = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const mn = mats.map((m) => m.name).join(',');
    if (PROP.test(mn)) props.push({ o, mat: mn });
    else if (GROUND.test(mn) || GROUND.test(o.name)) ground.push(o);
  });
  const rc = new T.Raycaster();
  rc.firstHitOnly = true;
  const rows = [];
  const box = new T.Box3();
  for (const { o, mat } of props) {
    box.setFromObject(o);
    const c = box.getCenter(new T.Vector3());
    const bottom = box.min.y;
    rc.set(new T.Vector3(c.x, bottom + 0.35, c.z), new T.Vector3(0, -1, 0));
    rc.far = 60;
    const hit = rc.intersectObjects(ground, true)[0];
    rows.push({
      name: o.name, mat,
      pos: [c.x, bottom, c.z].map((n) => +n.toFixed(2)),
      parent: o.parent?.name ?? null,
      under: hit ? hit.object.name : null,
      gap: hit ? +(bottom - hit.point.y).toFixed(2) : null,
    });
  }
  const water = root.getObjectByName('Lagoon_Water');
  box.setFromObject(water);
  const waterY = +box.max.y.toFixed(2);
  const floating = rows.filter((r) => r.under === null || r.gap > 0.4);
  const byMat = {};
  for (const r of floating) byMat[r.mat] = (byMat[r.mat] ?? 0) + 1;
  const lines = floating
    .sort((a, b) => (b.gap ?? 99) - (a.gap ?? 99))
    .map((r) => `${r.name.padEnd(26)} ${String(r.mat).padEnd(22)} x=${String(r.pos[0]).padStart(8)} z=${String(r.pos[2]).padStart(8)} y=${String(r.pos[1]).padStart(7)} gap=${String(r.gap).padStart(6)} under=${r.under} parent=${r.parent}`);
  return [`props ${props.length} / ground ${ground.length} / floating ${floating.length} / waterY ${waterY}`, JSON.stringify(byMat), ...lines].join(String.fromCharCode(10));
}));
await b.close();
