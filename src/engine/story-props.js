// 첫 챕터 공간 요소: 빛기둥 관문, 꽃잎 승강대, 접힌 촉수 다리, 등불, 잠든 봉오리, 안내 빛, 빛 흐름
import * as THREE from 'three';

import { glowTexture } from './props.js';

const PETAL = '#E9DDF8';
const PEACH = '#FFD0A9';
const MINT = '#B9F0DA';
const OFF_LINE = new THREE.Color('#C2B6E6');

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function petalGeometry(width = 1, height = 2.4, depth = 0.22) {
  // 꽃잎 한 장: 넓은 아래, 뾰족한 위, 살짝 오목하게 휜 판
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(width * 0.9, height * 0.15, width * 0.85, height * 0.7, 0, height);
  shape.bezierCurveTo(-width * 0.85, height * 0.7, -width * 0.9, height * 0.15, 0, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3, curveSegments: 18 });
  g.translate(0, 0, -depth / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, pos.getZ(i) - x * x * 0.35);
  }
  g.computeVertexNormals();
  return g;
}

function softMat(color, emissive = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, emissive: color, emissiveIntensity: emissive });
}

function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  // 세로: 바닥에서 가장 밝고 위로 사라진다 / 가로: 가운데가 밝은 부드러운 띠
  for (let x = 0; x < 64; x++) {
    const u = Math.abs(x / 63 - 0.5) * 2;
    const across = Math.pow(1 - u, 1.6);
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.45, `rgba(255,255,255,${0.35 * across})`);
    grad.addColorStop(0.9, `rgba(255,255,255,${0.95 * across})`);
    grad.addColorStop(1, `rgba(255,255,255,${0.6 * across})`);
    g.fillStyle = grad;
    g.fillRect(x, 0, 1, 256);
  }
  return new THREE.CanvasTexture(c);
}
let beamTex = null;

function ringTex2() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.28, 'rgba(255,255,255,0.12)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0.0)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.76, 'rgba(255,255,255,0.15)');
  grad.addColorStop(0.9, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.95, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
let gateRingTex = null;

const additive = (map, color, opacity = 1) =>
  new THREE.MeshBasicMaterial({ map, color: new THREE.Color(color), transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });

/** A. 빛기둥 관문: 멀리서도 보이는 문. 가까워지면 밝아지고 빛 알갱이가 문턱으로 모인다 */
export class LightGate {
  constructor({ label, yaw = 0, kind = 'door' }) {
    this.object = new THREE.Group();
    this.object.rotation.y = yaw;
    this.label = label;
    beamTex ??= beamTexture();
    gateRingTex ??= ringTex2();
    const warm = kind === 'lift' ? '#B9E6D3' : '#FFE9C9';
    this.color = new THREE.Color(warm);
    const coreGeo = new THREE.CylinderGeometry(0.42, 0.62, 5.2, 32, 1, true);
    coreGeo.translate(0, 2.6, 0);
    this.core = new THREE.Mesh(coreGeo, additive(beamTex, '#FFF6E6', 0.9));
    const haloGeo = new THREE.CylinderGeometry(1.05, 1.45, 3.6, 40, 1, true);
    haloGeo.translate(0, 1.8, 0);
    this.halo = new THREE.Mesh(haloGeo, additive(beamTex, warm, 0.45));
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), additive(gateRingTex, warm, 0.9));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.core.renderOrder = this.halo.renderOrder = this.ring.renderOrder = 3;
    this.object.add(this.ring, this.halo, this.core);
    this.motes = Array.from({ length: 18 }, (_, i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: i % 3 ? warm : '#FFFFFF', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      s.userData = { a: (i / 18) * Math.PI * 2, r: 0.5 + (i % 4) * 0.22, speed: 0.35 + (i % 5) * 0.08, phase: i / 18 };
      this.object.add(s);
      return s;
    });
    this.open = 0;
    this.locked = false;
  }
  update(dt, t, playerDist, cameraPos) {
    const near = !this.locked && playerDist < 5 ? 1 : 0;
    this.open += (near - this.open) * Math.min(1, dt * 3);
    const lockDim = this.locked ? 0.35 : 1;
    let camFade = 1;
    if (cameraPos) {
      const wp = this.object.getWorldPosition(new THREE.Vector3());
      const d = Math.hypot(cameraPos.x - wp.x, cameraPos.z - wp.z);
      camFade = THREE.MathUtils.smoothstep(d, 3.5, 9);
    }
    // 도착 직후처럼 캐릭터가 빛기둥 안에 서 있으면 시야를 가리지 않게 옅게
    camFade *= 0.12 + 0.88 * THREE.MathUtils.smoothstep(playerDist, 0.9, 2.8);
    const pulse = 0.85 + Math.sin(t * 2.2) * 0.15;
    const color = this.locked ? new THREE.Color('#C9B7EE') : this.color;
    this.halo.material.color.copy(color);
    this.ring.material.color.copy(color);
    this.core.material.opacity = (0.55 + this.open * 0.45) * pulse * lockDim * camFade;
    this.halo.material.opacity = (0.25 + this.open * 0.35) * lockDim * camFade;
    this.ring.material.opacity = (0.6 + this.open * 0.4) * pulse * lockDim;
    this.ring.rotation.z = t * 0.25;
    this.core.scale.set(1 + this.open * 0.15, 1, 1 + this.open * 0.15);
    for (const s of this.motes) {
      const u = s.userData;
      const k = (t * u.speed + u.phase) % 1;
      const a = u.a + t * 0.6;
      const r = u.r * (1 - k * 0.5) * (1 - this.open * 0.3);
      s.position.set(Math.cos(a) * r, 0.2 + k * 3.8, Math.sin(a) * r);
      s.scale.setScalar(0.12 + (1 - k) * 0.14);
      s.material.opacity = Math.sin(k * Math.PI) * (this.locked ? 0.15 : 0.9) * camFade;
    }
  }
}

/** C. 꽃잎 승강대: 탑승 확정 뒤 꽃잎이 난간처럼 접히고 떠오른다 */
/** 블렌더 꽃잎 승강대(props/petal_lift.glb) 틀. 구운 정점 색은 조명 없이 그대로, 발광 선은 발광색으로 */
let liftTemplate = null;
export function loadLiftTemplate(loader, url) {
  liftTemplate ??= loader
    .loadAsync(url)
    .then((gltf) => {
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        const glow = { M_QuestVeinMint: '#C4F7E4', M_QuestGlowPeach: '#FFE2C4' }[m.name];
        o.material = glow
          ? Object.assign(new THREE.MeshBasicMaterial({ color: glow, toneMapped: false }), { name: m.name })
          : Object.assign(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }), { name: m.name });
        if (glow) o.material.userData.glow = new THREE.Color(glow);
        m.dispose();
      });
      return gltf.scene;
    })
    .catch((e) => {
      console.warn('[LUMINA] 꽃잎 승강대 모델 없음, 간이 모양 사용', e);
      return null;
    });
  return liftTemplate;
}

/**
 * C. 꽃잎 승강대(블렌더 모델): 꽃받침 발판 둘레의 꽃잎 여섯 장이 평소엔 벌어져 있고,
 * 가까이 오면 더 활짝 열려 맞이하고, 탑승하면 난간처럼 오므린 채 촉수 줄기에 들려 올라간다
 */
export class PetalLift {
  static TOP = 0.22;
  constructor(template = null) {
    if (!template) return new PetalLiftSimple();
    this.object = template.clone(true);
    this.object.traverse((o) => {
      if (o.isMesh && o.material.userData.glow) {
        // Material.clone은 userData를 JSON으로 복사해 Color가 숫자가 되므로 다시 넣는다
        const glow = o.material.userData.glow.clone();
        o.material = o.material.clone();
        o.material.userData.glow = glow;
      }
    });
    this.petals = [];
    this.glows = [];
    this.object.traverse((o) => {
      if (o.name.startsWith('Lift_Petal')) this.petals.push({ node: o, rest: o.quaternion.clone(), phase: this.petals.length });
      if (o.isMesh && o.material.userData.glow) this.glows.push(o);
    });
    this.top = PetalLift.TOP;
    this.ride = 0; // 0 대기, 0~1 접힘, 1 이상 상승
    this.near = 0;
    this._q = new THREE.Quaternion();
    this._x = new THREE.Vector3(1, 0, 0);
  }
  update(dt, t, playerDist = 99) {
    const fold = Math.min(1, this.ride);
    this.near += ((playerDist < 4.5 && this.ride === 0 ? 1 : 0) - this.near) * Math.min(1, dt * 3);
    // + 방향이 오므림: 대기 44° → 다가오면 64° → 탑승 14°
    const angle = -this.near * 0.35 * (1 - fold) + fold * 0.52;
    for (const p of this.petals) {
      this._q.setFromAxisAngle(this._x, angle + Math.sin(t * 1.8 + p.phase) * 0.025);
      p.node.quaternion.copy(p.rest).multiply(this._q);
    }
    const pulse = 0.75 + Math.sin(t * 2.2) * 0.12 + this.near * 0.2 + fold * 0.3;
    for (const g of this.glows) setBrightness(g, pulse);
    this.object.position.y = this.baseY + Math.max(0, this.ride - 1) * 6;
  }
}

class PetalLiftSimple {
  constructor() {
    this.top = 0.3;
    this.object = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.2, 0.3, 40), softMat('#F3EAFF', 0.05));
    disc.position.y = 0.15;
    this.object.add(disc);
    this.petals = [];
    const geo = petalGeometry(0.55, 1.0, 0.12);
    for (let i = 0; i < 8; i++) {
      const pivot = new THREE.Group();
      const a = (i / 8) * Math.PI * 2;
      pivot.position.set(Math.cos(a) * 1.35, 0.3, Math.sin(a) * 1.35);
      pivot.rotation.y = -a + Math.PI / 2;
      const p = new THREE.Mesh(geo, softMat(i % 2 ? PETAL : '#FFE3CF', 0.06));
      p.rotation.x = -1.2;
      pivot.add(p);
      this.object.add(pivot);
      this.petals.push(p);
    }
    this.ride = 0; // 0 대기, 0~1 접힘, 1 이상 상승
  }
  update(dt, t) {
    const fold = Math.min(1, this.ride);
    this.petals.forEach((p, i) => (p.rotation.x = -1.2 + fold * 1.05 + Math.sin(t * 2 + i) * 0.03));
    this.object.position.y = this.baseY + Math.max(0, this.ride - 1) * 6;
  }
}

const easeOutBack = (x) => {
  const c = 1.5;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

/** 구운 재질(MeshBasic) 밝기: 1 = 블렌더에서 구운 그대로 */
function setBrightness(mesh, k) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) {
    // 발광 선은 꺼지면 어두운 선이 아니라 길 색(연보라 새김)으로 가라앉는다
    if (m.userData.glow) m.color.copy(OFF_LINE).lerp(m.userData.glow, Math.min(1, k)).multiplyScalar(Math.max(1, k));
    else m.color?.setScalar(k);
  }
}

/**
 * B. 끊긴 판석 다리(블렌더 Quest_Bridge_*): 복원 전에는 판석이 틈 아래에 흩어져 떠 있고,
 * 복원 연출에서 가까운 쪽부터 차례로 날아와 맞춰진 뒤 가운데 민트 빛줄기가 켜진다
 */
export class SlabBridge {
  constructor(path, parts) {
    this.object = new THREE.Group();
    this.path = path;
    this.pathLen = path.slice(1).reduce((s, p, i) => s + p.distanceTo(path[i]), 0);
    const from = parts.from;
    const dir = parts.to.clone().sub(from).setY(0);
    const len = Math.max(0.1, dir.length());
    dir.normalize();
    const rnd = mulberry(7);
    const piece = (mesh, order) => {
      const rest = { pos: mesh.position.clone(), quat: mesh.quaternion.clone() };
      mesh.updateWorldMatrix(true, false);
      const wp = mesh.getWorldPosition(new THREE.Vector3());
      const along = THREE.MathUtils.clamp(wp.clone().sub(from).dot(dir) / len, 0, 1);
      // 틈 사이에 흩어져 떠 있는 게 보이도록 조금만 가라앉힌다
      const drop = new THREE.Vector3((rnd() - 0.5) * 2.2, -0.7 - rnd() * 1.3, (rnd() - 0.5) * 2.2);
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.9, (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 0.9));
      mesh.matrixAutoUpdate = true;
      return { mesh, rest, scatterPos: rest.pos.clone().add(drop), scatterQuat: rest.quat.clone().multiply(tilt), order: order ?? along, phase: rnd() * 6.28 };
    };
    this.pieces = [...parts.slabs.map((m) => piece(m)), ...parts.frame.map((m) => piece(m, 0.55 + rnd() * 0.3))];
    this.veins = parts.veins;
    this.progress = 0;
    this.runner = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: MINT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.runner.scale.setScalar(1.4);
    this.runner.visible = false;
    this.object.add(this.runner);
    this.center = from.clone().lerp(parts.to, 0.5);
  }
  pointAt(k) {
    return BridgeGate.prototype.pointAt.call(this, k);
  }
  setRestored(v) {
    this.progress = v ? 1 : 0;
    this.apply(0);
  }
  apply(t) {
    const k = this.progress;
    for (const p of this.pieces) {
      const local = THREE.MathUtils.clamp((k - p.order * 0.62) / 0.38, 0, 1);
      const e = local >= 1 ? 1 : easeOutBack(local);
      const bob = (1 - Math.min(1, local * 1.5)) * Math.sin(t * 1.2 + p.phase) * 0.14;
      p.mesh.position.lerpVectors(p.scatterPos, p.rest.pos, e);
      p.mesh.position.y += bob;
      p.mesh.quaternion.slerpQuaternions(p.scatterQuat, p.rest.quat, Math.min(1, e));
    }
    const lit = THREE.MathUtils.smoothstep(k, 0.72, 1);
    // 빛줄기는 판석이 다 맞춰진 뒤에 나타난다(흩어진 동안 허공에 떠 보이지 않게)
    for (const [i, v] of this.veins.entries()) {
      v.visible = lit > 0.01;
      setBrightness(v, lit * (0.9 + Math.sin(t * 2.4 + i) * 0.12));
    }
    this.runner.visible = k > 0 && k < 1;
    if (this.runner.visible) this.runner.position.copy(this.pointAt(k)).add(new THREE.Vector3(0, 0.6, 0));
  }
}

/** 빛 봉오리(블렌더 Quest_Bud_*): 꽃잎 여섯 장이 오므려 닫혀 있다가 깨우면 활짝 열리고 바닥·빛줄기가 밝아진다 */
export class BudPod {
  static CLOSE = THREE.MathUtils.degToRad(70);
  constructor(parts) {
    this.object = new THREE.Group();
    this.petals = parts.petals.map((mesh) => ({ mesh, rest: mesh.quaternion.clone() }));
    this.glows = parts.glows;
    this.floors = parts.floors ?? [];
    this.veins = parts.veins;
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#FFE2C6', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.core.position.y = 1.1;
    this.object.add(this.core);
    this.openness = 0;
    this.awake = false;
    this._q = new THREE.Quaternion();
    this._x = new THREE.Vector3(1, 0, 0);
  }
  update(dt, t) {
    const want = this.awake ? 1 : 0;
    this.openness += (want - this.openness) * Math.min(1, dt * 1.2);
    const o = this.openness;
    const breathe = this.awake ? Math.sin(t * 0.9) * 0.025 : Math.sin(t * 1.6) * 0.02;
    for (const [i, p] of this.petals.entries()) {
      this._q.setFromAxisAngle(this._x, BudPod.CLOSE * (1 - o) + breathe * (i % 2 ? 1 : -1));
      p.mesh.quaternion.copy(p.rest).multiply(this._q);
    }
    const sleepPulse = this.awake ? 0 : Math.max(0, Math.sin(t * 2.2)) * 0.18;
    for (const g of this.glows) setBrightness(g, 0.35 + o * 0.75 + sleepPulse);
    for (const f of this.floors) setBrightness(f, 0.92 + o * 0.2 + sleepPulse * 0.3);
    for (const [i, v] of this.veins.entries()) setBrightness(v, 0.2 + o * (0.95 + Math.sin(t * 2 + i * 1.7) * 0.1));
    this.core.material.opacity = 0.25 + o * 0.6 + sleepPulse;
    this.core.scale.setScalar(1.0 + o * 1.8);
  }
}

/** B. 접힌 촉수 다리: 복원 전에는 촉수가 말려 길을 막고, 복원 연출에서 풀리며 난간 꽃잎이 올라온다 */
export class BridgeGate {
  constructor(path) {
    this.object = new THREE.Group();
    this.path = path; // 다리 위 경유점(three Vector3)
    const a = path[0];
    const b = path[1] ?? path[0].clone().add(new THREE.Vector3(0, 0, -2));
    const dir = b.clone().sub(a).setY(0).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    // 말린 촉수(나선 관)
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const k = i / 60;
      const ang = k * Math.PI * 3.2;
      const r = 1.6 * (1 - k * 0.7);
      pts.push(
        a
          .clone()
          .addScaledVector(side, (k - 0.5) * 3.6)
          .add(new THREE.Vector3(0, 0.6 + Math.sin(ang) * r * 0.6, 0))
          .addScaledVector(dir, Math.cos(ang) * r * 0.5),
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    this.curlMat = new THREE.MeshStandardMaterial({ color: '#D6C3F2', roughness: 0.4, transparent: true, opacity: 0.9, emissive: '#B9A2EE', emissiveIntensity: 0.15 });
    this.curl = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.22, 12, false), this.curlMat);
    this.object.add(this.curl);
    // 난간 꽃잎
    this.rails = [];
    const geo = petalGeometry(0.35, 0.7, 0.08);
    for (let i = 0; i < path.length - 1; i++) {
      const p0 = path[i];
      const p1 = path[i + 1];
      const d = p1.clone().sub(p0);
      const n = Math.max(1, Math.floor(d.length() / 2.2));
      const sd = new THREE.Vector3(-d.z, 0, d.x).normalize();
      for (let j = 0; j < n; j++) {
        const q = p0.clone().addScaledVector(d, (j + 0.5) / n);
        for (const s of [-1, 1]) {
          const m = new THREE.Mesh(geo, softMat(j % 2 ? PETAL : '#FFE3CF', 0.1));
          m.position.copy(q).addScaledVector(sd, s * 1.7);
          m.rotation.y = Math.atan2(sd.x, sd.z);
          m.scale.setScalar(0.001);
          this.object.add(m);
          this.rails.push(m);
        }
      }
    }
    this.progress = 0; // 0 접힘 → 1 펼침
    this.runner = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: PEACH, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.runner.scale.setScalar(1.4);
    this.runner.visible = false;
    this.object.add(this.runner);
    this.pathLen = path.slice(1).reduce((s, p, i) => s + p.distanceTo(path[i]), 0);
  }
  pointAt(k) {
    let d = k * this.pathLen;
    for (let i = 1; i < this.path.length; i++) {
      const seg = this.path[i].distanceTo(this.path[i - 1]);
      if (d <= seg) return this.path[i - 1].clone().lerp(this.path[i], d / seg);
      d -= seg;
    }
    return this.path[this.path.length - 1].clone();
  }
  setRestored(v) {
    this.progress = v ? 1 : 0;
    this.apply(0);
  }
  apply(t) {
    const k = this.progress;
    this.curl.scale.setScalar(Math.max(0.001, 1 - k));
    this.curlMat.opacity = 0.9 * (1 - k);
    this.curl.visible = k < 0.99;
    this.rails.forEach((m, i) => {
      const local = Math.min(1, Math.max(0, k * 1.4 - (i / this.rails.length) * 0.4));
      m.scale.setScalar(Math.max(0.001, local));
      m.material.emissiveIntensity = 0.1 + Math.sin(t * 2 + i) * 0.05;
    });
    this.runner.visible = k > 0 && k < 1;
    if (this.runner.visible) this.runner.position.copy(this.pointAt(k)).add(new THREE.Vector3(0, 0.6, 0));
  }
}

/** 등불(봉오리 모양 램프): 꺼짐 / 박자 어긋남 / 켜짐 */
export class Lantern {
  constructor() {
    this.object = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.3, 10), softMat('#CFE9DC'));
    stem.position.y = 0.65;
    this.bulbMat = new THREE.MeshStandardMaterial({ color: '#F4EBDD', roughness: 0.35, emissive: PEACH, emissiveIntensity: 0.05 });
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), this.bulbMat);
    this.bulb.scale.set(1, 1.35, 1);
    this.bulb.position.y = 1.55;
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: PEACH, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.glow.position.y = 1.55;
    this.glow.scale.setScalar(1.6);
    this.object.add(stem, this.bulb, this.glow);
    this.state = 'off'; // off | offbeat | on
    this.level = 0;
    this.flash = 0;
  }
  update(dt, t, external = null) {
    this.flash = Math.max(0, this.flash - dt * 1.5);
    let target = 0;
    if (this.state === 'on') target = 0.85 + Math.sin(t * 2.2) * 0.1;
    if (this.state === 'offbeat') target = external ?? 0.2 + Math.max(0, Math.sin(t * 5.3)) * 0.4;
    this.level += (target - this.level) * Math.min(1, dt * 10);
    const g = Math.min(1.4, this.level + this.flash);
    this.bulbMat.emissiveIntensity = 0.05 + g * 2.2;
    this.glow.material.opacity = g * 0.8;
    this.glow.scale.setScalar(1.2 + g * 1.2);
  }
}

/** 닫힌 빛 봉오리: 관찰로 깨우면 꽃잎이 열린다 */
export class SleepingBud {
  constructor() {
    this.object = new THREE.Group();
    this.petals = [];
    const geo = petalGeometry(0.5, 1.1, 0.1);
    for (let i = 0; i < 5; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 5) * Math.PI * 2;
      const p = new THREE.Mesh(geo, softMat(i % 2 ? '#BFE8D6' : '#DDF3E9', 0.08));
      p.position.z = 0.12;
      p.rotation.x = -0.12;
      pivot.add(p);
      pivot.position.y = 0.25;
      this.object.add(pivot);
      this.petals.push(p);
    }
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#9FE3C8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.core.position.y = 0.8;
    this.object.add(this.core);
    this.openness = 0;
    this.awake = false;
  }
  update(dt, t) {
    const want = this.awake ? 1 : 0;
    this.openness += (want - this.openness) * Math.min(1, dt * 1.6);
    this.petals.forEach((p) => (p.rotation.x = -0.12 - this.openness * 0.95));
    this.core.material.opacity = 0.2 + this.openness * 0.8 + (this.awake ? 0 : Math.max(0, Math.sin(t * 3)) * 0.25);
    this.core.scale.setScalar(0.6 + this.openness * 1.2);
  }
}

function runeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.translate(256, 256);
  const ring = (r, w, a) => {
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.lineWidth = w;
    g.strokeStyle = `rgba(255,255,255,${a})`;
    g.stroke();
  };
  // 바깥에서 안으로 번지는 부드러운 바닥빛
  const fill = g.createRadialGradient(0, 0, 0, 0, 0, 250);
  fill.addColorStop(0, 'rgba(255,255,255,0.28)');
  fill.addColorStop(0.7, 'rgba(255,255,255,0.1)');
  fill.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = fill;
  g.fillRect(-256, -256, 512, 512);
  ring(238, 7, 0.95);
  ring(222, 2, 0.6);
  ring(150, 4, 0.75);
  ring(96, 2, 0.5);
  // 항로 눈금: 굵은 방향 표시 8개와 가는 눈금
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const big = i % 8 === 0;
    const r0 = big ? 160 : 196;
    g.beginPath();
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    g.lineTo(Math.cos(a) * 218, Math.sin(a) * 218);
    g.lineWidth = big ? 6 : 2;
    g.strokeStyle = `rgba(255,255,255,${big ? 0.9 : 0.45})`;
    g.stroke();
  }
  // 네 갈래 별(나침판)
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 26 : 132;
    g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.center.set(0.5, 0.5);
  return t;
}

/**
 * 항해대 표시: 항로를 고르는 구역이 멀리서도 기능하는 곳으로 보이게
 *  - 바닥: 나침판 무늬 빛이 천천히 돈다
 *  - 세 수반: 살구·민트·라일락 빛기둥이 하늘로 솟고 빛 알갱이가 떠오른다
 *  - 항해 나무: 가늘고 긴 신호 빛줄기
 * ready(항로를 고를 수 있을 때)면 밝게 맥동, 아니면 은은하게. 카메라가 기둥에 가까우면 옅어진다
 */
export class NavBeacon {
  constructor({ center, radii, basins, tree }) {
    this.object = new THREE.Group();
    beamTex ??= beamTexture();
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), additive(runeTexture(), '#E6D6FF', 0.8));
    rune.rotation.x = -Math.PI / 2;
    rune.position.set(center[0], center[1], center[2]);
    rune.scale.set(radii[0], radii[1], 1);
    rune.renderOrder = 3;
    this.rune = rune;
    this.object.add(rune);
    // 구역 가장자리를 따라 바닥에서 솟는 빛 커튼(멀리서도 '여기가 항해대'로 보이게)
    const cgeo = new THREE.CylinderGeometry(1, 1.04, 3.6, 96, 1, true);
    cgeo.translate(0, 1.8, 0);
    this.curtain = new THREE.Mesh(cgeo, additive(beamTex, '#D6ACFF', 0.7));
    this.curtain.position.set(center[0], center[1] + 0.3, center[2]);
    this.curtain.scale.set(radii[0] + 0.3, 1, radii[1] + 0.3);
    this.curtain.renderOrder = 4;
    this.object.add(this.curtain);
    this.columns = basins.map((b, i) => {
      const h = 11;
      const geo = new THREE.CylinderGeometry(b.r * 0.55, b.r, h, 32, 1, true);
      geo.translate(0, h / 2, 0);
      const mesh = new THREE.Mesh(geo, additive(beamTex, b.color, 0.5));
      mesh.position.set(...b.at);
      mesh.renderOrder = 4;
      // 수반 수면 위 빛 고리
      const halo = new THREE.Mesh(new THREE.RingGeometry(b.r * 0.55, b.r * 1.08, 48), additive(glowTexture(), b.color, 0.7));
      halo.rotation.x = -Math.PI / 2;
      halo.position.set(b.at[0], b.at[1] + 0.03, b.at[2]);
      this.object.add(mesh, halo);
      return { mesh, halo, base: new THREE.Vector3(...b.at), r: b.r, phase: i * 2.1 };
    });
    // 떠오르는 빛 알갱이
    const n = 72;
    this.motes = [];
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = this.columns[i % this.columns.length];
      this.motes.push({ c, a: Math.random() * Math.PI * 2, r: Math.random() * c.r * 0.8, speed: 0.6 + Math.random() * 0.9, k: Math.random() });
      new THREE.Color(basins[i % basins.length].color).toArray(col, i * 3);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.motePoints = new THREE.Points(mg, new THREE.PointsMaterial({ map: glowTexture(), size: 0.45, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.motePoints.frustumCulled = false;
    this.object.add(this.motePoints);
    // 나무 꼭대기에서 하늘로 오르는 신호 빛
    const sgeo = new THREE.CylinderGeometry(0.12, 0.45, 38, 16, 1, true);
    sgeo.translate(0, 19, 0);
    this.signal = new THREE.Mesh(sgeo, additive(beamTex, '#FFF1E0', 0.6));
    this.signal.position.set(...tree);
    this.object.add(this.signal);
    this.star = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#FFE4C8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.star.position.set(tree[0], tree[1] + 0.4, tree[2]);
    this.star.scale.setScalar(3.2);
    this.object.add(this.star);
    this.level = 0.5;
    this._v = new THREE.Vector3();
  }
  update(dt, t, { ready = false, near = false, cameraPos = null } = {}) {
    const want = ready ? (near ? 1.2 : 1) : near ? 0.8 : 0.65;
    this.level += (want - this.level) * Math.min(1, dt * 2);
    const L = this.level;
    const beat = 0.85 + Math.sin(t * 2.4) * 0.15;
    this.rune.material.map.rotation = t * 0.06;
    this.rune.material.opacity = (0.5 + L * 0.5) * beat;
    let curtainFade = 1;
    if (cameraPos) curtainFade = 0.08 + 0.92 * THREE.MathUtils.smoothstep(Math.hypot((cameraPos.x - this.curtain.position.x) / this.curtain.scale.x, (cameraPos.z - this.curtain.position.z) / this.curtain.scale.z), 1.25, 2.4);
    this.curtain.material.opacity = (0.55 + L * 0.5) * (0.8 + Math.sin(t * 1.3) * 0.2) * curtainFade;
    for (const c of this.columns) {
      let fade = 1;
      if (cameraPos) {
        const d = Math.hypot(cameraPos.x - c.base.x, cameraPos.z - c.base.z);
        fade = THREE.MathUtils.smoothstep(d, c.r + 0.8, c.r + 6);
      }
      const wave = 0.75 + Math.sin(t * 1.8 - c.phase) * 0.25;
      c.mesh.material.opacity = 0.7 * L * wave * fade;
      c.halo.material.opacity = (0.4 + 0.5 * L) * wave;
    }
    const pos = this.motePoints.geometry.attributes.position;
    for (const [i, m] of this.motes.entries()) {
      m.k = (m.k + dt * m.speed * 0.09) % 1;
      const a = m.a + t * 0.5;
      const r = m.r * (1 - m.k * 0.5);
      pos.setXYZ(i, m.c.base.x + Math.cos(a) * r, m.c.base.y + 0.1 + m.k * 9, m.c.base.z + Math.sin(a) * r);
    }
    pos.needsUpdate = true;
    this.motePoints.material.opacity = Math.min(1, 0.3 + L * 0.8);
    this.signal.material.opacity = (0.18 + L * 0.42) * beat;
    this.star.material.opacity = 0.35 + L * 0.55 * beat;
  }
}

/** 반짝이는 관찰 지점(소리·반짝임을 따라 찾기) */
export class Glimmer {
  constructor(color = '#FFF4DC') {
    this.object = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.phase = Math.random() * 6;
    this.found = false;
  }
  update(t) {
    this.object.visible = !this.found;
    const k = Math.pow(Math.max(0, Math.sin(t * 2.4 + this.phase)), 4);
    this.object.scale.setScalar(0.4 + k * 0.7);
    this.object.material.opacity = 0.35 + k * 0.65;
  }
}

/** 안내 빛: 한동안 진행이 없으면 플레이어 곁에서 목표까지 날아갔다 돌아온다 */
export class GuideWisp {
  constructor() {
    this.object = new THREE.Group();
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#FFF4DC', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.core.scale.setScalar(0.5);
    this.object.add(this.core);
    this.object.visible = false;
    this.t = 0;
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
  }
  fly(from, to) {
    this.from.copy(from).add(new THREE.Vector3(0, 1.3, 0));
    this.to.copy(to).add(new THREE.Vector3(0, 1.0, 0));
    this.t = 0;
    this.object.visible = true;
  }
  update(dt, time) {
    if (!this.object.visible) return;
    this.t += dt / 3.2;
    const k = this.t < 1 ? this.t : 2 - this.t;
    const e = k * k * (3 - 2 * k);
    this.object.position.lerpVectors(this.from, this.to, e);
    this.object.position.y += Math.sin(e * Math.PI) * 1.2 + Math.sin(time * 6) * 0.05;
    this.core.material.opacity = Math.min(1, Math.sin(Math.min(1, this.t / 2) * Math.PI) * 1.5);
    if (this.t >= 2) this.object.visible = false;
  }
}

/** 빛 흐름: 점들을 따라 빛 방울이 차례로 흘러간다(항해 나무 → 돔 → 촉수) */
export class LightFlow {
  constructor(points, color = PEACH, count = 14) {
    this.object = new THREE.Group();
    this.points = points;
    this.sprites = Array.from({ length: count }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      s.scale.setScalar(0.9);
      this.object.add(s);
      return s;
    });
    this.t = 0;
    this.duration = 4;
    this.active = false;
  }
  start(duration = 4) {
    this.t = 0;
    this.duration = duration;
    this.active = true;
  }
  update(dt) {
    this.object.visible = this.active;
    if (!this.active) return;
    this.t += dt / this.duration;
    const n = this.points.length - 1;
    this.sprites.forEach((s, i) => {
      const k = Math.min(1, Math.max(0, this.t * 1.3 - i * 0.02));
      const f = k * n;
      const a = Math.min(n - 1, Math.floor(f));
      s.position.lerpVectors(this.points[a], this.points[a + 1], f - a);
      s.material.opacity = Math.sin(k * Math.PI) * 0.9;
    });
    if (this.t >= 1.1) this.active = false;
  }
}
