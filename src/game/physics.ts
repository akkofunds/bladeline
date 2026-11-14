import * as THREE from 'three'
import type { Box } from './map'

/**
 * Quake/Source-style movement: ground friction, ground acceleration and
 * capped air acceleration. Air-strafing (holding A/D while turning the mouse
 * the same way) adds speed, and jumping on the frame you land skips friction —
 * that is bunny hopping.
 */
export const MOVE = {
  gravity: 21,
  runSpeed: 8.5,
  groundAccel: 10,
  airAccel: 14,
  airCap: 0.95,
  friction: 6,
  stopSpeed: 3,
  jumpSpeed: 7.6,
  padSpeed: 27,
  boostAdd: 10,
  /** effectively no speed limit; this only guards against physics blowing up */
  maxSpeed: 250,
  stepHeight: 0.65,
  grapplePull: 58,
  /** the rope shortens this fast while hooked, so it reels you in hard */
  grappleReel: 9,
  grappleRange: 110,
  half: 0.4,
  height: 1.8,
  // slide: near-frictionless ground glide that keeps your speed
  slideFriction: 0.35,
  slideMinSpeed: 6,
  slideBoost: 3.5,
  slideCooldown: 0.9,
  // wallrun: hold jump next to a wall while moving fast
  wallrunTime: 1.6,
  wallrunMinSpeed: 6,
  wallGravity: 0.22,
  wallJumpPush: 8,
  wallJumpUp: 8,
  wallJumpBonus: 1.5,
}

export interface MoveInput {
  wish: THREE.Vector3 // horizontal, length 0..1
  jump: boolean
  /** jump went down this tick (wall jumps) */
  jumpPressed?: boolean
  slide?: boolean
}

export interface Body {
  pos: THREE.Vector3 // feet center
  vel: THREE.Vector3
  onGround: boolean
  grapple: THREE.Vector3 | null
  ropeLen: number
  boostCooldown: number
  sliding: boolean
  slideCooldown: number
  wallrun: boolean
  wallTime: number
  /** outward normal of the wall being run on (x, z) */
  wallNormal: THREE.Vector3
}

export type BodyEvent = 'jump' | 'land' | 'pad' | 'boost' | 'slide' | 'wallrun' | 'walljump'

export function createBody(pos: THREE.Vector3): Body {
  return {
    pos: pos.clone(),
    vel: new THREE.Vector3(),
    onGround: false,
    grapple: null,
    ropeLen: 0,
    boostCooldown: 0,
    sliding: false,
    slideCooldown: 0,
    wallrun: false,
    wallTime: 0,
    wallNormal: new THREE.Vector3(),
  }
}

const EPS = 0.001

function overlaps(p: THREE.Vector3, b: Box) {
  const h = MOVE.half
  return (
    p.x + h > b.minx + EPS &&
    p.x - h < b.maxx - EPS &&
    p.z + h > b.minz + EPS &&
    p.z - h < b.maxz - EPS &&
    p.y + MOVE.height > b.miny + EPS &&
    p.y < b.maxy - EPS
  )
}

function anyOverlap(p: THREE.Vector3, boxes: Box[]) {
  for (const b of boxes) if (overlaps(p, b)) return true
  return false
}

const tmp = new THREE.Vector3()
const probe = new THREE.Vector3()
const WALL_DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/** Returns the outward normal of a wall touching the body's side, or null. */
function findWall(body: Body, boxes: Box[], out: THREE.Vector3): THREE.Vector3 | null {
  for (const [dx, dz] of WALL_DIRS) {
    probe.set(body.pos.x + dx * 0.2, body.pos.y + 0.3, body.pos.z + dz * 0.2)
    for (const b of boxes) {
      // must be a real wall: tall enough to cover the body, not a ledge we're standing above
      if (b.maxy < body.pos.y + 1.2 || b.miny > body.pos.y + 0.5) continue
      if (overlaps(probe, b)) return out.set(-dx, 0, -dz)
    }
  }
  return null
}

function accelerate(vel: THREE.Vector3, wish: THREE.Vector3, wishSpeed: number, accel: number, dt: number, cap = Infinity) {
  const current = vel.x * wish.x + vel.z * wish.z
  const add = Math.min(wishSpeed, cap) - current
  if (add <= 0) return
  const acc = Math.min(accel * wishSpeed * dt, add)
  vel.x += acc * wish.x
  vel.z += acc * wish.z
}

export function stepBody(body: Body, input: MoveInput, dt: number, boxes: Box[], events: BodyEvent[] = []) {
  const { vel } = body
  const wishLen = Math.min(1, input.wish.length())
  const wish = tmp.copy(input.wish)
  if (wishLen > 0) wish.normalize()
  body.boostCooldown = Math.max(0, body.boostCooldown - dt)
  body.slideCooldown = Math.max(0, body.slideCooldown - dt)

  // broadphase: only boxes this body could touch this frame
  const reach = vel.length() * dt + 3
  const p0 = body.pos
  const near = boxes.filter(
    (b) =>
      b.maxx > p0.x - reach &&
      b.minx < p0.x + reach &&
      b.maxz > p0.z - reach &&
      b.minz < p0.z + reach &&
      b.maxy > p0.y - reach &&
      b.miny < p0.y + MOVE.height + reach,
  )
  const speedH = Math.hypot(vel.x, vel.z)

  if (body.onGround) {
    body.wallTime = 0
    body.wallrun = false
    if (input.jump) {
      vel.y = MOVE.jumpSpeed
      body.onGround = false
      body.sliding = false
      events.push('jump')
      // friction skipped on the hop frame -> bhop (and slide-hop keeps the slide's speed)
      accelerate(vel, wish, MOVE.runSpeed * wishLen, MOVE.airAccel, dt, MOVE.airCap)
    } else if (input.slide && (speedH > MOVE.slideMinSpeed || (body.sliding && speedH > 2.5))) {
      if (!body.sliding) {
        body.sliding = true
        events.push('slide')
        if (body.slideCooldown <= 0 && speedH > 0.1) {
          vel.x += (vel.x / speedH) * MOVE.slideBoost
          vel.z += (vel.z / speedH) * MOVE.slideBoost
          body.slideCooldown = MOVE.slideCooldown
        }
      }
      const speed = Math.hypot(vel.x, vel.z)
      if (speed > 0) {
        const ns = Math.max(0, speed - speed * MOVE.slideFriction * dt) / speed
        vel.x *= ns
        vel.z *= ns
      }
      // light steering while sliding
      accelerate(vel, wish, MOVE.runSpeed * wishLen * 0.3, MOVE.groundAccel * 0.4, dt)
    } else {
      body.sliding = false
      const speed = Math.hypot(vel.x, vel.z)
      if (speed > 0) {
        const control = Math.max(speed, MOVE.stopSpeed)
        const drop = control * MOVE.friction * dt
        const ns = Math.max(0, speed - drop) / speed
        vel.x *= ns
        vel.z *= ns
      }
      accelerate(vel, wish, MOVE.runSpeed * wishLen, MOVE.groundAccel, dt)
    }
  } else {
    body.sliding = false
    accelerate(vel, wish, MOVE.runSpeed * wishLen, MOVE.airAccel, dt, MOVE.airCap)
    const wall = body.grapple ? null : findWall(body, near, body.wallNormal)
    if (wall && input.jumpPressed && body.wallTime > 0.05) {
      // wall jump: kick off the wall and keep (a bit more) speed
      const h = Math.hypot(vel.x, vel.z)
      vel.addScaledVector(wall, MOVE.wallJumpPush)
      if (h > 0.1) {
        vel.x += (vel.x / h) * MOVE.wallJumpBonus
        vel.z += (vel.z / h) * MOVE.wallJumpBonus
      }
      vel.y = Math.max(vel.y, MOVE.wallJumpUp)
      body.wallrun = false
      body.wallTime = MOVE.wallrunTime * 0.45 // the next wall gets a shorter run until you land
      events.push('walljump')
    } else if (
      wall &&
      input.jump &&
      body.wallTime < MOVE.wallrunTime &&
      speedH > MOVE.wallrunMinSpeed &&
      vel.y > -12
    ) {
      if (!body.wallrun) events.push('wallrun')
      body.wallrun = true
      body.wallTime += dt
      // cancel motion into the wall and hug it
      const into = vel.x * wall.x + vel.z * wall.z
      if (into < 0) vel.addScaledVector(wall, -into)
      vel.addScaledVector(wall, -2 * dt)
      // glide: vertical speed settles toward zero
      vel.y += (0 - vel.y) * Math.min(1, dt * 4)
    } else {
      body.wallrun = false
    }
  }

  // Grapple: pull toward the anchor and act like a rope when swinging
  if (body.grapple) {
    const to = new THREE.Vector3().subVectors(body.grapple, body.pos).add(new THREE.Vector3(0, -1.2, 0))
    const dist = to.length()
    if (dist > 0.5) {
      to.divideScalar(dist)
      vel.addScaledVector(to, MOVE.grapplePull * dt)
      // rope constraint: never move away from the anchor faster than the rope allows
      if (dist >= body.ropeLen) {
        const radial = vel.dot(to)
        if (radial < 0) vel.addScaledVector(to, -radial)
      }
      body.ropeLen = Math.max(2, Math.min(body.ropeLen, dist) - MOVE.grappleReel * dt)
      body.onGround = false
    }
  }

  if (!body.onGround) vel.y -= MOVE.gravity * (body.wallrun ? MOVE.wallGravity : 1) * dt

  const sp = vel.length()
  if (sp > MOVE.maxSpeed) vel.multiplyScalar(MOVE.maxSpeed / sp)

  // Move with substeps so fast players don't tunnel through thin geometry
  const steps = Math.min(10, Math.max(1, Math.ceil((sp * dt) / 0.3)))
  const sdt = dt / steps
  const wasGround = body.onGround
  let ground: Box | null = null
  body.onGround = false
  for (let s = 0; s < steps; s++) {
    ground = moveAxis(body, 'x', vel.x * sdt, near) ?? ground
    ground = moveAxis(body, 'z', vel.z * sdt, near) ?? ground
    const g = moveAxis(body, 'y', (vel.y - (wasGround ? 0.5 : 0)) * sdt, near)
    if (g) ground = g
  }
  if (ground) {
    if (!wasGround) events.push('land')
    if (ground.kind === 'pad') {
      vel.y = MOVE.padSpeed
      body.onGround = false
      events.push('pad')
    } else if (ground.kind === 'boost' && ground.dir && body.boostCooldown <= 0) {
      const h = Math.hypot(vel.x, vel.z)
      const along = vel.x * ground.dir[0] + vel.z * ground.dir[1]
      const dirSign = along >= 0 || h < 1 ? 1 : -1
      vel.x += ground.dir[0] * MOVE.boostAdd * dirSign
      vel.z += ground.dir[1] * MOVE.boostAdd * dirSign
      body.boostCooldown = 1
      events.push('boost')
    }
  }
}

/** Moves along one axis, resolves collisions. Returns the box stood on (y-axis only). */
function moveAxis(body: Body, axis: 'x' | 'y' | 'z', delta: number, boxes: Box[]): Box | null {
  if (delta === 0) return null
  const p = body.pos
  p[axis] += delta
  let ground: Box | null = null
  for (const b of boxes) {
    if (!overlaps(p, b)) continue
    if (axis === 'y') {
      if (delta < 0) {
        p.y = b.maxy + EPS
        if (body.vel.y < 0) body.vel.y = 0
        body.onGround = true
        ground = b
      } else {
        p.y = b.miny - MOVE.height - EPS
        if (body.vel.y > 0) body.vel.y = 0
      }
      continue
    }
    // try to step up small ledges (pads, curbs)
    const rise = b.maxy - p.y
    if (rise > 0 && rise <= MOVE.stepHeight) {
      const oldY = p.y
      p.y = b.maxy + EPS
      if (!anyOverlap(p, boxes)) continue
      p.y = oldY
    }
    const h = MOVE.half
    if (axis === 'x') p.x = delta > 0 ? b.minx - h - EPS : b.maxx + h + EPS
    else p.z = delta > 0 ? b.minz - h - EPS : b.maxz + h + EPS
    body.vel[axis] = 0
  }
  return ground
}

export interface RayHit {
  t: number
  point: THREE.Vector3
  normal: THREE.Vector3
}

export function raycastBoxes(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, boxes: Box[]): RayHit | null {
  let best = maxDist
  let bestNormal: THREE.Vector3 | null = null
  for (const b of boxes) {
    let tmin = 0
    let tmax = best
    let nAxis = -1
    let nSign = 0
    const mins = [b.minx, b.miny, b.minz]
    const maxs = [b.maxx, b.maxy, b.maxz]
    const o = [origin.x, origin.y, origin.z]
    const d = [dir.x, dir.y, dir.z]
    let ok = true
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < mins[i] || o[i] > maxs[i]) {
          ok = false
          break
        }
        continue
      }
      let t1 = (mins[i] - o[i]) / d[i]
      let t2 = (maxs[i] - o[i]) / d[i]
      let sign = -1
      if (t1 > t2) {
        ;[t1, t2] = [t2, t1]
        sign = 1
      }
      if (t1 > tmin) {
        tmin = t1
        nAxis = i
        nSign = sign
      }
      tmax = Math.min(tmax, t2)
      if (tmin > tmax) {
        ok = false
        break
      }
    }
    if (ok && nAxis >= 0 && tmin < best) {
      best = tmin
      bestNormal = new THREE.Vector3()
      bestNormal.setComponent(nAxis, nSign)
    }
  }
  if (!bestNormal) return null
  return { t: best, point: origin.clone().addScaledVector(dir, best), normal: bestNormal }
}

/** Finds the floor height under (x, z) by dropping a ray from the sky. */
export function floorHeight(x: number, z: number, boxes: Box[]) {
  const hit = raycastBoxes(new THREE.Vector3(x, 200, z), new THREE.Vector3(0, -1, 0), 400, boxes)
  return hit ? hit.point.y : 0
}
