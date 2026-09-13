// 360° 3인칭 궤도 카메라: 드래그로 수평 360° 회전·상하 기울기, 휠로 거리, 벽에 가리면 앞으로 당긴다.
import * as THREE from 'three';

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI; // 캐릭터 뒤(+Z 쪽)에서 -Z를 바라봄
    this.pitch = 0.32;
    this.distance = 5.2;
    this.minDistance = 1.6;
    this.maxDistance = 11;
    this.minPitch = -0.12;
    this.maxPitch = 1.25;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.currentDistance = this.distance;
    this.colliders = [];
    this.lookHeight = 0.85;
    this.ray = new THREE.Raycaster();
    this.ray.firstHitOnly = true;
    this._dir = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this.collisionTimer = 0;
    this.blockedDistance = Infinity;
    this.autoYaw = null; // 연출용 목표 각
  }

  /** 카메라가 바라보는 수평 방향(이동 입력 기준) */
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  rotate(dx, dy) {
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy, this.minPitch, this.maxPitch);
    this.autoYaw = null;
  }

  zoom(delta) {
    this.distance = THREE.MathUtils.clamp(this.distance * Math.exp(delta), this.minDistance, this.maxDistance);
  }

  snap(target, yaw = this.yaw) {
    this.target.copy(target);
    this.smoothTarget.copy(target);
    this.yaw = yaw;
    this.currentDistance = this.distance;
    this.blockedDistance = Infinity;
    this.update(0);
  }

  update(dt) {
    if (this.autoYaw !== null) {
      let d = this.autoYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 2.5);
      if (Math.abs(d) < 0.01) this.autoYaw = null;
    }
    this.smoothTarget.lerp(this.target, dt ? Math.min(1, dt * 9) : 1);
    const look = this._pos.copy(this.smoothTarget);
    look.y += this.lookHeight;
    const cp = Math.cos(this.pitch);
    this._dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    // 벽 충돌은 몇 프레임에 한 번만(BVH 광선)
    this.collisionTimer -= dt;
    if (this.colliders.length && this.collisionTimer <= 0) {
      this.collisionTimer = 1 / 20;
      this.ray.set(look, this._dir);
      this.ray.far = this.distance + 0.3;
      const hit = this.ray.intersectObjects(this.colliders, false)[0];
      this.blockedDistance = hit ? Math.max(this.minDistance * 0.5, hit.distance - 0.35) : Infinity;
    }
    const want = Math.min(this.distance, this.blockedDistance);
    // 가려질 때는 빠르게 당기고, 풀릴 때는 천천히 물러난다
    const k = want < this.currentDistance ? 14 : 3;
    this.currentDistance += (want - this.currentDistance) * (dt ? Math.min(1, dt * k) : 1);
    this.camera.position.copy(look).addScaledVector(this._dir, this.currentDistance);
    this.camera.lookAt(look);
  }
}
