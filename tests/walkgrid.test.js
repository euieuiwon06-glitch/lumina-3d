import assert from 'node:assert/strict';
import { test } from 'node:test';

import { airMove, decodeGrid, findPath, supportAt, groundAt, lineWalkable, makeGrid, nearestWalkable, pickGround, stepMove } from '../src/engine/walkgrid.js';

// 블렌더 XY 0~10m 바닥, x 4~6 사이에 벽(y 0~8, 위쪽 8~10에 통로), 오른쪽 절반 0.3m 단상
const spec = { x0: 0, y0: 0, cell: 0.25, w: 41, h: 41 };
const grid = makeGrid(spec, (bx, by) => {
  if (bx >= 4 && bx <= 6 && by <= 8) return null;
  return [bx > 6 ? 0.3 : 0];
});

test('three 좌표(z = -블렌더 y)로 지면을 찾는다', () => {
  assert.equal(groundAt(grid, 1, -1, 0), 0);
  assert.equal(groundAt(grid, 7, -1, 0), 0.3);
  assert.equal(groundAt(grid, 5, -4, 0), null); // 벽
  assert.equal(groundAt(grid, 1, -1, 3), null); // 너무 높은 곳에서는 닿지 않음
});

test('벽으로 걸어가면 막히고, 비스듬히 밀면 벽을 따라 미끄러진다', () => {
  const pos = { x: 3.5, y: 0, z: -2 };
  const blocked = stepMove(grid, pos, 1.5, 0);
  assert.ok(blocked.x < 4);
  const slide = stepMove(grid, pos, 1.5, -1);
  assert.ok(slide.x < 4);
  assert.ok(slide.z < -2.5);
});

test('경로 찾기는 벽을 돌아 위쪽 통로로 간다', () => {
  const path = findPath(grid, { x: 2, y: 0, z: -2 }, { x: 8, y: 0.3, z: -2 });
  assert.ok(path && path.length >= 3);
  assert.ok(path.some((p) => -p.z > 8), '통로(블렌더 y>8)를 지나야 함');
  for (let i = 1; i < path.length; i++) {
    assert.ok(lineWalkable(grid, path[i - 1], path[i]), `구간 ${i}이 벽을 가로지름`);
  }
});

test('광선 판정: 위에서 내려다본 클릭이 바닥 높이를 돌려준다', () => {
  const hit = pickGround(grid, { x: 7, y: 10, z: 0 }, normalize({ x: 0, y: -1, z: -0.3 }));
  assert.ok(hit);
  assert.equal(hit.y, 0.3);
  const miss = nearestWalkable(grid, 5, -4, 0);
  assert.ok(miss && (miss.x < 4 || miss.x > 6));
});

test('격자 JSON(base64 Int16) 디코딩', () => {
  const arr = new Int16Array([12, -32768, 250, 0]);
  const b64 = Buffer.from(arr.buffer).toString('base64');
  const g = decodeGrid({ x0: 0, y0: 0, cell: 1, w: 2, h: 2, layers: [b64] });
  assert.equal(groundAt(g, 0, 0, 0), 0.12);
  assert.equal(groundAt(g, 1, 0, 0), null);
  assert.equal(groundAt(g, 0, -1, 2.4), 2.5);
});

test('점프: 걸어서는 못 오르는 0.6m 턱도 공중에서는 올라선다', () => {
  const ledge = makeGrid({ x0: 0, y0: 0, cell: 0.25, w: 41, h: 9 }, (bx) => [bx > 5 ? 0.6 : 0]);
  const pos = { x: 4.5, y: 0, z: -1 };
  assert.ok(stepMove(ledge, pos, 1.5, 0).x < 5.2, '걸어서는 막힘');
  assert.ok(airMove(ledge, pos, 0.3, 1.5, 0).x < 5.2, '낮게 뜨면 여전히 막힘');
  const up = airMove(ledge, pos, 0.7, 1.5, 0);
  assert.ok(up.x > 5.8);
  assert.equal(up.support, 0.6);
  assert.equal(supportAt(ledge, 7, -1, 2), 0.6);
});

function normalize(v) {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
