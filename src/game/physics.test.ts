import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { Box } from './map'
import { createBody, MOVE, stepBody, type BodyEvent } from './physics'

const DT = 1 / 120
const floor: Box = { minx: -200, maxx: 200, miny: -2, maxy: 0, minz: -200, maxz: 200, kind: 'ground' }
// a tall wall along the z axis at x = 2..3
const wall: Box = { minx: 2, maxx: 3, miny: 0, maxy: 20, minz: -100, maxz: 100, kind: 'dark' }
const hSpeed = (v: THREE.Vector3) => Math.hypot(v.x, v.z)

function run(body: ReturnType<typeof createBody>, ticks: number, input: Parameters<typeof stepBody>[1], boxes: Box[]) {
  const events: BodyEvent[] = []
  for (let i = 0; i < ticks; i++) stepBody(body, input, DT, boxes, events)
  return events
}

describe('slide', () => {
  it('boosts on entry and keeps far more speed than running friction', () => {
    const slider = createBody(new THREE.Vector3(0, 0.01, 0))
    const walker = createBody(new THREE.Vector3(0, 0.01, 0))
    for (const b of [slider, walker]) {
      b.onGround = true
      b.vel.set(0, 0, -15)
    }
    const still = { wish: new THREE.Vector3(), jump: false }
    const ev = run(slider, 60, { ...still, slide: true }, [floor])
    run(walker, 60, still, [floor])
    expect(ev).toContain('slide')
    expect(hSpeed(slider.vel)).toBeGreaterThan(14) // 15 + boost, minus a little friction
    expect(hSpeed(walker.vel)).toBeLessThan(3)
  })

  it('slide-hop keeps the speed', () => {
    const b = createBody(new THREE.Vector3(0, 0.01, 0))
    b.onGround = true
    b.vel.set(0, 0, -15)
    run(b, 20, { wish: new THREE.Vector3(), jump: false, slide: true }, [floor])
    const before = hSpeed(b.vel)
    run(b, 1, { wish: new THREE.Vector3(), jump: true, slide: true }, [floor])
    expect(b.onGround).toBe(false)
    expect(hSpeed(b.vel)).toBeGreaterThanOrEqual(before - 0.1)
  })
})

describe('wallrun', () => {
  it('holding jump along a wall glides instead of falling', () => {
    const runner = createBody(new THREE.Vector3(1.55, 5, 0))
    const faller = createBody(new THREE.Vector3(-20, 5, 0))
    for (const b of [runner, faller]) b.vel.set(0, 0, -14)
    const input = { wish: new THREE.Vector3(), jump: true }
    const ev = run(runner, 60, input, [floor, wall])
    run(faller, 60, input, [floor, wall])
    expect(ev).toContain('wallrun')
    expect(runner.pos.y).toBeGreaterThan(faller.pos.y + 1)
  })

  it('wall jump kicks away from the wall', () => {
    const b = createBody(new THREE.Vector3(1.55, 5, 0))
    b.vel.set(0, 0, -14)
    run(b, 20, { wish: new THREE.Vector3(), jump: true }, [floor, wall])
    const ev = run(b, 1, { wish: new THREE.Vector3(), jump: true, jumpPressed: true }, [floor, wall])
    expect(ev).toContain('walljump')
    expect(b.vel.x).toBeLessThan(-MOVE.wallJumpPush + 1) // pushed toward -x, away from the wall
    expect(b.vel.y).toBeGreaterThanOrEqual(MOVE.wallJumpUp - 0.5)
  })
})
