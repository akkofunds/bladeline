import * as THREE from 'three'

/**
 * Low-poly ninja built from boxes, animated procedurally:
 * walk/run cycle, airborne tuck, alternating katana slashes, grapple reach and a death fall.
 * The avatar faces local -Z so `root.rotation.y = yaw` lines it up with the camera.
 */

export interface AvatarPose {
  speedH: number
  onGround: boolean
  vy: number
  pitch: number
  slashT: number // seconds since slash started, <0 when idle
  slashSide: number // 1 or -1
  grappling: boolean
  alive: boolean
}

export const SLASH_TIME = 0.34

function part(w: number, h: number, d: number, mat: THREE.Material, y = -h / 2) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.y = y
  m.castShadow = true
  return m
}

export function createKatana(bladeMat?: THREE.Material) {
  const g = new THREE.Group()
  const wrap = new THREE.MeshStandardMaterial({ color: '#1a1420', roughness: 0.9 })
  const gold = new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.8, roughness: 0.35 })
  const blade =
    bladeMat ??
    new THREE.MeshStandardMaterial({
      color: '#e8edf5',
      metalness: 1,
      roughness: 0.15,
      emissive: new THREE.Color('#3a4250'),
    })
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.3), wrap)
  handle.position.z = 0.02
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10), gold)
  guard.rotation.x = Math.PI / 2
  guard.position.z = -0.14
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.055, 1.0), blade)
  b.position.z = -0.65
  b.position.y = 0.01
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.12, 4), blade)
  tip.rotation.x = -Math.PI / 2
  tip.position.z = -1.2
  tip.position.y = 0.01
  tip.scale.set(0.6, 1, 1)
  for (const m of [handle, guard, b, tip]) {
    m.castShadow = true
    g.add(m)
  }
  return g
}

export class Avatar {
  root = new THREE.Group()
  private body = new THREE.Group()
  private hips = new THREE.Group()
  private chest = new THREE.Group()
  private head = new THREE.Group()
  private armL = new THREE.Group()
  private armR = new THREE.Group()
  private elbowL = new THREE.Group()
  private elbowR = new THREE.Group()
  private legL = new THREE.Group()
  private legR = new THREE.Group()
  private kneeL = new THREE.Group()
  private kneeR = new THREE.Group()
  private scarf = new THREE.Group()
  private trail: THREE.Mesh
  private label: THREE.Sprite
  private labelCanvas = document.createElement('canvas')
  private phase = 0
  private deadT = 0
  private lastLabel = ''
  private labelOn = true

  constructor(
    public name: string,
    public color: string,
  ) {
    const cloth = new THREE.MeshStandardMaterial({ color: '#1c1b26', roughness: 0.85 })
    const clothLight = new THREE.MeshStandardMaterial({ color: '#2b2a3a', roughness: 0.8 })
    const accent = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      emissive: new THREE.Color(color).multiplyScalar(0.35),
    })
    const skin = new THREE.MeshStandardMaterial({ color: '#d9b08c', roughness: 0.7 })

    this.root.add(this.body)
    this.body.add(this.hips)
    this.hips.position.y = 0.92

    // torso
    this.hips.add(this.chest)
    this.chest.add(part(0.46, 0.62, 0.26, cloth, 0.31))
    const belt = part(0.48, 0.08, 0.28, accent, 0.04)
    this.chest.add(belt)
    const chestPlate = part(0.36, 0.28, 0.04, clothLight, 0.44)
    chestPlate.position.z = -0.14
    this.chest.add(chestPlate)

    // head
    this.head.position.y = 0.66
    this.chest.add(this.head)
    this.head.add(part(0.28, 0.3, 0.28, cloth, 0.17))
    const face = part(0.2, 0.08, 0.02, skin, 0.2)
    face.position.z = -0.145
    this.head.add(face)
    const band = part(0.3, 0.06, 0.3, accent, 0.27)
    this.head.add(band)
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
    for (const x of [-0.05, 0.05]) {
      const eye = part(0.035, 0.02, 0.01, eyeMat, 0.2)
      eye.position.set(x, 0.2, -0.157)
      this.head.add(eye)
    }

    // scarf tail
    this.scarf.position.set(0, 0.56, 0.14)
    this.chest.add(this.scarf)
    const tail = part(0.12, 0.04, 0.55, accent, 0)
    tail.position.z = 0.27
    this.scarf.add(tail)

    // arms
    for (const [arm, elbow, side] of [
      [this.armL, this.elbowL, -1],
      [this.armR, this.elbowR, 1],
    ] as const) {
      arm.position.set(side * 0.3, 0.58, 0)
      this.chest.add(arm)
      arm.add(part(0.13, 0.32, 0.13, cloth))
      elbow.position.y = -0.32
      arm.add(elbow)
      elbow.add(part(0.11, 0.3, 0.11, clothLight))
      const hand = part(0.1, 0.1, 0.1, skin, -0.33)
      elbow.add(hand)
    }
    const katana = createKatana()
    katana.position.set(0, -0.36, 0)
    katana.rotation.x = -0.15 // blade sticks out of the fist, perpendicular to the forearm
    this.elbowR.add(katana)

    // legs
    for (const [leg, knee, side] of [
      [this.legL, this.kneeL, -1],
      [this.legR, this.kneeR, 1],
    ] as const) {
      leg.position.set(side * 0.12, 0, 0)
      this.hips.add(leg)
      leg.add(part(0.16, 0.46, 0.17, cloth))
      knee.position.y = -0.46
      leg.add(knee)
      knee.add(part(0.14, 0.44, 0.15, clothLight))
      const foot = part(0.15, 0.08, 0.24, accent, -0.42)
      foot.position.z = -0.04
      knee.add(foot)
    }

    // slash trail arc (shown briefly during strikes)
    const arc = new THREE.RingGeometry(0.9, 1.5, 24, 1, -Math.PI * 0.15, Math.PI * 1.1)
    this.trail = new THREE.Mesh(
      arc,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    this.trail.position.set(0, 1.3, -0.4)
    this.trail.rotation.x = -Math.PI / 2
    this.root.add(this.trail)

    // name plate
    this.labelCanvas.width = 256
    this.labelCanvas.height = 64
    const tex = new THREE.CanvasTexture(this.labelCanvas)
    tex.colorSpace = THREE.SRGBColorSpace
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }))
    this.label.scale.set(2, 0.5, 1)
    this.label.position.y = 2.35
    this.label.renderOrder = 10
    this.root.add(this.label)
    this.drawLabel(100)
  }

  drawLabel(hp: number) {
    const key = `${this.name}|${Math.ceil(hp)}`
    if (key === this.lastLabel) return
    this.lastLabel = key
    const c = this.labelCanvas
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    g.font = 'bold 26px system-ui, sans-serif'
    g.textAlign = 'center'
    g.lineWidth = 5
    g.strokeStyle = 'rgba(0,0,0,0.75)'
    g.strokeText(this.name, 128, 28)
    g.fillStyle = this.color
    g.fillText(this.name, 128, 28)
    g.fillStyle = 'rgba(0,0,0,0.6)'
    g.fillRect(48, 42, 160, 12)
    g.fillStyle = hp > 50 ? '#7dff9b' : hp > 25 ? '#ffd24a' : '#ff4d5e'
    g.fillRect(50, 44, Math.max(0, (156 * hp) / 100), 8)
    ;(this.label.material.map as THREE.Texture).needsUpdate = true
  }

  setLabelVisible(v: boolean) {
    this.labelOn = v
    this.label.visible = v
  }

  update(dt: number, pose: AvatarPose) {
    const ease = (cur: number, target: number, k = 14) => cur + (target - cur) * Math.min(1, dt * k)

    // death fall
    if (!pose.alive) {
      this.deadT = Math.min(1, this.deadT + dt * 2.5)
      this.body.rotation.x = -this.deadT * (Math.PI / 2)
      this.body.position.y = -this.deadT * 0.1
      this.label.visible = false
      return
    }
    if (this.deadT > 0) {
      this.deadT = 0
      this.body.rotation.x = 0
      this.body.position.y = 0
      this.label.visible = this.labelOn
    }

    const run = Math.min(1, pose.speedH / 8.5)
    let thighL = 0,
      thighR = 0,
      kneeL = 0,
      kneeR = 0,
      armLx = 0,
      armRx = 0.5,
      armRz = 0,
      elbowRx = 0.9,
      elbowLx = 0.3,
      armLz = -0.1,
      lean = 0,
      twist = 0,
      bob = 0

    if (pose.onGround) {
      this.phase += dt * (4 + pose.speedH * 0.9)
      const s = Math.sin(this.phase)
      const c = Math.cos(this.phase)
      thighL = s * 0.9 * run
      thighR = -s * 0.9 * run
      kneeL = Math.max(0, -c) * 1.3 * run + 0.05
      kneeR = Math.max(0, c) * 1.3 * run + 0.05
      armLx = -s * 0.8 * run
      armRx = 0.5 + s * 0.3 * run
      lean = 0.25 * run
      bob = Math.abs(c) * 0.06 * run
    } else {
      // airborne tuck — knees up, arms out for balance
      const rising = pose.vy > 0 ? 1 : 0.6
      thighL = 0.9 * rising
      thighR = 0.4 * rising
      kneeL = 1.4 * rising
      kneeR = 1.0
      armLx = 0.6
      armLz = -0.9
      armRx = 0.9
      lean = 0.15
    }

    if (pose.grappling) {
      armLx = Math.PI / 2 + pose.pitch + 0.2
      armLz = 0
      elbowLx = 0
    }

    // Slash: windup above the shoulder, fast diagonal strike, recover
    if (pose.slashT >= 0 && pose.slashT < SLASH_TIME) {
      const p = pose.slashT / SLASH_TIME
      const side = pose.slashSide
      if (p < 0.25) {
        const k = p / 0.25
        armRx = THREE.MathUtils.lerp(0.5, 2.7, k)
        armRz = side * 0.6 * k
        elbowRx = 0.9 + 0.6 * k
        twist = side * 0.5 * k
      } else if (p < 0.6) {
        const k = (p - 0.25) / 0.35
        const e = 1 - Math.pow(1 - k, 3)
        armRx = THREE.MathUtils.lerp(2.7, 0.4, e)
        armRz = side * THREE.MathUtils.lerp(0.6, -1.0, e)
        elbowRx = THREE.MathUtils.lerp(1.5, 0.1, e)
        twist = side * THREE.MathUtils.lerp(0.5, -0.7, e)
      } else {
        const k = (p - 0.6) / 0.4
        armRx = THREE.MathUtils.lerp(0.4, 0.5, k)
        armRz = side * THREE.MathUtils.lerp(-1.0, 0, k)
        elbowRx = THREE.MathUtils.lerp(0.1, 0.9, k)
        twist = side * THREE.MathUtils.lerp(-0.7, 0, k)
      }
      const trailOn = p > 0.22 && p < 0.7
      const mat = this.trail.material as THREE.MeshBasicMaterial
      mat.opacity = trailOn ? 0.7 * (1 - Math.abs(p - 0.42) / 0.3) : 0
      this.trail.rotation.y = side * 0.3
      this.trail.scale.x = side
    } else {
      ;(this.trail.material as THREE.MeshBasicMaterial).opacity = 0
    }

    this.legL.rotation.x = ease(this.legL.rotation.x, thighL)
    this.legR.rotation.x = ease(this.legR.rotation.x, thighR)
    this.kneeL.rotation.x = ease(this.kneeL.rotation.x, -kneeL)
    this.kneeR.rotation.x = ease(this.kneeR.rotation.x, -kneeR)
    this.armL.rotation.x = ease(this.armL.rotation.x, armLx)
    this.armL.rotation.z = ease(this.armL.rotation.z, armLz)
    this.elbowL.rotation.x = ease(this.elbowL.rotation.x, elbowLx)
    const fast = pose.slashT >= 0 && pose.slashT < SLASH_TIME ? 40 : 14
    this.armR.rotation.x = ease(this.armR.rotation.x, armRx, fast)
    this.armR.rotation.z = ease(this.armR.rotation.z, armRz, fast)
    this.elbowR.rotation.x = ease(this.elbowR.rotation.x, elbowRx, fast)
    this.chest.rotation.x = ease(this.chest.rotation.x, -lean)
    this.chest.rotation.y = ease(this.chest.rotation.y, twist, fast)
    this.head.rotation.x = ease(this.head.rotation.x, THREE.MathUtils.clamp(pose.pitch, -0.8, 0.8) + lean * 0.8)
    this.hips.position.y = 0.92 + bob - (pose.onGround ? 0 : 0.08)
    this.scarf.rotation.x = ease(this.scarf.rotation.x, 0.5 - Math.min(1, pose.speedH / 20) * 0.6 + Math.sin(this.phase * 2) * 0.1, 6)
  }
}
