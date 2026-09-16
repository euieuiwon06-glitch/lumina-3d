// 두 번째 이야기 공간 요소: 낯선 빛, 숨은 꽃, 결정 속 흔적, 작은 해파리, 빛길, 항해 나무의 빛 가지, 답장에 응답하는 먼 빛.
// 새 지역·대형 모델 없이 기존 조형(꽃잎·빛 스프라이트·막)과 부드러운 발광으로 표현한다.
import * as THREE from 'three';

import { glowTexture } from './props.js';

const glowSprite = (color, opacity = 1) =>
  new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));

function petalGeo(width, height, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(width * 0.9, height * 0.15, width * 0.85, height * 0.7, 0, height);
  shape.bezierCurveTo(-width * 0.85, height * 0.7, -width * 0.9, height * 0.15, 0, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 16 });
  g.translate(0, 0, -depth / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) - pos.getX(i) ** 2 * 0.35);
  g.computeVertexNormals();
  return g;
}

/** 누군가 남긴 낯선 빛: 가져온 빛과 다른 은빛·하늘빛 작은 빛이 잠깐 나타나 안쪽으로 흔적을 남긴다 */
export class StrangeLight {
  constructor() {
    this.object = new THREE.Group();
    this.core = glowSprite('#DDEBFF');
    this.halo = glowSprite('#B6C8FF', 0.5);
    this.core.scale.setScalar(0.9);
    this.halo.scale.setScalar(2.4);
    this.object.add(this.halo, this.core);
    this.trail = Array.from({ length: 14 }, () => {
      const s = glowSprite('#C9D8FF', 0);
      s.scale.setScalar(0.35);
      this.object.add(s);
      return s;
    });
    this.path = null;
    this.t = 0;
    this.life = 0;
    this.object.visible = false;
  }
  /** from→to(월드)로 잠깐 떠올랐다가 흔적을 남기고 사라진다 */
  play(from, to, duration = 6) {
    this.object.visible = true;
    this.object.position.set(0, 0, 0);
    this.from = from.clone().add(new THREE.Vector3(0, 1.4, 0));
    this.to = to.clone().add(new THREE.Vector3(0, 0.6, 0));
    this.t = 0;
    this.life = duration;
  }
  update(dt, t) {
    if (!this.object.visible) return;
    this.t += dt;
    const k = Math.min(1, this.t / this.life);
    const move = THREE.MathUtils.smoothstep(k, 0.25, 0.85);
    const p = this.from.clone().lerp(this.to, move);
    p.y += Math.sin(t * 2.2) * 0.12 + Math.sin(move * Math.PI) * 0.8;
    this.core.position.copy(p);
    this.halo.position.copy(p);
    const fade = Math.min(1, this.t / 0.6) * (1 - THREE.MathUtils.smoothstep(k, 0.85, 1));
    this.core.material.opacity = fade;
    this.halo.material.opacity = fade * (0.35 + Math.sin(t * 3) * 0.1);
    this.trail.forEach((s, i) => {
      const u = i / (this.trail.length - 1);
      const q = this.from.clone().lerp(this.to, u);
      q.y += Math.sin(u * Math.PI) * 0.8 - 0.5;
      s.position.copy(q);
      s.material.opacity = move > u ? 0.55 * fade + 0.25 * (1 - k) : 0;
    });
    if (k >= 1) this.object.visible = false;
  }
}

/**
 * 눈부셔서 숨은 꽃: 강한 빛에는 몸을 오므리고(shrink), 조금 은은하면 반쯤(half), 편안하면 활짝(open).
 * 열린 뒤에는 꽃 속 흔적과 주변 풀빛이 은은하게 남는다
 */
export class HiddenFlower {
  constructor() {
    this.object = new THREE.Group();
    this.petals = [];
    const geo = petalGeo(0.55, 1.25, 0.1);
    const tones = ['#FFD9C2', '#FFE9D6', '#F9C9B6'];
    for (let i = 0; i < 7; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 7) * Math.PI * 2;
      const p = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: tones[i % 3], roughness: 0.55, emissive: '#FFB98A', emissiveIntensity: 0.08 }));
      p.position.z = 0.1;
      pivot.add(p);
      pivot.position.y = 0.35;
      this.object.add(pivot);
      this.petals.push(p);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.5, 10), new THREE.MeshStandardMaterial({ color: '#9FD7B0', roughness: 0.6 }));
    stem.position.y = 0.2;
    this.object.add(stem);
    this.trace = glowSprite('#DDEBFF', 0);
    this.trace.position.y = 0.95;
    this.trace.scale.setScalar(0.7);
    this.warm = glowSprite('#FFD9A8', 0.2);
    this.warm.position.y = 0.2;
    this.warm.scale.setScalar(3.2);
    this.object.add(this.trace, this.warm);
    this.openness = 0.1;
    this.target = 0.1;
    this.state = 'closed';
    this.flinch = 0;
  }
  react(result) {
    this.state = result;
    if (result === 'shrink') {
      this.target = -0.15;
      this.flinch = 1;
    } else if (result === 'half') this.target = 0.45;
    else if (result === 'open') this.target = 1;
  }
  setOpen(open) {
    if (open) {
      this.state = 'open';
      this.target = this.openness = 1;
    }
  }
  update(dt, t) {
    this.openness += (this.target - this.openness) * Math.min(1, dt * 2.2);
    this.flinch = Math.max(0, this.flinch - dt * 1.4);
    // 움츠러들었다가 천천히 원래(닫힘)로 돌아온다
    if (this.state === 'shrink' && this.flinch <= 0) this.target = 0.1;
    const o = this.openness;
    this.petals.forEach((p, i) => (p.rotation.x = -0.15 - o * 1.05 + Math.sin(t * 1.6 + i) * 0.02));
    const s = 1 - this.flinch * 0.12;
    this.object.scale.set(s, s * (1 - this.flinch * 0.06), s);
    const openK = THREE.MathUtils.smoothstep(o, 0.6, 1);
    this.trace.material.opacity = openK * (0.7 + Math.sin(t * 2.4) * 0.2);
    this.warm.material.opacity = 0.15 + openK * 0.3;
  }
}

function glyphTexture(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineCap = 'round';
  g.lineWidth = 7;
  // 작은 해파리의 헤엄 자국 같은 문양: 둥근 갓 + 물결 세 줄
  g.beginPath();
  g.arc(0, -18, 46, Math.PI, 0);
  g.stroke();
  for (let i = -1; i <= 1; i++) {
    g.beginPath();
    for (let y = 0; y <= 90; y += 6) {
      const x = i * 26 + Math.sin(y * 0.09 + seed + i) * 8;
      if (y === 0) g.moveTo(x, -18 + y);
      else g.lineTo(x, -18 + y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 결정 속 흔적: 평소엔 거의 안 보이고, 차가운 빛을 비추면 문양·입자가 드러나 다음 흔적 쪽으로 빛줄이 이어진다 */
export class IceGlyph {
  constructor(index) {
    this.object = new THREE.Group();
    this.plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.3),
      new THREE.MeshBasicMaterial({ map: glyphTexture(index * 1.7), color: '#A8F0FF', transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.plate.position.y = 1.2;
    this.crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42, 0),
      new THREE.MeshStandardMaterial({ color: '#D9F5FF', roughness: 0.2, metalness: 0, transparent: true, opacity: 0.75, emissive: '#9FE8FF', emissiveIntensity: 0.15 }),
    );
    this.crystal.scale.set(0.8, 1.6, 0.8);
    this.crystal.position.y = 0.6;
    this.motes = Array.from({ length: 10 }, (_, i) => {
      const s = glowSprite('#BDF6FF', 0);
      s.scale.setScalar(0.18);
      s.userData = { a: (i / 10) * Math.PI * 2, r: 0.35 + (i % 3) * 0.12, v: 0.4 + (i % 4) * 0.12 };
      this.object.add(s);
      return s;
    });
    this.object.add(this.crystal, this.plate);
    this.revealed = 0;
    this.target = 0;
    this.faint = 0;
    this.link = null;
  }
  /** 다음 흔적까지 이어지는 빛줄(월드 좌표) */
  linkTo(from, to) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const p = from.clone().lerp(to, i / 12);
      p.y += 0.25 + Math.sin((i / 12) * Math.PI) * 0.5;
      pts.push(p);
    }
    this.link = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#BDF6FF', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, toneMapped: false }));
    return this.link;
  }
  setRevealed(on) {
    this.target = on ? 1 : 0;
    if (on) this.revealed = Math.max(this.revealed, 0.6);
  }
  /** 따뜻한 빛: 문양이 흐릿하게 떴다 사라진다 */
  faintFlash() {
    this.faint = 1;
  }
  update(dt, t, hinted = false, cameraPos = null) {
    this.revealed += (this.target - this.revealed) * Math.min(1, dt * 2);
    this.faint = Math.max(0, this.faint - dt * 0.8);
    const r = this.revealed;
    const hintK = hinted && r < 0.1 ? 0.12 + Math.max(0, Math.sin(t * 2.4)) * 0.1 : 0;
    this.plate.material.opacity = Math.max(0.05, r * (0.75 + Math.sin(t * 1.8) * 0.12), this.faint * 0.28, hintK);
    // 문양은 늘 보는 쪽을 향한다(세로축만 돌림)
    if (cameraPos) {
      const wp = this.object.getWorldPosition(new THREE.Vector3());
      this.plate.rotation.y = Math.atan2(cameraPos.x - wp.x, cameraPos.z - wp.z);
    }
    this.crystal.material.emissiveIntensity = 0.15 + r * 0.9 + this.faint * 0.3;
    this.motes.forEach((s) => {
      const u = s.userData;
      const k = (t * u.v + u.a) % 1;
      s.position.set(Math.cos(u.a + t * 0.6) * u.r, 0.3 + k * 1.6, Math.sin(u.a + t * 0.6) * u.r);
      s.material.opacity = Math.sin(k * Math.PI) * r * 0.8;
    });
    if (this.link) this.link.material.opacity = r * (0.55 + Math.sin(t * 2) * 0.15);
  }
}

/** 작은 해파리: 반투명 라일락 갓과 짧은 촉수. 정한 지점으로만 천천히 헤엄치고, 눈부시면 움츠린다 */
export class LittleJelly {
  constructor() {
    this.object = new THREE.Group();
    const bell = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: '#E6D6FF', roughness: 0.3, transparent: true, opacity: 0.7, emissive: '#C9B2F2', emissiveIntensity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    );
    bell.position.y = 0.2;
    this.bell = bell;
    this.core = glowSprite('#FFE4F2', 0.8);
    this.core.scale.setScalar(0.9);
    this.core.position.y = 0.35;
    this.tentacles = Array.from({ length: 6 }, (_, i) => {
      const pts = Array.from({ length: 8 }, (_, k) => new THREE.Vector3(0, -k * 0.12, 0));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#D9C8FF', transparent: true, opacity: 0.8, toneMapped: false }));
      const a = (i / 6) * Math.PI * 2;
      line.position.set(Math.cos(a) * 0.32, 0.18, Math.sin(a) * 0.32);
      line.userData = { a, pts };
      this.object.add(line);
      return line;
    });
    this.object.add(bell, this.core);
    this.goal = null;
    this.speed = 1.6;
    this.shy = 0;
    this.baseY = 0;
    this.moving = false;
  }
  placeAt(p) {
    this.object.position.copy(p);
    this.baseY = p.y;
    this.goal = null;
  }
  swimTo(p) {
    this.goal = p.clone();
    this.moving = true;
  }
  flinch() {
    this.shy = 1;
  }
  update(dt, t) {
    this.shy = Math.max(0, this.shy - dt * 0.9);
    if (this.goal) {
      const d = this.goal.clone().sub(this.object.position);
      const len = d.length();
      if (len < 0.05) {
        this.goal = null;
        this.moving = false;
      } else {
        this.object.position.addScaledVector(d.normalize(), Math.min(len, this.speed * dt));
        this.baseY = this.object.position.y;
      }
    }
    // 수축하며 헤엄치는 느낌
    const pulse = Math.sin(t * (this.moving ? 3.2 : 1.6)) * 0.5 + 0.5;
    const shrink = this.shy * 0.25;
    this.bell.scale.set(1 - pulse * 0.08 - shrink, 1 + pulse * 0.06 - shrink, 1 - pulse * 0.08 - shrink);
    this.object.position.y = this.baseY + 1.3 + Math.sin(t * 1.3) * 0.12 - this.shy * 0.3;
    this.object.rotation.z = Math.sin(t * 0.9) * 0.08 + this.shy * 0.3 * Math.sin(t * 20);
    this.core.material.opacity = 0.55 + pulse * 0.25 - this.shy * 0.3;
    for (const line of this.tentacles) {
      const { a, pts } = line.userData;
      pts.forEach((p, k) => {
        p.x = Math.sin(t * 2 - k * 0.6 + a) * 0.04 * k;
        p.z = Math.cos(t * 1.7 - k * 0.5 + a) * 0.03 * k;
        p.y = -k * (0.12 - pulse * 0.02);
      });
      line.geometry.setFromPoints(pts);
    }
  }
}

/** 빛길: 두 지점 사이에 잠시 남는 빛 알갱이 줄. 잔상 빛이면 오래, 아니면 짧게 남았다가 은은하게 유지 */
export class GlowPath {
  constructor(from, to, color = '#FFE4D2', count = 12) {
    this.object = new THREE.Group();
    this.sprites = Array.from({ length: count }, (_, i) => {
      const u = i / (count - 1);
      const s = glowSprite(color, 0);
      s.position.copy(from.clone().lerp(to, u)).add(new THREE.Vector3(0, 0.35 + Math.sin(u * Math.PI) * 0.25, 0));
      s.scale.setScalar(0.45);
      s.userData.u = u;
      this.object.add(s);
      return s;
    });
    this.lit = 0;
    this.target = 0;
    this.afterglow = false;
  }
  light(on, afterglow = false) {
    this.target = on ? 1 : 0;
    this.afterglow = afterglow;
    if (on && afterglow) this.flash = 1;
  }
  update(dt, t) {
    this.lit += (this.target - this.lit) * Math.min(1, dt * 1.5);
    this.flash = Math.max(0, (this.flash ?? 0) - dt * 0.25);
    for (const s of this.sprites) {
      const wave = 0.55 + Math.max(0, Math.sin(s.userData.u * 6 - t * 2.4)) * 0.45;
      s.material.opacity = this.lit * wave * (this.afterglow ? 0.85 : 0.6) + (this.flash ?? 0) * 0.3;
      s.scale.setScalar(0.35 + wave * 0.18);
    }
  }
}

/** 항해 나무의 빛 가지: 단서 하나마다 나무 위로 빛 가지가 하나씩 돋는다 */
export class OrganBranches {
  constructor(tree) {
    this.object = new THREE.Group();
    this.object.position.copy(tree);
    this.branches = [
      { color: '#FFD9A8', dir: new THREE.Vector3(-1.4, 2.6, 0.4) },
      { color: '#9FF3DE', dir: new THREE.Vector3(1.4, 2.6, 0.4) },
      { color: '#E6D6FF', dir: new THREE.Vector3(0, 3.8, -0.2) },
    ].map((b) => {
      const sprites = Array.from({ length: 8 }, (_, i) => {
        const s = glowSprite(b.color, 0);
        const u = (i + 1) / 8;
        s.position.set(b.dir.x * u + Math.sin(u * 3) * 0.2, 3 + b.dir.y * u, b.dir.z * u);
        s.scale.setScalar(0.5 - u * 0.2);
        this.object.add(s);
        return s;
      });
      return { ...b, sprites, lit: 0, target: 0 };
    });
  }
  /** count: 단서 수, woven: 두 흔적을 엮음(가운데 가지) */
  set(count, woven) {
    this.branches[0].target = count >= 1 ? 1 : 0;
    this.branches[1].target = count >= 2 ? 1 : 0;
    this.branches[2].target = woven ? 1 : 0;
  }
  update(dt, t) {
    for (const b of this.branches) {
      b.lit += (b.target - b.lit) * Math.min(1, dt * 1.2);
      b.sprites.forEach((s, i) => (s.material.opacity = b.lit * (0.45 + Math.sin(t * 2 + i * 0.7) * 0.2)));
    }
  }
}

/** 먼 곳의 작은 빛들: 답장에 응답해 차례로 반짝인다 */
export class DistantReplies {
  constructor(center, radius = 40, count = 14) {
    this.object = new THREE.Group();
    this.stars = Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 1.6 - Math.PI * 0.8;
      const s = glowSprite(i % 3 === 0 ? '#9FF3DE' : i % 3 === 1 ? '#FFD9A8' : '#E6D6FF', 0);
      s.position.set(center.x + Math.sin(a) * radius, center.y + 10 + (i % 4) * 3, center.z - Math.cos(a) * radius);
      s.scale.setScalar(1.6);
      s.userData.delay = 0.3 + i * 0.22;
      this.object.add(s);
      return s;
    });
    this.t = -1;
  }
  play() {
    this.t = 0;
  }
  /** 이미 응답한 상태로 은은하게 */
  settle() {
    this.t = 99;
  }
  update(dt, t) {
    if (this.t < 0) return;
    this.t += dt;
    for (const s of this.stars) {
      const k = THREE.MathUtils.clamp((this.t - s.userData.delay) / 1.2, 0, 1);
      s.material.opacity = k * (0.35 + Math.max(0, Math.sin(t * 2.2 + s.userData.delay * 5)) * 0.35);
    }
  }
}
