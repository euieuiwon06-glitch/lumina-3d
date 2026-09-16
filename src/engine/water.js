// 물: 구운 정점 색을 물빛으로 쓰고, 그 위에 잔물결·하늘 비침·햇빛 반짝임을 얹는다.
// 굽기만으로는 물이 단색 판이 되어 버려서(반사·비침은 정적 정점 색에 담기지 않는다) 셰이더로 그린다.
import * as THREE from 'three';

/**
 * @param {THREE.Texture} pano  하늘 파노라마(등장방형). 비치는 하늘을 여기서 뽑는다
 * @param {object} look  { reflect, ripple, alpha: [얕게 볼 때, 스치듯 볼 때], tint, sparkle }
 */
export function createWaterMaterial(pano, look = {}) {
  const {
    reflect = 0.85, // 하늘이 비치는 정도(가장자리 기준)
    ripple = 1, // 잔물결 세기
    scale = 0.55, // 잔물결 크기(1/m)
    speed = 1, // 잔물결 속도
    alpha = [0.62, 0.97], // 위에서 볼 때(바닥 비침) → 스치듯 볼 때(하늘 반사)
    tint = [1.02, 1.0, 1.06], // 물빛 보정
    deep = 0.82, // 깊은 쪽(바로 내려다보는 쪽) 물빛 진하기
    sparkle = 0.6, // 햇빛 반짝임
    skyYaw = Math.PI / 2, // 하늘 파노라마 회전 맞춤(장면 environmentRotation과 같은 값)
  } = look;

  const uniforms = {
    uTime: { value: 0 },
    uPano: { value: pano },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uReflect: { value: reflect },
    uRipple: { value: ripple },
    uScale: { value: scale },
    uSpeed: { value: speed },
    uAlpha: { value: new THREE.Vector2(...alpha) },
    uTint: { value: new THREE.Vector3(...tint) },
    uDeep: { value: deep },
    uSparkle: { value: sparkle },
    uSkyYaw: { value: skyYaw },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uPano;
      uniform vec3 uSun;
      uniform vec3 uSunColor;
      uniform float uReflect;
      uniform float uRipple;
      uniform float uScale;
      uniform float uSpeed;
      uniform vec2 uAlpha;
      uniform vec3 uTint;
      uniform float uDeep;
      uniform float uSparkle;
      uniform float uSkyYaw;
      varying vec3 vWorld;
      varying vec3 vColor;

      // 물결 높이장: 방향이 다른 파도를 겹쳐 규칙적으로 보이지 않게 한다.
      // 큰 너울 네 겹 + 가까이서 보이는 잔결 세 겹
      float waves(vec2 p, float t) {
        float h = 0.0;
        h += sin(dot(p, vec2(0.92, 0.39)) * 1.00 + t * 0.85);
        h += sin(dot(p, vec2(-0.45, 0.89)) * 1.63 - t * 1.13) * 0.72;
        h += sin(dot(p, vec2(0.71, -0.70)) * 2.71 + t * 1.57) * 0.41;
        h += sin(dot(p, vec2(-0.99, -0.16)) * 4.33 - t * 2.11) * 0.22;
        h += sin(dot(p, vec2(0.34, 0.94)) * 7.90 + t * 2.90) * 0.13;
        h += sin(dot(p, vec2(-0.86, 0.51)) * 12.70 - t * 3.70) * 0.08;
        h += sin(dot(p, vec2(0.98, -0.20)) * 19.30 + t * 4.60) * 0.05;
        return h * 0.42;
      }

      // 높이장의 기울기로 법선을 만든다
      vec3 rippleNormal(vec2 p, float t) {
        float e = 0.16;
        float h = waves(p, t);
        float hx = waves(p + vec2(e, 0.0), t);
        float hz = waves(p + vec2(0.0, e), t);
        return normalize(vec3(-(hx - h) / e, 1.0 / max(uRipple, 0.0001), -(hz - h) / e));
      }

      vec2 equirect(vec3 d) {
        float c = cos(uSkyYaw), s = sin(uSkyYaw);
        vec3 r = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
        return vec2(atan(r.z, r.x) * 0.15915494 + 0.5, asin(clamp(r.y, -1.0, 1.0)) * 0.31830989 + 0.5);
      }

      void main() {
        vec2 p = vWorld.xz * uScale;
        float t = uTime * uSpeed;
        vec3 n = rippleNormal(p, t);
        vec3 v = normalize(cameraPosition - vWorld);
        float facing = clamp(dot(n, v), 0.0, 1.0);
        // 스치듯 볼수록 하늘이 비치고, 내려다볼수록 물속이 보인다
        float fres = pow(1.0 - facing, 3.2);

        vec3 body = vColor * uTint;
        // 바로 내려다보는 곳은 물빛을 조금 더 진하게(깊이감)
        body *= mix(uDeep, 1.0, fres);
        // 물결이 빛을 받는 쪽은 밝게, 골은 어둡게 — 단색 판처럼 보이지 않게
        float crest = waves(p, t);
        body *= 1.0 + crest * 0.17 * uRipple;

        // 하늘은 비치되 물빛을 완전히 덮지는 않게 섞는다
        vec3 sky = texture2D(uPano, equirect(reflect(-v, n))).rgb;
        vec3 col = mix(body, mix(body, sky, 0.62), fres * uReflect);

        // 잔물결 위 햇빛 반짝임
        float spec = pow(max(dot(reflect(-v, n), normalize(uSun)), 0.0), 220.0);
        col += uSunColor * spec * uSparkle;

        gl_FragColor = vec4(col, mix(uAlpha.x, uAlpha.y, fres));
        #include <colorspace_fragment>
      }`,
  });
  material.vertexColors = true;
  material.userData.waterUniforms = uniforms;
  return material;
}
