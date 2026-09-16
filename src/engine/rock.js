// 돌 질감: 구운 지형 재질 위에 요철·굴곡 음영·잔 알갱이를 GPU에서 얹는다.
// 요철을 GLB 정점에 구우면 면의 규칙성이 깨져 Draco 압축이 무너진다(황혼 합류지 5.9MB → 22.8MB).
// 그래서 파일 속 형상은 그대로 두고, 그릴 때 같은 노이즈 장(tools/blender/bake.py의 roughen과
// 같은 파장·방향)으로 정점을 민다. 월드 좌표 하나에 벡터 하나가 정해지므로 맞붙은 조각 사이에 틈이 없다.

const f = (v) => Number(v).toFixed(4);

// (파장 m, 가중치, 방향) — bake.py ROUGH_WAVES와 같은 값
const WAVES = [
  [3.4, 1.0, [0.8, 0.42, 0.43]],
  [2.1, 0.62, [-0.35, 0.86, 0.37]],
  [1.3, 0.38, [0.55, -0.62, 0.56]],
  [0.9, 0.22, [-0.74, -0.3, 0.6]],
];

function fieldGlsl() {
  const wsum = WAVES.reduce((a, [, w]) => a + w, 0);
  const terms = (phase) =>
    WAVES.map(([wl, w, d], i) => {
      const n = Math.hypot(...d);
      const k = (2 * Math.PI) / wl;
      return `sin(dot(p, vec3(${d.map((x) => f(x / n)).join(', ')})) * ${f(k)} + ${f(phase + i * 1.7)}) * ${f(w)}`;
    }).join(' + ');
  return `
    vec3 rockField(vec3 p) {
      return vec3(${terms(0)}, ${terms(2.4)}, ${terms(4.9)}) / ${f(wsum)};
    }`;
}

/**
 * @param {THREE.Material} material  구운 지형 재질(MeshBasicMaterial, 정점 색)
 * @param {{amp:number, shade:number, grain:number, grainScale?:number}} spec
 *   amp 요철 진폭(m) · shade 굴곡 음영 세기 · grain 잔 알갱이 세기 · grainScale 알갱이 밀도(1/m)
 */
export function applyRock(material, { amp = 0.05, shade = 0.12, grain = 0.14, grainScale = 9 }) {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRockWorld;
        varying float vRockH;
        ${fieldGlsl()}`,
      )
      .replace(
        '#include <project_vertex>',
        `{
          vec4 rkW = modelMatrix * vec4(transformed, 1.0);
          vec3 rkN = normalize(mat3(modelMatrix) * normal);
          vec3 rkO = rockField(rkW.xyz);
          rkW.xyz += rkO * ${f(amp)};
          // 법선 방향으로 솟은 곳(+)·꺼진 곳(-)
          vRockH = dot(rkO, rkN);
          vRockWorld = rkW.xyz;
          vec4 mvPosition = viewMatrix * rkW;
          gl_Position = projectionMatrix * mvPosition;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRockWorld;
        varying float vRockH;
        float rkHash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float rkNoise(vec3 x) {
          vec3 i = floor(x);
          vec3 t = fract(x);
          t = t * t * (3.0 - 2.0 * t);
          return mix(mix(mix(rkHash(i), rkHash(i + vec3(1, 0, 0)), t.x), mix(rkHash(i + vec3(0, 1, 0)), rkHash(i + vec3(1, 1, 0)), t.x), t.y),
                     mix(mix(rkHash(i + vec3(0, 0, 1)), rkHash(i + vec3(1, 0, 1)), t.x), mix(rkHash(i + vec3(0, 1, 1)), rkHash(i + vec3(1, 1, 1)), t.x), t.y), t.z);
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          // 굴곡 음영: 솟은 곳은 밝게, 꺼진 곳은 어둡게
          float rkShade = 1.0 + vRockH * ${f(shade)};
          // 잔 알갱이: 정점 간격보다 잘아서 굽기로는 못 담는 돌 표면의 얼룩(두 겹)
          float g = rkNoise(vRockWorld * ${f(grainScale)}) * 0.65 + rkNoise(vRockWorld * ${f(grainScale * 2.7)}) * 0.35;
          outgoingLight *= rkShade * (1.0 + (g - 0.5) * ${f(grain)});
        }
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|rock-${amp}-${shade}-${grain}-${grainScale}`;
  material.needsUpdate = true;
  return material;
}
