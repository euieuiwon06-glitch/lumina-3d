// 캐릭터모델링.blend에서 내보낸 루미 6종. 리그가 없어 파츠(팔·다리 회전축)를 직접 움직여 걷기·인사를 연출한다.
import * as THREE from 'three';

import { BASE, gltfLoader } from './world.js';

export const CHARACTER_IDS = ['flame', 'flower', 'crystal', 'vine', 'cloud', 'hexa'];
/** 게임 속 키(m). 블렌더 모델은 약 2.2 단위 */
export const CHARACTER_HEIGHT = 1.15;

const templates = new Map();

export async function loadCharacters(ids = CHARACTER_IDS) {
  const meta = await fetch(`${BASE}characters/characters.json`).then((r) => r.json());
  await Promise.all(
    ids.map(async (id) => {
      const gltf = await gltfLoader.loadAsync(`${BASE}characters/${id}.glb`);
      // 캐릭터모델링.blend는 Standard 뷰로 색을 잡았다 → AgX를 거치지 않게 해 원래 크림·파스텔 색을 지킨다
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.toneMapped = false;
      });
      templates.set(id, { scene: gltf.scene, height: meta[id]?.height ?? 2.2 });
    }),
  );
}

function blobShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(40,28,90,0.55)');
  grad.addColorStop(0.6, 'rgba(40,28,90,0.22)');
  grad.addColorStop(1, 'rgba(40,28,90,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let shadowTex = null;

/** 파츠 역할 이름(메시가 여러 재질로 쪼개진 경우 부모 노드 이름을 본다) */
export function roleOf(o) {
  for (let cur = o; cur; cur = cur.parent) {
    const part = cur.name.split('__')[1];
    if (part) return part;
  }
  return '';
}

const symbolCache = new Map();
function symbolTexture(id) {
  if (symbolCache.has(id)) return symbolCache.get(id);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.translate(64, 64);
  g.beginPath();
  if (id === 'star') {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 22 : 52;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  } else if (id === 'moon') {
    g.arc(0, 0, 48, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(22, -14, 42, 0, Math.PI * 2);
    g.fill();
  } else {
    g.moveTo(0, -54);
    g.bezierCurveTo(30, -18, 42, 6, 42, 20);
    g.arc(0, 20, 42, 0, Math.PI);
    g.bezierCurveTo(-42, 6, -30, -18, 0, -54);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  symbolCache.set(id, t);
  return t;
}

export class Character {
  constructor(id, { height = CHARACTER_HEIGHT } = {}) {
    const tpl = templates.get(id);
    if (!tpl) throw new Error(`캐릭터 ${id} 없음`);
    this.id = id;
    this.object = new THREE.Group();
    this.object.name = `char:${id}`;
    this.model = tpl.scene.clone(true);
    const s = height / tpl.height;
    this.model.scale.setScalar(s);
    this.object.add(this.model);
    this.height = height;

    shadowTex ??= blobShadowTexture();
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(height * 0.9, height * 0.9),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.shadow.renderOrder = 1;
    this.object.add(this.shadow);

    this.arms = [];
    this.legs = [];
    this.floaters = [];
    this.body = [];
    this.model.traverse((o) => {
      const role = o.name.split('__')[1] ?? '';
      if (/^Arm/.test(role)) this.arms.push({ o, rest: o.quaternion.clone(), side: this.arms.length % 2 ? -1 : 1 });
      else if (/^Leg/.test(role)) this.legs.push({ o, rest: o.quaternion.clone(), side: this.legs.length % 2 ? -1 : 1 });
      else if (/^(Floating_Gem|Star|Flame|Curl|Seed|ChestGem)/.test(role)) this.floaters.push({ o, rest: o.position.clone(), phase: Math.random() * 6 });
      if (o.isMesh) {
        o.castShadow = false;
        o.userData.character = id;
      }
    });
    this.phase = Math.random() * 10;
    this.walkBlend = 0;
    this.wave = 0;
    this.yaw = 0;
    this.targetYaw = 0;
    this._q = new THREE.Quaternion();
    this._axisX = new THREE.Vector3(1, 0, 0);
    this._axisZ = new THREE.Vector3(0, 0, 1);
  }

  /** 내 모습 만들기: 몸 색·가슴 빛·심볼·장식 (재질은 이 캐릭터 전용으로 복제) */
  applyProfile({ bodyHex, chestHex, symbol, accessory }) {
    const body = new THREE.Color(bodyHex);
    const chest = new THREE.Color(chestHex);
    this.model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.model.matrixWorld).invert();
    let torsoBox = null;
    let headBox = null;
    let handPos = null;
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      const role = roleOf(o);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        c.userData.baseColor ??= m.color.clone();
        return c;
      });
      o.material = cloned.length === 1 ? cloned[0] : cloned;
      for (const m of cloned) {
        const isDark = m.userData.baseColor.getHSL({}).l < 0.25; // 눈
        if (/^(Head|Torso|Arm|Leg|Hand|Foot|Thumb|Wrist|Ankle|Face)/.test(role) && !isDark) {
          // 원래 음영 차이(손·발이 약간 진한 등)는 밝기 비율로 남긴다
          const k = m.userData.baseColor.getHSL({}).l / 0.85;
          m.color.copy(body).multiplyScalar(Math.min(1.1, Math.max(0.75, k)));
        }
        if (/^(Seed|ChestGem|Flame|Floating_Gem|Star)/.test(role)) {
          m.color.copy(chest);
          if (m.emissive) {
            m.emissive.copy(chest);
            m.emissiveIntensity = 0.9;
          }
        }
      }
      const box = new THREE.Box3().setFromObject(o).applyMatrix4(inv);
      if (role.startsWith('Torso')) torsoBox = torsoBox ? torsoBox.union(box) : box;
      if (role.startsWith('Head') || role.startsWith('Face')) headBox = headBox ? headBox.union(box) : box;
      if (!handPos && /^(Hand_Down|Hand_R|Hand_L|Hand_Out)/.test(role)) {
        handPos = { obj: o, box };
      }
    });
    for (const d of this.decor ?? []) d.removeFromParent();
    this.decor = [];
    if (torsoBox && symbol) {
      const c = torsoBox.getCenter(new THREE.Vector3());
      const size = torsoBox.getSize(new THREE.Vector3());
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(size.x * 0.34, size.x * 0.34),
        new THREE.MeshBasicMaterial({ map: symbolTexture(symbol), color: chest, transparent: true, depthWrite: false, toneMapped: false }),
      );
      plane.position.set(c.x, c.y + size.y * 0.08, torsoBox.max.z + 0.02);
      plane.renderOrder = 3;
      this.model.add(plane);
      this.decor.push(plane);
    }
    if (torsoBox && (accessory === 'scarf' || accessory === 'petalScarf')) {
      const size = torsoBox.getSize(new THREE.Vector3());
      const c = torsoBox.getCenter(new THREE.Vector3());
      const neckY = headBox ? Math.max(torsoBox.max.y - size.y * 0.08, Math.min(torsoBox.max.y, headBox.min.y + 0.05)) : torsoBox.max.y;
      const r = Math.max(size.x, size.z) * 0.42;
      const scarfMat = new THREE.MeshStandardMaterial({ color: accessory === 'petalScarf' ? '#FFC4D6' : '#FFD0A9', roughness: 0.7, toneMapped: false });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.26, 12, 32), scarfMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(c.x, neckY, c.z);
      this.model.add(ring);
      this.decor.push(ring);
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.22, r * 0.7, 4, 8), scarfMat);
      tail.position.set(c.x + r * 0.5, neckY - r * 0.55, c.z + r * 0.85);
      tail.rotation.z = 0.3;
      this.model.add(tail);
      this.decor.push(tail);
      if (accessory === 'petalScarf') {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const petal = new THREE.Mesh(new THREE.SphereGeometry(r * 0.22, 10, 8), new THREE.MeshStandardMaterial({ color: '#FFF0C9', toneMapped: false }));
          petal.scale.set(1, 0.5, 1.4);
          petal.position.set(c.x + Math.cos(a) * r, neckY + r * 0.12, c.z + Math.sin(a) * r);
          this.model.add(petal);
          this.decor.push(petal);
        }
      }
    }
    if (accessory === 'bracelet' && handPos) {
      const s = handPos.box.getSize(new THREE.Vector3());
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(s.x, s.z) * 0.55, Math.max(s.x, s.z) * 0.13, 10, 24),
        new THREE.MeshStandardMaterial({ color: chest, emissive: chest, emissiveIntensity: 0.4, toneMapped: false }),
      );
      // 손 파츠의 자식으로 붙여 팔 흔들림을 따라가게 한다
      const local = handPos.obj.worldToLocal(this.model.localToWorld(handPos.box.getCenter(new THREE.Vector3())));
      band.position.copy(local);
      band.position.y += s.y * 0.35;
      band.rotation.x = Math.PI / 2;
      const ws = handPos.obj.getWorldScale(new THREE.Vector3());
      const ms = this.model.getWorldScale(new THREE.Vector3());
      band.scale.setScalar(ms.x / ws.x);
      handPos.obj.add(band);
      this.decor.push(band);
    }
  }

  get position() {
    return this.object.position;
  }

  faceTowards(x, z) {
    const dx = x - this.object.position.x;
    const dz = z - this.object.position.z;
    if (Math.hypot(dx, dz) > 1e-3) this.targetYaw = Math.atan2(dx, dz);
  }

  setYaw(yaw, immediate = false) {
    this.targetYaw = yaw;
    if (immediate) this.yaw = yaw;
  }

  greet() {
    this.wave = 1.6;
  }

  /** speed: 초당 이동 거리(m) */
  update(dt, speed = 0, time = performance.now() / 1000) {
    let d = this.targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 10);
    this.object.rotation.y = this.yaw;

    const walking = Math.min(1, speed / 2.6);
    this.walkBlend += (walking - this.walkBlend) * Math.min(1, dt * 8);
    this.phase += dt * (2.2 + speed * 3.2);
    const w = this.walkBlend;
    const swing = Math.sin(this.phase);

    for (const L of this.legs) {
      this._q.setFromAxisAngle(this._axisX, swing * 0.55 * w * L.side);
      L.o.quaternion.copy(L.rest).multiply(this._q);
    }
    this.wave = Math.max(0, this.wave - dt);
    this.arms.forEach((A, i) => {
      let angle = -swing * 0.45 * w * A.side;
      if (this.wave > 0 && i === 0) {
        // 첫 번째 팔로 손 흔들기
        const k = Math.min(1, this.wave * 2, (1.6 - this.wave) * 4);
        this._q.setFromAxisAngle(this._axisZ, Math.sin(time * 14) * 0.35 * k);
        A.o.quaternion.copy(A.rest).multiply(this._q);
        return;
      }
      // 서 있을 때는 숨 쉬듯 살짝
      angle += Math.sin(time * 2 + i) * 0.04 * (1 - w);
      this._q.setFromAxisAngle(this._axisX, angle);
      A.o.quaternion.copy(A.rest).multiply(this._q);
    });
    // 몸 튕김·기울임
    this.model.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * w + Math.sin(time * 2.1 + this.phase * 0.1) * 0.008 * (1 - w);
    this.model.rotation.x = 0.08 * w;
    for (const f of this.floaters) {
      f.o.position.y = f.rest.y + Math.sin(time * 2 + f.phase) * 0.04;
    }
    this.shadow.scale.setScalar(1 - Math.abs(Math.sin(this.phase)) * 0.08 * w);
  }
}
