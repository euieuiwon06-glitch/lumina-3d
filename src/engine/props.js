// 게임이 공간에 더하는 요소: 설치한 빛(승인 빛 조각 이미지 빌보드), 바닥 고리 표시, 노래하는 결정, 반짝임
import * as THREE from 'three';

import { COLORS, byId } from '../game/catalog.js';
import { BASE } from './world.js';

const imgCache = new Map();
function loadImage(url) {
  if (!imgCache.has(url)) {
    imgCache.set(
      url,
      new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error(url));
        img.src = url;
      }),
    );
  }
  return imgCache.get(url);
}

export const LIGHT_FORMS = ['orb', 'flower', 'shard', 'thread', 'mist', 'crystal'];
export async function preloadLightImages() {
  await Promise.all(LIGHT_FORMS.map((f) => loadImage(`${BASE}lights/${f}.png`)));
}

const tintCache = new Map();
/** 빛 조각 이미지에 선택한 색을 입힌다(명도는 원본 유지) — 2.5D 데모와 같은 방식 */
async function tintedTexture(form, hex) {
  const key = `${form}|${hex}`;
  if (tintCache.has(key)) return tintCache.get(key);
  const img = await loadImage(`${BASE}lights/${form}.png`);
  const max = 256;
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * s);
  const h = Math.round(img.height * s);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  g.globalCompositeOperation = 'color';
  g.fillStyle = hex;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(img, 0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 0.32;
  g.drawImage(img, 0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const out = { tex, aspect: w / h };
  tintCache.set(key, out);
  return out;
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

let starTex = null;
/** 주민 머리 위 부탁 표시: 작은 네 갈래 별 */
export function starTexture() {
  if (starTex) return starTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, 60);
  glow.addColorStop(0, 'rgba(255,255,255,0.55)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(-64, -64, 128, 128);
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 11 : 46;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#fff';
  g.fill();
  starTex = new THREE.CanvasTexture(c);
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}

let ringTex = null;
function ringTexture() {
  if (ringTex) return ringTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.72, 'rgba(255,255,255,0.0)');
  grad.addColorStop(0.84, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.9, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const inner = g.createRadialGradient(128, 128, 0, 128, 128, 110);
  inner.addColorStop(0, 'rgba(255,255,255,0.28)');
  inner.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = inner;
  g.fillRect(0, 0, 256, 256);
  ringTex = new THREE.CanvasTexture(c);
  return ringTex;
}

/** 움직임 → 크기·회전·밝기 변화 */
export function motionSample(motion, t, phase = 0) {
  const x = t + phase;
  switch (motion) {
    case 'pulse':
      return { lift: 0, scale: 1 + Math.sin(x * 3.2) * 0.1, glow: 0.8 + Math.sin(x * 3.2) * 0.25, rot: 0 };
    case 'slowpulse':
      return { lift: 0, scale: 1 + Math.sin(x * 1.3) * 0.12, glow: 0.75 + Math.sin(x * 1.3) * 0.3, rot: 0 };
    case 'spin':
      return { lift: 0, scale: 1, glow: 0.95, rot: x * 1.6 };
    case 'twinkle': {
      const k = Math.pow(Math.max(0, Math.sin(x * 5.5)), 6);
      return { lift: 0, scale: 1 + k * 0.08, glow: 0.55 + k * 0.7, rot: 0 };
    }
    default:
      return { lift: Math.sin(x * 1.6) * 0.12, scale: 1, glow: 0.9, rot: Math.sin(x * 0.8) * 0.12 };
  }
}

export class LightProp {
  constructor(light, { preview = false } = {}) {
    this.object = new THREE.Group();
    this.preview = preview;
    this.phase = Math.random() * 10;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.pool = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.03;
    this.point = new THREE.PointLight(0xffffff, 0, 7, 2);
    this.point.position.y = 1.0;
    // 미리보기는 광원을 더하지 않는다(광원 수가 바뀌면 셰이더가 다시 컴파일돼 끊김)
    this.object.add(this.pool, this.glow, this.sprite);
    if (!preview) this.object.add(this.point);
    this.set(light);
  }

  async set(light) {
    this.light = { ...light };
    const hex = byId(COLORS, light.color)?.hex ?? '#FFF4DC';
    this.color = new THREE.Color(hex);
    this.glow.material.color.copy(this.color);
    this.pool.material.color.copy(this.color);
    this.point.color.copy(this.color);
    const { tex, aspect } = await tintedTexture(light.form, hex);
    if (this.light.form !== light.form || this.light.color !== light.color) return;
    this.sprite.material.map = tex;
    this.sprite.material.needsUpdate = true;
    this.aspect = aspect;
  }

  update(t) {
    const L = this.light;
    const m = motionSample(L.motion, t, this.phase);
    const b = L.brightness / 100;
    const size = 0.62 * m.scale;
    this.sprite.scale.set(size * (this.aspect ?? 1), size, 1);
    this.sprite.position.y = 1.0 + m.lift;
    this.sprite.material.rotation = m.rot;
    this.sprite.material.opacity = (this.preview ? 0.6 : 1) * (0.75 + b * 0.25);
    const g = m.glow * (0.35 + b * 0.8);
    this.glow.position.y = this.sprite.position.y;
    this.glow.scale.setScalar(1.1 + g * 0.9);
    this.glow.material.opacity = Math.min(1, g * 0.55) * (this.preview ? 0.6 : 1);
    this.pool.material.opacity = Math.min(1, g * 0.35) * (this.preview ? 0.6 : 1);
    this.point.intensity = this.preview ? 0 : g * 3.2;
  }

  dispose() {
    this.object.removeFromParent();
    for (const o of [this.sprite, this.glow, this.pool]) {
      o.material.dispose();
      o.geometry?.dispose?.();
    }
  }
}

/** 바닥에 누운 빛 고리: 설치 지점·출구·발견물·퍼즐 표시 */
export class GroundRing {
  constructor({ color = '#FFD0A9', radius = 0.9, pulse = true } = {}) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      new THREE.MeshBasicMaterial({
        map: ringTexture(),
        color: new THREE.Color(color),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 2;
    this.pulse = pulse;
    this.strength = 1;
    this.phase = Math.random() * 6;
  }
  setColor(hex) {
    this.mesh.material.color.set(hex);
  }
  update(t) {
    const k = this.pulse ? 0.75 + Math.sin(t * 3 + this.phase) * 0.25 : 1;
    this.mesh.material.opacity = k * this.strength;
    this.mesh.scale.setScalar(1 + (this.pulse ? Math.sin(t * 3 + this.phase) * 0.04 : 0));
  }
}

/** 빛 기둥: 출구·목적지를 멀리서도 알아보게 */
export class Beacon {
  constructor(color = '#FFF4DC', height = 3.2) {
    const geo = new THREE.CylinderGeometry(0.35, 0.6, height, 24, 1, true);
    geo.translate(0, height / 2, 0);
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,0.6)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(c);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        map: tex,
        color: new THREE.Color(color),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.mesh.renderOrder = 3;
  }
  update(t, cameraPos) {
    // 카메라가 기둥 가까이 오면 사라진다(화면을 하얗게 덮지 않도록)
    const d = cameraPos ? Math.hypot(cameraPos.x - this.mesh.position.x, cameraPos.z - this.mesh.position.z) : 99;
    const near = THREE.MathUtils.smoothstep(d, 4, 10);
    this.mesh.material.opacity = (0.4 + Math.sin(t * 2) * 0.1) * near;
    this.mesh.visible = near > 0.01;
  }
}

/** 얼음 성운 퍼즐 결정(얼음 성운의 낮은 다각형 결정 모양을 따른다) */
export class SongCrystal {
  constructor(index, height = 1.6) {
    this.index = index;
    const geo = new THREE.CylinderGeometry(0.26, 0.34, height, 6, 1);
    geo.translate(0, height / 2, 0);
    const tip = new THREE.ConeGeometry(0.26, 0.55, 6);
    tip.translate(0, height + 0.27, 0);
    const hues = ['#B9E6D3', '#C9D8FF', '#D8C6F5'];
    this.baseColor = new THREE.Color(hues[index % 3]);
    this.material = new THREE.MeshStandardMaterial({
      color: this.baseColor,
      roughness: 0.25,
      metalness: 0,
      flatShading: true,
      emissive: this.baseColor.clone(),
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.92,
    });
    this.object = new THREE.Group();
    const body = new THREE.Mesh(geo, this.material);
    const top = new THREE.Mesh(tip, this.material);
    body.userData.crystal = index;
    top.userData.crystal = index;
    this.object.add(body, top);
    this.object.rotation.z = (index - 1) * 0.12;
    this.ring = new GroundRing({ color: hues[index % 3], radius: 0.8 });
    this.ring.mesh.position.y = 0.04;
    this.object.add(this.ring.mesh);
    this.light = new THREE.PointLight(this.baseColor, 0, 6, 2);
    this.light.position.y = height * 0.8;
    this.object.add(this.light);
    this.glow = 0;
    this.wrong = 0;
    this.meshes = [body, top];
  }
  flash() {
    this.glow = 1;
  }
  fail() {
    this.wrong = 1;
  }
  update(dt, t) {
    this.glow = Math.max(0, this.glow - dt * 1.4);
    this.wrong = Math.max(0, this.wrong - dt * 1.0);
    const idle = 0.2 + Math.sin(t * 1.7 + this.index * 2) * 0.08;
    this.material.emissiveIntensity = idle + this.glow * 2.6;
    this.material.emissive.copy(this.baseColor).lerp(new THREE.Color('#FF9AA8'), this.wrong);
    this.light.intensity = this.glow * 6 + this.wrong * 3;
    this.ring.strength = 0.25 + this.glow;
    this.ring.update(t);
    this.object.scale.setScalar(1 + this.glow * 0.06);
  }
}

/** 반짝임 입자 */
export class Sparkles {
  constructor(scene) {
    this.max = 240;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(
      this.geo,
      new THREE.PointsMaterial({
        size: 0.14,
        map: glowTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.points.frustumCulled = false;
    this.items = [];
    scene.add(this.points);
  }
  burst(at, n = 18, reduced = false) {
    const palette = ['#FFF4DC', '#FFD0A9', '#B9E6D3', '#C9B7EE'].map((h) => new THREE.Color(h));
    if (reduced) n = Math.ceil(n / 3);
    for (let i = 0; i < n && this.items.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 2.2 + 0.6;
      const sp = Math.random() * 1.6 + 0.4;
      this.items.push({
        p: at.clone(),
        v: new THREE.Vector3(Math.cos(a) * sp, up, Math.sin(a) * sp),
        life: 1,
        c: palette[i % palette.length],
      });
    }
  }
  update(dt) {
    this.items = this.items.filter((s) => (s.life -= dt * 0.9) > 0);
    this.items.forEach((s, i) => {
      s.v.y -= dt * 2.2;
      s.p.addScaledVector(s.v, dt);
      this.pos.set([s.p.x, s.p.y, s.p.z], i * 3);
      this.col.set([s.c.r * s.life, s.c.g * s.life, s.c.b * s.life], i * 3);
    });
    this.geo.setDrawRange(0, this.items.length);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
