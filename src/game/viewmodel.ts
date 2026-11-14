import * as THREE from 'three'
import { createKatana, SLASH_TIME } from './avatar'

/** First-person katana and forearm attached to the camera. */
export class ViewModel {
  group = new THREE.Group()
  private pivot = new THREE.Group()
  private trail: THREE.Mesh
  private bobT = 0
  private slashT = -1
  private side = 1
  private sway = new THREE.Vector2()
  private parryT = -1

  constructor(color: string) {
    this.group.add(this.pivot)
    this.pivot.position.set(0.32, -0.34, -0.55)
    const sleeve = new THREE.MeshStandardMaterial({ color: '#1c1b26', roughness: 0.85 })
    const band = new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.3) })
    const skin = new THREE.MeshStandardMaterial({ color: '#d9b08c', roughness: 0.7 })
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.5), sleeve)
    arm.position.set(0.06, -0.06, 0.25)
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.06), band)
    cuff.position.set(0.06, -0.06, 0.02)
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), skin)
    fist.position.set(0.03, -0.03, -0.05)
    this.pivot.add(arm, cuff, fist)
    const katana = createKatana()
    katana.rotation.x = 0.95
    katana.position.set(0.03, -0.02, -0.05)
    this.pivot.add(katana)
    this.group.traverse((o) => {
      o.castShadow = false
      o.renderOrder = 5
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      if (m) m.depthTest = true
    })

    const arc = new THREE.RingGeometry(0.75, 1.15, 32, 1, 0, Math.PI * 0.95)
    this.trail = new THREE.Mesh(
      arc,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.6),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    this.trail.position.set(0, -0.05, -1.1)
    this.group.add(this.trail)
  }

  /** Raise the blade crosswise in front of you to block. */
  parry() {
    this.parryT = 0
    this.slashT = -1
  }

  slash(side: number) {
    this.slashT = 0
    this.side = side
  }

  update(dt: number, speedH: number, onGround: boolean, mouseDX: number, mouseDY: number) {
    this.bobT += dt * (onGround ? 2 + speedH * 0.8 : 0)
    const bobAmt = onGround ? Math.min(1, speedH / 9) * 0.02 : 0
    this.sway.x += (THREE.MathUtils.clamp(-mouseDX * 0.0006, -0.06, 0.06) - this.sway.x) * Math.min(1, dt * 10)
    this.sway.y += (THREE.MathUtils.clamp(mouseDY * 0.0006, -0.06, 0.06) - this.sway.y) * Math.min(1, dt * 10)

    let rx = 0.1,
      ry = 0.15,
      rz = 0.25,
      px = 0.32,
      py = -0.34,
      pz = -0.55
    const trailMat = this.trail.material as THREE.MeshBasicMaterial
    trailMat.opacity = 0
    if (this.slashT >= 0) {
      this.slashT += dt
      const p = this.slashT / SLASH_TIME
      const s = this.side
      if (p >= 1) this.slashT = -1
      else if (p < 0.2) {
        const k = p / 0.2
        rz = THREE.MathUtils.lerp(0.25, s > 0 ? -0.7 : 1.3, k)
        rx = THREE.MathUtils.lerp(0.1, -0.2, k)
        px = THREE.MathUtils.lerp(0.32, s > 0 ? 0.42 : 0.1, k)
        py = THREE.MathUtils.lerp(-0.34, -0.2, k)
      } else if (p < 0.55) {
        const k = (p - 0.2) / 0.35
        const e = 1 - Math.pow(1 - k, 3)
        rz = THREE.MathUtils.lerp(s > 0 ? -0.7 : 1.3, s > 0 ? 2.0 : -1.2, e)
        rx = THREE.MathUtils.lerp(-0.2, -0.9, Math.sin(e * Math.PI))
        ry = THREE.MathUtils.lerp(0.15, s > 0 ? 0.9 : -0.5, e)
        px = THREE.MathUtils.lerp(s > 0 ? 0.42 : 0.1, s > 0 ? -0.2 : 0.45, e)
        py = THREE.MathUtils.lerp(-0.2, -0.42, e)
        pz = -0.6 - Math.sin(e * Math.PI) * 0.15
        trailMat.opacity = 0.75 * Math.sin(k * Math.PI)
        this.trail.rotation.z = s > 0 ? -0.5 : Math.PI + 0.5
        this.trail.scale.set(1, 0.55, 1)
      } else {
        const k = (p - 0.55) / 0.45
        const e = k * k * (3 - 2 * k)
        rz = THREE.MathUtils.lerp(s > 0 ? 2.0 : -1.2, 0.25, e)
        rx = THREE.MathUtils.lerp(-0.2, 0.1, e)
        ry = THREE.MathUtils.lerp(s > 0 ? 0.9 : -0.5, 0.15, e)
        px = THREE.MathUtils.lerp(s > 0 ? -0.2 : 0.45, 0.32, e)
        py = THREE.MathUtils.lerp(-0.42, -0.34, e)
      }
    }

    if (this.parryT >= 0) {
      this.parryT += dt
      const k = this.parryT < 0.08 ? this.parryT / 0.08 : this.parryT > 0.35 ? Math.max(0, 1 - (this.parryT - 0.35) / 0.15) : 1
      if (this.parryT > 0.5) this.parryT = -1
      rx = THREE.MathUtils.lerp(rx, 0.15, k)
      ry = THREE.MathUtils.lerp(ry, 0.1, k)
      rz = THREE.MathUtils.lerp(rz, 1.45, k)
      px = THREE.MathUtils.lerp(px, 0.12, k)
      py = THREE.MathUtils.lerp(py, -0.12, k)
      pz = THREE.MathUtils.lerp(pz, -0.5, k)
    }
    this.pivot.rotation.set(rx + this.sway.y, ry + this.sway.x, rz)
    this.pivot.position.set(
      px + Math.cos(this.bobT) * bobAmt + this.sway.x,
      py + Math.abs(Math.sin(this.bobT)) * bobAmt + (onGround ? 0 : 0.02),
      pz,
    )
  }
}
