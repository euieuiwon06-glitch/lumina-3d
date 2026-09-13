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
