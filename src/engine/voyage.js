// 해파리 항해 연출: 블렌더 우주 해파리 정원(voyage.glb + space_pano.jpg)을 실제 3D로 그리고,
// 헤엄(갓 수축 → 밀려 나감 → 촉수 물결, 떠 있는 섬이 스쳐 지나감)과 카메라 선회를 코드로 만든다.
import * as THREE from 'three';

import { glowTexture } from './props.js';
import { BASE, gltfLoader } from './world.js';

// 반투명 막(블렌더 재질 값, 선형): 가운데는 비치고 가장자리는 밝고 짙게
// 색은 참고 일러스트처럼 화사한 파스텔: 라일락 막, 살구빛 가장자리, 민트빛 결정
const MEMBRANE = {
  Jelly_Bell: { base: [0.66, 0.44, 1.0], rim: [1.0, 0.58, 0.86], alpha: [0.14, 0.66], glow: 0.55, sat: 1.35 },
  Jelly_Rim: { base: [0.96, 0.52, 0.94], rim: [1.0, 0.66, 0.52], alpha: [0.34, 0.88], glow: 0.62, sat: 1.35 },
  Jelly_Tentacle: { base: [0.56, 0.36, 1.0], rim: [1.0, 0.56, 0.78], alpha: [0.26, 0.76], glow: 0.6, sat: 1.35 },
  Lantern_Pod: { base: [1.0, 0.84, 0.6], rim: [1.0, 0.62, 0.32], alpha: [0.55, 0.98], glow: 1.15, sat: 1.2 },
  Crystal: { base: [0.54, 0.99, 0.94], rim: [0.8, 1.0, 0.98], alpha: [0.55, 0.95], glow: 0.95, sat: 1.25 },
};
// 구운 부분(정원·섬)·하늘: 곱해서 띄우기만 하면 색이 빠지므로, 띄움을 줄이고 채도를 함께 올린다
const BRIGHT = { baked: 1.18, sky: 1.12, lift: [0.012, 0.01, 0.034], sat: { baked: 1.46, sky: 1.5 } };

// 촉수 물결(해파리 루트 로컬 좌표). 촉수는 갓 아래(0,-0.7)에서 +x·-y로 흘러내린다
const WAVE_GLSL = /* glsl */ `
uniform float uTime;
uniform float uThrust;
uniform float uLen;
vec3 tentacleWave(vec3 p) {
  float s = length(vec2(p.x, min(p.y + 0.7, 0.0)));
  float a = pow(clamp(s / uLen, 0.0, 1.0), 1.35);
  vec3 q = p;
  q.y += sin(uTime * 1.7 - s * 0.42 + p.z * 0.5) * 1.15 * a;
  q.z += sin(uTime * 1.2 - s * 0.36 + p.x * 0.08) * 0.9 * a;
  q.x += uThrust * 0.9 * a;
  return q;
}
`;

function waveCPU(p, time, thrust, len, out) {
  const s = Math.hypot(p.x, Math.min(p.y + 0.7, 0));
  const a = Math.pow(THREE.MathUtils.clamp(s / len, 0, 1), 1.35);
  out.set(p.x + thrust * 0.9 * a, p.y + Math.sin(time * 1.7 - s * 0.42 + p.z * 0.5) * 1.15 * a, p.z + Math.sin(time * 1.2 - s * 0.36 + p.x * 0.08) * 0.9 * a);
  return out;
}

function membraneMaterial(spec, uniforms, wave) {
  const lin = (c) => new THREE.Vector3(...c);
  return new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,
      uBase: { value: lin(spec.base) },
      uRim: { value: lin(spec.rim) },
      uAlpha: { value: new THREE.Vector2(...spec.alpha) },
      uGlow: { value: spec.glow },
      uSat: { value: spec.sat ?? 1 },
    },
    vertexShader: /* glsl */ `
      ${WAVE_GLSL}
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec3 p = ${wave ? 'tentacleWave(position)' : 'position'};
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase;
      uniform vec3 uRim;
      uniform vec2 uAlpha;
      uniform float uGlow;
      uniform float uSat;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        vec3 col = mix(uBase, uRim, f) * (0.6 + uGlow * (0.4 + f));
        // 밝아질수록 흰색으로 뭉개지던 것을 막고 색조를 살린다
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = max(vec3(0.0), mix(vec3(l), col, uSat));
        col /= 1.0 + max(l - 0.92, 0.0);
        gl_FragColor = vec4(col, mix(uAlpha.x, uAlpha.y, f));
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** 갓 수축 곡선: 짧게 오므렸다(0→1) 천천히 풀린다 */
function pulseAt(t, period = 3.0) {
  const u = (t % period) / period;
  return u < 0.22 ? THREE.MathUtils.smoothstep(u, 0, 0.22) : Math.exp(-(u - 0.22) * 5.5);
}

let assets = null;
export function loadVoyageAssets() {
  assets ??= Promise.all([
    gltfLoader.loadAsync(`${BASE}voyage/voyage.glb`),
    new THREE.TextureLoader().loadAsync(`${BASE}voyage/space_pano.jpg`),
    fetch(`${BASE}voyage/voyage.json`).then((r) => r.json()),
  ]).catch((e) => {
    assets = null;
    throw e;
  });
  return assets;
}

export class VoyageScene {
  constructor(gltf, pano, meta) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 2000);
    this.meta = meta;
    this.uniforms = { uTime: { value: 0 }, uThrust: { value: 0 }, uLen: { value: meta.tentacleLength ?? 18 } };

    pano.colorSpace = THREE.SRGBColorSpace;
    const skyMat = new THREE.MeshBasicMaterial({ map: pano, side: THREE.BackSide, depthWrite: false, toneMapped: false });
    this.brighten(skyMat, BRIGHT.sky, 1.4, false, BRIGHT.sat.sky);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), skyMat);
    sky.scale.x = -1;
    sky.rotation.y = -Math.PI / 2;
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.sky = sky;
    this.scene.add(sky);

    const root = gltf.scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.islands = [];
    const jelly = root.getObjectByName('Jellyfish_Root');
    this.jelly = jelly;
    this.bell = root.getObjectByName('JF_Bell');
    this.tentacles = root.getObjectByName('JF_Tentacles');
    root.traverse((o) => {
      if (!o.isMesh) return;
      const inTentacles = !!this.tentacles && (o === this.tentacles || o.parent === this.tentacles);
      const m = o.material;
      const spec = MEMBRANE[m.name];
      if (spec) {
        o.material = membraneMaterial(spec, this.uniforms, inTentacles);
        o.renderOrder = 2;
      } else {
        o.material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
        this.brighten(o.material, BRIGHT.baked, 1, inTentacles, BRIGHT.sat.baked);
      }
      m.dispose();
      o.frustumCulled = false;
    });
    // 섬은 해파리 곁을 스쳐 지나가도록 따로 움직인다
    for (const o of [...root.children]) {
      if (!o.name.startsWith('Island_')) continue;
      // 카메라가 도는 반경(해파리에서 약 30m) 안쪽 섬은 바깥으로 밀어 화면을 가리지 않게
      const home = o.position.clone();
      const r = Math.hypot(home.x, home.z);
      if (r < 34) home.multiplyScalar(34 / Math.max(r, 1)).setY(o.position.y);
      o.position.copy(home);
      this.islands.push({ o, home });
    }
    this.root.add(root);

    // 빛 번짐: 촉수 구슬(물결을 따라 움직임)·정원 조명
    const beadGeo = new THREE.BufferGeometry();
    this.beadRest = (meta.beads ?? []).map((p) => new THREE.Vector3(...p));
    beadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.beadRest.length * 3), 3));
    // 갓 전체를 감싸는 은은한 빛무리(참고 일러스트의 화사한 발광)
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#B486FF', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.15 }));
    this.halo.position.set(0, 1.2, 0);
    this.halo.scale.setScalar(15);
    this.halo.renderOrder = 1;
    this.bell?.add(this.halo);
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#FFC77E', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.34 }));
    this.core.position.set(0, 1.4, 0);
    this.core.scale.setScalar(5);
    this.bell?.add(this.core);
    this.beads = new THREE.Points(beadGeo, new THREE.PointsMaterial({ map: glowTexture(), color: '#FFD4A6', size: 1.25, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.beads.frustumCulled = false;
    jelly?.add(this.beads);
    this.glows = (meta.lights ?? []).map((l) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color().setRGB(...l.color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.55 }));
      s.position.set(...l.p);
      s.scale.setScalar(l.energy > 100 ? 5.5 : 2.2);
      this.bell?.add(s);
      return s;
    });
    this.time = 0;
    this.travel = new THREE.Vector3();
    // 머리 방향(촉수 반대): -x, 살짝 위
    this.heading = new THREE.Vector3(-1, 0.28, 0).normalize();
    this._v = new THREE.Vector3();
  }

  /** 화사하게: 색 × gain + 라일락 띄움(liftK배) + 채도 올리기, wave면 촉수 물결도 넣는다 */
  brighten(material, gain, liftK = 1, wave = false, sat = 1) {
    const [lr, lg, lb] = BRIGHT.lift.map((v) => v * liftK);
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      if (wave) {
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${WAVE_GLSL}`).replace('#include <begin_vertex>', 'vec3 transformed = tentacleWave(vec3(position));');
      }
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `outgoingLight = outgoingLight * ${gain.toFixed(3)} + vec3(${lr.toFixed(3)}, ${lg.toFixed(3)}, ${lb.toFixed(3)});\n#include <opaque_fragment>`,
      );
    };
    material.customProgramCacheKey = () => `voy-${gain}-${liftK}-${wave}`;
  }

  /** k: 0~1 진행, tint: 목적지 색 */
  start(duration) {
    this.time = 0;
    this.duration = duration;
    this.travel.set(0, 0, 0);
  }

  update(dt, aspect) {
    const t = (this.time += dt);
    const k = Math.min(1, t / (this.duration || 12));
    const pulse = pulseAt(t + 0.4);
    this.uniforms.uTime.value = t;
    // 수축하는 순간 앞으로 밀려 나가고, 촉수는 뒤로 끌린다
    this.uniforms.uThrust.value += (pulse - this.uniforms.uThrust.value) * Math.min(1, dt * 3);
    if (this.bell) this.bell.scale.set(1 - pulse * 0.07, 1 + pulse * 0.045, 1 - pulse * 0.07);
    const speed = 2.2 + pulse * 5.5 + k * 3;
    this.travel.addScaledVector(this.heading, speed * dt);
    if (this.jelly) {
      this.jelly.rotation.z = -0.22 + Math.sin(t * 0.7) * 0.03;
      this.jelly.rotation.x = Math.sin(t * 0.5) * 0.04;
      this.jelly.position.y = Math.sin(t * 0.9) * 0.25;
    }
    // 섬: 해파리가 나아간 만큼 반대로 흘러가고, 멀어지면 앞쪽으로 돌아온다
    for (const is of this.islands) {
      const p = this._v.copy(is.home).sub(this.travel);
      const along = p.dot(this.heading);
      if (along < -70) is.home.addScaledVector(this.heading, 140);
      is.o.position.copy(is.home).sub(this.travel);
      is.o.rotation.y += dt * 0.03;
    }
    // 구슬 빛: 셰이더와 같은 물결
    const pos = this.beads.geometry.attributes.position;
    const len = this.uniforms.uLen.value;
    for (let i = 0; i < this.beadRest.length; i++) {
      waveCPU(this.beadRest[i], t, this.uniforms.uThrust.value, len, this._v);
      pos.setXYZ(i, this._v.x, this._v.y, this._v.z);
    }
    pos.needsUpdate = true;
    this.beads.material.size = 1.15 + pulse * 0.4;
    this.halo.material.opacity = 0.12 + pulse * 0.06;
    this.core.material.opacity = 0.24 + pulse * 0.12;
    for (const [i, g] of this.glows.entries()) g.material.opacity = 0.36 + pulse * 0.2 + Math.sin(t * 2 + i) * 0.05;

    // 카메라: 해파리 둘레를 한 방향으로 돌면서 조금씩 다가가(클로즈업) 끝에는 갓 속 정원이 화면을 채운다
    const Y0 = 2; // 해파리 루트 높이
    const ease = k * k * (3 - 2 * k);
    const orbit = -0.75 + ease * 1.5;
    const dist = THREE.MathUtils.lerp(28, 16, ease);
    const cam = this.camera;
    cam.aspect = aspect;
    cam.position.set(Math.sin(orbit) * dist, Y0 + THREE.MathUtils.lerp(1.5, 4.5, ease), Math.cos(orbit) * dist);
    cam.position.y += Math.sin(t * 0.6) * 0.25;
    // 처음엔 촉수까지 담고, 다가갈수록 시선이 갓 쪽으로 올라간다
    const target = new THREE.Vector3(THREE.MathUtils.lerp(4.5, 0.6, ease), THREE.MathUtils.lerp(Y0 - 3.2, Y0 - 0.2, ease), 0);
    cam.lookAt(target);
    cam.fov = THREE.MathUtils.lerp(46, 40, ease);
    cam.updateProjectionMatrix();
    this.sky.position.copy(cam.position);
    return { k, pulse };
  }
}
