// 길 안내 3D 표시: 목표 위 떠 있는 표식(벽 너머로도 보임)과 바닥을 따라 흐르는 빛 길
import * as THREE from 'three';

import { glowTexture } from './props.js';

function markerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  const halo = g.createRadialGradient(0, 0, 0, 0, 0, 62);
  halo.addColorStop(0, 'rgba(255,208,169,0.55)');
  halo.addColorStop(1, 'rgba(255,208,169,0)');
  g.fillStyle = halo;
  g.fillRect(-64, -64, 128, 128);
  // 아래를 가리키는 둥근 물방울 핀
  g.beginPath();
  g.moveTo(0, 40);
  g.bezierCurveTo(-8, 24, -30, 6, -30, -12);
  g.arc(0, -12, 30, Math.PI, 0);
  g.bezierCurveTo(30, 6, 8, 24, 0, 40);
  g.fillStyle = '#FFD0A9';
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#FFF4DC';
  g.stroke();
  g.beginPath();
  g.arc(0, -12, 11, 0, Math.PI * 2);
  g.fillStyle = '#FFF4DC';
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ObjectiveMarker {
  constructor() {
    this.object = new THREE.Group();
    // 화면 크기가 거리와 상관없이 일정한 핀(깊이 무시 → 벽 너머로도 보인다)
    this.pin = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(), transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false }));
    this.pin.scale.set(0.055, 0.055, 1);
    this.pin.center.set(0.5, 0.15);
    this.pin.renderOrder = 999;
    // 바닥에서 핀까지 이어지는 가는 빛줄기
    const beamGeo = new THREE.CylinderGeometry(0.05, 0.12, 1, 10, 1, true);
    beamGeo.translate(0, 0.5, 0);
    this.beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({ color: '#FFD0A9', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.ground = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#FFD0A9', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.ground.scale.setScalar(1.4);
    // 화면 표시(이름·거리·화살표)가 빛줄기 끝에 붙으므로 3D 핀은 쓰지 않는다
    this.pin.visible = false;
    this.object.add(this.beam, this.pin, this.ground);
    this.object.visible = false;
    this.height = 2.4;
  }
  set(pos, height = 2.4) {
    this.object.visible = !!pos;
    if (!pos) return;
    this.object.position.copy(pos);
    this.height = height;
  }
  update(t, playerPos, cameraPos) {
    if (!this.object.visible) return;
    // 카메라 바로 앞의 빛줄기는 화면을 세로로 가르므로 옅게
    const camK = cameraPos ? THREE.MathUtils.smoothstep(Math.hypot(cameraPos.x - this.object.position.x, cameraPos.z - this.object.position.z), 3, 8) : 1;
    const bob = Math.sin(t * 2.6) * 0.12;
    const h = this.height + 0.5 + bob;
    this.pin.position.y = h;
    this.beam.scale.set(1, h, 1);
    this.ground.position.y = 0.15;
    const near = playerPos ? this.object.position.distanceTo(playerPos) : 99;
    // 바로 앞까지 오면 가려지지 않게 옅게
    const k = THREE.MathUtils.smoothstep(near, 1.2, 4);
    this.pin.material.opacity = 0.35 + 0.65 * k;
    this.beam.material.opacity = 0.45 * k * camK;
    this.ground.material.opacity = 0.5 + Math.sin(t * 3) * 0.2;
  }
}

/** 경로를 따라 흐르는 빛 점 */
export class PathTrail {
  constructor(max = 140) {
    this.max = max;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(
      this.geo,
      new THREE.PointsMaterial({ size: 0.32, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.points.frustumCulled = false;
    this.samples = [];
    this.object = this.points;
  }
  /** route: three Vector3 경유점 배열(플레이어 → 목표) */
  setRoute(route) {
    this.samples = [];
    if (!route || route.length < 2) return;
    const spacing = 0.9;
    let carry = 0.6;
    for (let i = 1; i < route.length && this.samples.length < this.max; i++) {
      const a = route[i - 1];
      const b = route[i];
      const len = a.distanceTo(b);
      let d = carry;
      while (d < len && this.samples.length < this.max) {
        this.samples.push({ p: a.clone().lerp(b, d / len), s: this.samples.length });
        d += spacing;
      }
      carry = d - len;
    }
  }
  update(t) {
    const n = this.samples.length;
    const base = new THREE.Color('#FFD0A9');
    const tip = new THREE.Color('#FFF4DC');
    for (let i = 0; i < n; i++) {
      const { p } = this.samples[i];
      this.pos.set([p.x, p.y + 0.12, p.z], i * 3);
      // 플레이어 쪽에서 목표 쪽으로 흘러가는 물결
      const wave = 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin((i * 0.55 - t * 4.2) % (Math.PI * 2))), 3);
      const fadeIn = Math.min(1, i / 3);
      const c = base.clone().lerp(tip, wave * 0.6).multiplyScalar(wave * fadeIn);
      this.col.set([c.r, c.g, c.b], i * 3);
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.points.visible = n > 0;
  }
}
