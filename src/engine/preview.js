// 내 모습 만들기 미리보기(회전·인사)와 대화 초상 스냅숏. 본 게임 렌더러와 별도의 작은 캔버스를 쓴다.
import * as THREE from 'three';

import { Character } from './character.js';

export class CharacterPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.camera.position.set(0, 0.75, 3.4);
    this.camera.lookAt(0, 0.58, 0);
    const hemi = new THREE.HemisphereLight(0xf4eeff, 0xd9ccf2, 1.4);
    const key = new THREE.DirectionalLight(0xfff1e0, 1.6);
    key.position.set(1.5, 2.5, 3);
    const rim = new THREE.DirectionalLight(0xc9b7ee, 1.1);
    rim.position.set(-2, 1.5, -2);
    this.scene.add(hemi, key, rim);
    this.yaw = 0;
    this.spin = 0.35;
    this.char = null;
    this.running = false;
    this.last = 0;
    let dragging = false;
    let lastX = 0;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      this.spin = 0;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.yaw += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
    });
    const end = () => (dragging = false);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  setCharacter(model, look) {
    if (this.char) this.scene.remove(this.char.object);
    this.char = new Character(model, { height: 1.15 });
    this.char.shadow.visible = false;
    this.char.applyProfile(look);
    this.scene.add(this.char.object);
  }

  wave() {
    this.char?.greet();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    const tick = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
      this.last = now;
      this.yaw += this.spin * dt;
      if (this.char) {
        this.char.setYaw(this.yaw, true);
        this.char.update(dt, 0, now / 1000);
      }
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
  }

  /** 정면 초상(대화창용 dataURL) */
  snapshot(model, look, size = 256) {
    const c = new Character(model, { height: 1.15 });
    c.shadow.visible = false;
    c.applyProfile(look);
    const scene = new THREE.Scene();
    scene.add(...this.scene.children.filter((o) => o.isLight).map((l) => l.clone()));
    scene.add(c.object);
    c.update(0, 0, 0);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    cam.position.set(0, 0.8, 2.3);
    cam.lookAt(0, 0.72, 0);
    const prevSize = this.renderer.getSize(new THREE.Vector2());
    const prevRatio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.renderer.render(scene, cam);
    const url = this.canvas.toDataURL('image/png');
    this.renderer.setPixelRatio(prevRatio);
    this.renderer.setSize(prevSize.x, prevSize.y, false);
    return url;
  }
}
