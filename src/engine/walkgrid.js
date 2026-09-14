// 보행 격자: 블렌더에서 구운 "설 수 있는 높이" 격자로 이동·경로·지면 선택을 처리한다.
// 격자는 블렌더 XY 평면 기준이다. three 좌표(x, y, z) ↔ 블렌더(x, -z, y).
// DOM·three 의존 없음(노드 테스트 대상).

const NONE = -32768;

function decodeBase64(b64) {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** JSON 격자 → 조회용 격자 */
export function decodeGrid(g) {
  const layers = g.layers.map((b64) => {
    const u8 = decodeBase64(b64);
    return new Int16Array(u8.buffer, u8.byteOffset, u8.byteLength / 2);
  });
  return { x0: g.x0, y0: g.y0, cell: g.cell, w: g.w, h: g.h, step: g.step ?? 0.45, layers };
}

/** 테스트·도구용: 높이 함수로 격자 만들기. fn(bx, by) → 높이(m) 배열 또는 null */
export function makeGrid({ x0, y0, cell, w, h, step = 0.45 }, fn) {
  const layers = [new Int16Array(w * h).fill(NONE), new Int16Array(w * h).fill(NONE)];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const hs = fn(x0 + i * cell, y0 + j * cell) ?? [];
      hs.slice(0, 2).forEach((z, k) => (layers[k][j * w + i] = Math.round(z * 100)));
    }
  }
  return { x0, y0, cell, w, h, step, layers };
}

export function cellOf(grid, x, z) {
  const i = Math.round((x - grid.x0) / grid.cell);
  const j = Math.round((-z - grid.y0) / grid.cell);
  return { i, j };
}

export function cellCenter(grid, i, j) {
  return { x: grid.x0 + i * grid.cell, z: -(grid.y0 + j * grid.cell) };
}

/** (i, j) 칸의 모든 층 높이(m) */
export function heightsAt(grid, i, j) {
  if (i < 0 || j < 0 || i >= grid.w || j >= grid.h) return [];
  const out = [];
  const n = j * grid.w + i;
  for (const L of grid.layers) if (L[n] !== NONE) out.push(L[n] / 100);
  return out;
}

/** 현재 높이 y에서 이어 설 수 있는 지면 높이. 없으면 null */
export function groundAt(grid, x, z, y, reach = grid.step) {
  const { i, j } = cellOf(grid, x, z);
  let best = null;
  for (const h of heightsAt(grid, i, j)) {
    const d = Math.abs(h - y);
    if (d <= reach && (best === null || d < Math.abs(best - y))) best = h;
  }
  return best;
}

/** 칸 단위 지면 높이를 주변 칸과 보간해 부드럽게(계단 턱이 튀지 않도록) */
export function smoothGround(grid, x, z, y) {
  const g = groundAt(grid, x, z, y);
  if (g === null) return null;
  const fx = (x - grid.x0) / grid.cell;
  const fy = (-z - grid.y0) / grid.cell;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  let sum = 0;
  let wsum = 0;
  for (const [di, dj] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const hs = heightsAt(grid, i0 + di, j0 + dj);
    let h = null;
    for (const c of hs) if (Math.abs(c - g) <= grid.step && (h === null || Math.abs(c - g) < Math.abs(h - g))) h = c;
    if (h === null) continue;
    const w = (1 - Math.abs(fx - (i0 + di))) * (1 - Math.abs(fy - (j0 + dj)));
    sum += h * w;
    wsum += w;
  }
  return wsum > 0 ? sum / wsum : g;
}

/**
 * 이동 한 걸음. 막히면 축별로 미끄러진다.
 * 반환 { x, z, y, moved }
 */
export function stepMove(grid, pos, dx, dz) {
  const tryAt = (x, z) => {
    const g = groundAt(grid, x, z, pos.y);
    return g === null ? null : { x, z, y: g };
  };
  // 긴 이동은 칸 크기보다 잘게 나눠 틈을 건너뛰지 않게 한다
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(len / (grid.cell * 0.5)));
  let cur = { ...pos };
  let moved = false;
  for (let s = 0; s < n; s++) {
    const sx = dx / n;
    const sz = dz / n;
    const next = tryAt(cur.x + sx, cur.z + sz) ?? (Math.abs(sx) > 1e-6 ? tryAt(cur.x + sx, cur.z) : null) ?? (Math.abs(sz) > 1e-6 ? tryAt(cur.x, cur.z + sz) : null);
    if (!next) break;
    cur = { ...cur, ...next };
    moved = true;
  }
  return { ...cur, moved };
}

/** 공중 발 높이 feetY 아래에서 받쳐 줄 지면(발보다 조금 높은 턱까지 허용, 너무 깊은 낭떠러지는 제외). 없으면 null */
export function supportAt(grid, x, z, feetY, { up = 0.12, down = 3 } = {}) {
  const { i, j } = cellOf(grid, x, z);
  let best = null;
  for (const h of heightsAt(grid, i, j)) {
    if (h <= feetY + up && h >= feetY - down && (best === null || h > best)) best = h;
  }
  return best;
}

/**
 * 점프 중 수평 이동: 발 높이보다 낮은(또는 거의 같은) 칸으로만 나아간다.
 * 반환 { x, z, support }
 */
export function airMove(grid, pos, feetY, dx, dz) {
  const tryAt = (x, z) => {
    const s = supportAt(grid, x, z, feetY);
    return s === null ? null : { x, z, support: s };
  };
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(len / (grid.cell * 0.5)));
  let cur = { x: pos.x, z: pos.z, support: supportAt(grid, pos.x, pos.z, feetY) };
  for (let s = 0; s < n; s++) {
    const sx = dx / n;
    const sz = dz / n;
    const next = tryAt(cur.x + sx, cur.z + sz) ?? (Math.abs(sx) > 1e-6 ? tryAt(cur.x + sx, cur.z) : null) ?? (Math.abs(sz) > 1e-6 ? tryAt(cur.x, cur.z + sz) : null);
    if (!next) break;
    cur = next;
  }
  return cur;
}

/** 점에서 가장 가까운 걸을 수 있는 지점(반경 칸 수 안) */
export function nearestWalkable(grid, x, z, y = null, radius = 40) {
  const c = cellOf(grid, x, z);
  let best = null;
  let bestD = Infinity;
  for (let r = 0; r <= radius; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = c.i + di;
        const j = c.j + dj;
        for (const h of heightsAt(grid, i, j)) {
          const p = cellCenter(grid, i, j);
          const d = Math.hypot(p.x - x, p.z - z) + (y === null ? 0 : Math.abs(h - y) * 2);
          if (d < bestD) {
            bestD = d;
            best = { x: p.x, z: p.z, y: h };
          }
        }
      }
    }
    if (best && r * grid.cell > bestD) break;
  }
  return best;
}

/**
 * 광선(origin, dir: three 좌표)이 처음 닿는 걸을 수 있는 지면.
 * 격자 높이면을 따라 걷는 레이 마칭이라 메시 광선 판정보다 훨씬 싸다.
 */
export function pickGround(grid, origin, dir, maxDist = 120) {
  const stepLen = grid.cell * 0.5;
  let prev = null;
  for (let t = 0; t < maxDist; t += stepLen) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    const { i, j } = cellOf(grid, x, z);
    for (const h of heightsAt(grid, i, j)) {
      const above = prev ? prev.y - h : 1;
      if (y - h <= 0.05 && above >= -0.05 && y - h > -0.6) return { x, z, y: h };
    }
    prev = { x, y, z };
  }
  return null;
}

/** from에서 걸어서 닿는 칸 표시(층별 Uint8Array). 장면을 불러올 때 한 번 계산한다 */
export function floodReachable(grid, from) {
  const marks = grid.layers.map(() => new Uint8Array(grid.w * grid.h));
  const s = cellOf(grid, from.x, from.z);
  const k0 = layerIndexNear(grid, s.i, s.j, from.y);
  if (k0 < 0) return marks;
  const queue = [[s.i, s.j, k0]];
  marks[k0][s.j * grid.w + s.i] = 1;
  while (queue.length) {
    const [i, j, k] = queue.pop();
    const y = grid.layers[k][j * grid.w + i] / 100;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      const nk = layerIndexNear(grid, ni, nj, y);
      if (nk < 0 || marks[nk][nj * grid.w + ni]) continue;
      marks[nk][nj * grid.w + ni] = 1;
      queue.push([ni, nj, nk]);
    }
  }
  return marks;
}

/** 닿는 칸 가운데 (x, z)에 가장 가까운 칸. 높이 차이는 약하게만 따진다 */
export function nearestReachable(grid, marks, x, z, y, radius = 60) {
  const c = cellOf(grid, x, z);
  let best = null;
  let bestD = Infinity;
  for (let r = 0; r <= radius; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = c.i + di;
        const j = c.j + dj;
        if (i < 0 || j < 0 || i >= grid.w || j >= grid.h) continue;
        const n = j * grid.w + i;
        grid.layers.forEach((L, k) => {
          if (!marks[k][n]) return;
          const h = L[n] / 100;
          const p = cellCenter(grid, i, j);
          const d = Math.hypot(p.x - x, p.z - z) + Math.abs(h - y) * 0.5;
          if (d < bestD) {
            bestD = d;
            best = { x: p.x, z: p.z, y: h };
          }
        });
      }
    }
    if (best && r * grid.cell > bestD) break;
  }
  return best;
}

// ------------------------------------------------------------------ 경로 찾기(A*)

function nodeKey(grid, i, j, k) {
  return (j * grid.w + i) * 4 + k;
}

function layerIndexNear(grid, i, j, y) {
  if (i < 0 || j < 0 || i >= grid.w || j >= grid.h) return -1;
  const n = j * grid.w + i;
  let best = -1;
  let bestD = Infinity;
  grid.layers.forEach((L, k) => {
    if (L[n] === NONE) return;
    const d = Math.abs(L[n] / 100 - y);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  });
  return bestD <= grid.step ? best : -1;
}

class Heap {
  constructor() {
    this.a = [];
  }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

/**
 * from/to: three 좌표 {x, y, z}. 반환: 경유점 배열(three 좌표) 또는 null.
 * 8방향, 대각선은 양옆 칸이 모두 걸을 수 있을 때만(모서리 뚫기 방지).
 */
export function findPath(grid, from, to, maxNodes = 60000) {
  const s = cellOf(grid, from.x, from.z);
  const t = cellOf(grid, to.x, to.z);
  const sk = layerIndexNear(grid, s.i, s.j, from.y);
  const tk = layerIndexNear(grid, t.i, t.j, to.y ?? from.y) >= 0 ? layerIndexNear(grid, t.i, t.j, to.y ?? from.y) : heightsAt(grid, t.i, t.j).length ? 0 : -1;
  if (sk < 0 || tk < 0) return null;
  const hOf = (i, j, k) => grid.layers[k][j * grid.w + i] / 100;
  const goal = nodeKey(grid, t.i, t.j, tk);
  const g = new Map();
  const came = new Map();
  const open = new Heap();
  const start = nodeKey(grid, s.i, s.j, sk);
  g.set(start, 0);
  open.push({ f: 0, i: s.i, j: s.j, k: sk, key: start });
  const heur = (i, j) => Math.hypot(i - t.i, j - t.j);
  let visited = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur.key === goal) break;
    if (++visited > maxNodes) return null;
    const gc = g.get(cur.key);
    if (cur.f - heur(cur.i, cur.j) > gc + 1e-6) continue;
    const y = hOf(cur.i, cur.j, cur.k);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = cur.i + di;
        const nj = cur.j + dj;
        const nk = layerIndexNear(grid, ni, nj, y);
        if (nk < 0) continue;
        if (di && dj && (layerIndexNear(grid, cur.i + di, cur.j, y) < 0 || layerIndexNear(grid, cur.i, cur.j + dj, y) < 0)) continue;
        const key = nodeKey(grid, ni, nj, nk);
        const cost = gc + (di && dj ? Math.SQRT2 : 1) + Math.abs(hOf(ni, nj, nk) - y) * 2;
        if (cost < (g.get(key) ?? Infinity)) {
          g.set(key, cost);
          came.set(key, cur.key);
          open.push({ f: cost + heur(ni, nj), i: ni, j: nj, k: nk, key });
        }
      }
    }
  }
  if (!came.has(goal) && goal !== start) return null;
  const cells = [];
  for (let k = goal; k !== undefined; k = came.get(k)) {
    const n = Math.floor(k / 4);
    const layer = k % 4;
    const i = n % grid.w;
    const j = Math.floor(n / grid.w);
    cells.push({ ...cellCenter(grid, i, j), y: hOf(i, j, layer) });
    if (k === start) break;
  }
  cells.reverse();
  return simplifyPath(grid, cells);
}

/** 직선으로 걸어도 되는 구간은 경유점을 생략한다 */
export function simplifyPath(grid, pts) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let anchor = pts[0];
  for (let n = 2; n < pts.length; n++) {
    if (!lineWalkable(grid, anchor, pts[n])) {
      anchor = pts[n - 1];
      out.push(anchor);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function lineWalkable(grid, a, b) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / (grid.cell * 0.5)));
  let y = a.y;
  for (let s = 1; s <= n; s++) {
    const t = s / n;
    const g = groundAt(grid, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, y);
    if (g === null) return false;
    y = g;
  }
  return true;
}
