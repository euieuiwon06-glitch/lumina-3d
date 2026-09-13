// 장면 로더: 블렌더에서 내보낸 근경 GLB + 360° 파노라마 하늘 + 조명 + 보행 격자
import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

import { decodeGrid } from './walkgrid.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const BASE = `${import.meta.env?.BASE_URL ?? './'}assets/`;

const draco = new DRACOLoader().setDecoderPath(`${import.meta.env?.BASE_URL ?? './'}draco/`);
export const gltfLoader = new GLTFLoader().setDRACOLoader(draco);
const texLoader = new THREE.TextureLoader();

/** 블렌더 와트 → three 광도(cd). 점광원: L = Pρ/(4π²d²) 기준을 three(L = Iρ/(πd²))에 맞춘 값 */
const W_TO_CD = 1 / (4 * Math.PI);
const POOL = 8;

// 장면별 보정(파노라마 밝기·환경광·조명). 검수 스크린샷을 기준 렌더와 비교해 조정
export const LOOK = {
  workshop: { env: 0.7, lights: 1.0, exposure: 1.0, sun: 1.0, saturation: 1.45 },
  neighborhood: { env: 0.7, lights: 1.0, exposure: 1.0, sun: 1.0, saturation: 1.45 },
  nursery: { env: 0.7, lights: 1.0, exposure: 1.0, sun: 1.0, saturation: 1.45 },
  walkway: { env: 0.7, lights: 1.0, exposure: 1.0, sun: 1.0, saturation: 1.45 },
  overlook: { env: 0.7, lights: 1.0, exposure: 1.0, sun: 1.0, saturation: 1.45 },
  ice: { env: 0.7, lights: 1.0, exposure: 0.95, sun: 1.0, saturation: 1.45 },
  solar: { env: 0.6, lights: 1.0, exposure: 0.8, sun: 1.0, saturation: 1.2 },
  twilight: { env: 0.7, lights: 1.0, exposure: 1.0, sun: 1.0, saturation: 1.45 },
};

function loadJSON(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    return r.json();
  });
}

export class World {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.id = null;
    this.root = null;
    this.meta = null;
    this.grid = null;
    this.nav = {};
    this.colliders = [];
    this.meshByName = new Map();

    // 하늘: 톤매핑 없이 블렌더 렌더 색 그대로
    const skyGeo = new THREE.SphereGeometry(900, 64, 32);
    this.skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    // 등장방형 가운데 = 블렌더 +Y = three -Z, 좌우 뒤집힘 보정
    this.sky.scale.x = -1;
    this.sky.rotation.y = -Math.PI / 2;
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 0);
    this.sun.castShadow = false;
    this.scene.add(this.sun, this.sun.target);
    this.pool = Array.from({ length: POOL }, () => {
      const l = new THREE.PointLight(0xffffff, 0, 0, 2);
      this.scene.add(l);
      return l;
    });
    // 바닥이 밝은 파스텔이라 아래에서 올라오는 반사광이 크다(원본 렌더의 GI 대신)
    this.hemi = new THREE.HemisphereLight(0xece6ff, 0xe2d8f6, 0.8);
    this.scene.add(this.hemi);
    // 캐릭터 렌더의 Key 조명을 대신하는 카메라 쪽 보조광
    this.fill = new THREE.DirectionalLight(0xfff1e0, 0.9);
    this.scene.add(this.fill, this.fill.target);
    this.lights = [];
    this.poolTimer = 0;
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
  }

  async load(id, onProgress = () => {}) {
    const [meta, gltf, pano] = await Promise.all([
      loadJSON(`${BASE}scenes/${id}.json`),
      gltfLoader.loadAsync(`${BASE}scenes/${id}.glb`, (e) => e.total && onProgress(e.loaded / e.total)),
      texLoader.loadAsync(`${BASE}scenes/${id}_pano.jpg`),
    ]);
    this.unload();
    this.id = id;
    this.meta = meta;
    this.grid = meta.grid ? decodeGrid(meta.grid) : null;
    this.nav = Object.fromEntries(Object.entries(meta.nav).map(([k, v]) => [k, { p: new THREE.Vector3(...v.p), dir: v.dir ? new THREE.Vector3(...v.dir) : null }]));
    const look = LOOK[id] ?? LOOK.walkway;
    this.look = look;

    pano.colorSpace = THREE.SRGBColorSpace;
    pano.mapping = THREE.EquirectangularReflectionMapping;
    this.skyMat.map = pano;
    this.skyMat.needsUpdate = true;
    this.panoTex = pano;
    this.envRT = this.pmrem.fromEquirectangular(pano);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = look.env;
    // PMREM(+X 가운데) ↔ 블렌더 파노라마(-Z 가운데) 맞춤
    this.scene.environmentRotation.set(0, Math.PI / 2, 0);

    this.root = gltf.scene;
    this.colliders = [];
    this.meshByName.clear();
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      this.meshByName.set(o.name, o);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        // 원본은 AgX 'Punchy' 룩(채도·대비 강조)으로 렌더됐다. three의 AgX에는 룩이 없어 재질 채도로 맞춘다
        if (m.color && !m.userData.graded) {
          const hsl = {};
          m.color.getHSL(hsl);
          m.color.setHSL(hsl.h, Math.min(1, hsl.s * look.saturation), hsl.l);
          m.userData.graded = true;
        }
        if (m.transparent || m.opacity < 1) {
          m.depthWrite = false;
          m.side = THREE.DoubleSide;
        }
        if (m.emissiveIntensity !== undefined && m.emissive && m.emissive.getHex() !== 0) {
          // 블렌더 발광 세기는 톤매핑 뒤 너무 하얘지므로 부드럽게 줄인다
          m.emissiveIntensity = Math.min(m.emissiveIntensity, 3.5);
        }
      }
      // 큰 불투명 메시만 카메라 충돌에 쓴다
      const opaque = mats.every((m) => !m.transparent);
      o.geometry.computeBoundingSphere();
      if (opaque && o.geometry.boundingSphere.radius * Math.max(...o.getWorldScale(new THREE.Vector3()).toArray()) > 1.2) {
        o.geometry.computeBoundsTree();
        this.colliders.push(o);
      }
    });
    this.scene.add(this.root);

    // 조명
    this.lights = meta.lights.map((l) => ({
      type: l.type,
      pos: new THREE.Vector3(...l.p),
      dir: new THREE.Vector3(...l.dir),
      color: new THREE.Color(...l.color),
      energy: l.energy,
    }));
    const suns = this.lights.filter((l) => l.type === 'SUN').sort((a, b) => b.energy - a.energy);
    if (suns[0]) {
      this.sun.color.copy(suns[0].color);
      this.sun.intensity = suns[0].energy * look.sun;
      this.sunDir = suns[0].dir.clone().normalize();
    } else {
      this.sun.intensity = 0;
      this.sunDir = new THREE.Vector3(0, -1, 0);
    }
    this.pointLights = this.lights.filter((l) => l.type !== 'SUN');
    this.poolTimer = 0;
    this.renderer.toneMappingExposure = look.exposure;
    return this;
  }

  unload() {
    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse((o) => {
        if (o.isMesh) {
          o.geometry.disposeBoundsTree?.();
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
        }
      });
    }
    this.dynamic.clear();
    this.envRT?.dispose();
    this.panoTex?.dispose();
    this.root = null;
  }

  /** 플레이어 가까운 조명만 조명 풀에 배정(셰이더 재컴파일 없이) */
  update(dt, focus) {
    this.sky.position.copy(focus.camera);
    this.sun.position.copy(focus.target).addScaledVector(this.sunDir, -30);
    this.sun.target.position.copy(focus.target);
    this.fill.position.copy(focus.camera).add(new THREE.Vector3(0, 3, 0));
    this.fill.target.position.copy(focus.target);
    this.poolTimer -= dt;
    if (this.poolTimer > 0 || !this.pointLights) return;
    this.poolTimer = 0.25;
    const t = focus.target;
    const ranked = this.pointLights
      .map((l) => ({ l, score: l.energy / (1 + l.pos.distanceToSquared(t)) }))
      .sort((a, b) => b.score - a.score);
    this.pool.forEach((pl, i) => {
      const r = ranked[i];
      if (!r) {
        pl.intensity = 0;
        return;
      }
      pl.position.copy(r.l.pos);
      pl.color.copy(r.l.color);
      // 면광원은 반구로만 퍼지므로 절반 세기
      pl.intensity = r.l.energy * W_TO_CD * (r.l.type === 'AREA' ? 0.5 : 1) * this.look.lights;
    });
  }

  navPoint(name) {
    return this.nav[name]?.p.clone() ?? null;
  }
}
