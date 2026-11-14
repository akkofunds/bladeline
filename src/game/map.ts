import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * The arena is built entirely from axis-aligned boxes. The layout is generated
 * from a fixed seed so every peer in a room builds the exact same map.
 */

export type BoxKind = 'ground' | 'stone' | 'dark' | 'pad' | 'boost' | 'trim'

export interface Box {
  minx: number
  miny: number
  minz: number
  maxx: number
  maxy: number
  maxz: number
  kind: BoxKind
  /** for boost strips: horizontal push direction */
  dir?: [number, number]
}

export const MAP_HALF = 140
export const WALL_HEIGHT = 60

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function box(
  cx: number,
  y0: number,
  cz: number,
  sx: number,
  h: number,
  sz: number,
  kind: BoxKind = 'stone',
): Box {
  return {
    minx: cx - sx / 2,
    maxx: cx + sx / 2,
    miny: y0,
    maxy: y0 + h,
    minz: cz - sz / 2,
    maxz: cz + sz / 2,
    kind,
  }
}

export function generateMap(): { boxes: Box[]; spawns: THREE.Vector3[] } {
  const rand = mulberry32(1337)
  const boxes: Box[] = []
  const H = MAP_HALF

  // Ground + boundary walls
  boxes.push(box(0, -2, 0, H * 2, 2, H * 2, 'ground'))
  boxes.push(box(0, 0, -H - 1, H * 2 + 4, WALL_HEIGHT, 2, 'dark'))
  boxes.push(box(0, 0, H + 1, H * 2 + 4, WALL_HEIGHT, 2, 'dark'))
  boxes.push(box(-H - 1, 0, 0, 2, WALL_HEIGHT, H * 2, 'dark'))
  boxes.push(box(H + 1, 0, 0, 2, WALL_HEIGHT, H * 2, 'dark'))

  // Central shrine: raised deck, four corner pillars, tall spire for grappling
  boxes.push(box(0, 0, 0, 26, 8, 26, 'stone'))
  boxes.push(box(0, 8, 0, 27, 0.4, 27, 'trim'))
  for (const [px, pz] of [
    [-11, -11],
    [11, -11],
    [-11, 11],
    [11, 11],
  ]) {
    boxes.push(box(px, 8.4, pz, 2, 10, 2, 'dark'))
  }
  boxes.push(box(0, 18.4, 0, 26, 1, 26, 'stone')) // roof
  boxes.push(box(0, 19.4, 0, 4, 34, 4, 'dark')) // spire
  boxes.push(box(0, 53.4, 0, 8, 1, 8, 'trim'))

  // Jump pads around the shrine
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    boxes.push(box(Math.cos(a) * 20, 0, Math.sin(a) * 20, 3.2, 0.3, 3.2, 'pad'))
  }

  // Four corner towers with bridges back to the shrine
  const corners: [number, number][] = [
    [-80, -80],
    [80, -80],
    [-80, 80],
    [80, 80],
  ]
  for (const [cx, cz] of corners) {
    boxes.push(box(cx, 0, cz, 14, 14, 14, 'stone'))
    boxes.push(box(cx, 14, cz, 15, 0.4, 15, 'trim'))
    boxes.push(box(cx, 14.4, cz, 5, 26, 5, 'dark'))
    boxes.push(box(cx, 40.4, cz, 10, 1, 10, 'stone'))
    // pad at the foot of each tower, facing the shrine
    const dx = -Math.sign(cx)
    const dz = -Math.sign(cz)
    boxes.push(box(cx + dx * 11, 0, cz + dz * 11, 3.2, 0.3, 3.2, 'pad'))
    // bridge toward center at deck height
    const steps = 14
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1)
      const bx = cx * (1 - t) + 0 * t
      const bz = cz * (1 - t) + 0 * t
      if (Math.abs(bx) < 16 && Math.abs(bz) < 16) continue
      const y = 13 - t * 6
      boxes.push(box(bx, y, bz, 4.5, 0.6, 4.5, 'trim'))
    }
  }

  // Mid ring of long walls with gaps (cover + wall-grapple)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const r = 50
    const along = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a))
    boxes.push(
      box(
        Math.cos(a) * r,
        0,
        Math.sin(a) * r,
        along ? 2 : 14,
        4 + rand() * 6,
        along ? 14 : 2,
        'dark',
      ),
    )
  }

  // Scattered tall pillars — the main grapple anchors
  for (let i = 0; i < 70; i++) {
    const x = (rand() * 2 - 1) * (H - 8)
    const z = (rand() * 2 - 1) * (H - 8)
    if (Math.hypot(x, z) < 26) continue
    const s = 1.6 + rand() * 2
    boxes.push(box(x, 0, z, s, 10 + rand() * 28, s, rand() < 0.5 ? 'stone' : 'dark'))
  }

  // Floating platforms
  for (let i = 0; i < 34; i++) {
    const x = (rand() * 2 - 1) * (H - 14)
    const z = (rand() * 2 - 1) * (H - 14)
    if (Math.hypot(x, z) < 22) continue
    const sx = 5 + rand() * 10
    const sz = 5 + rand() * 10
    boxes.push(box(x, 6 + rand() * 22, z, sx, 0.8, sz, 'trim'))
  }

  // Low hop-over cover blocks
  for (let i = 0; i < 46; i++) {
    const x = (rand() * 2 - 1) * (H - 6)
    const z = (rand() * 2 - 1) * (H - 6)
    if (Math.hypot(x, z) < 26) continue
    const long = rand() < 0.5
    boxes.push(box(x, 0, z, long ? 7 : 2.5, 1.1, long ? 2.5 : 7, 'stone'))
  }

  // Boost strips on open ground — push you along their direction
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const r = 34 + (i % 2) * 64
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const b = box(x, 0, z, 4, 0.15, 4, 'boost')
    b.dir = [-Math.sin(a), Math.cos(a)]
    boxes.push(b)
  }

  // Spawn points: open ground around the ring
  const spawns: THREE.Vector3[] = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const r = i % 2 === 0 ? 36 : 110
    spawns.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))
  }
  return { boxes, spawns }
}

/* ---------- rendering ---------- */

/** Visual-only PRNG so render variation never touches the gameplay seed. */
const visRand = mulberry32(9001)

function panelTexture(base: string, line: string, accent: string, size: number, opts: { noise?: number; seam?: boolean } = {}) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = base
  g.fillRect(0, 0, size, size)
  // speckle grain so flat surfaces read as stone instead of plastic
  const noise = opts.noise ?? 0.06
  const r = mulberry32(size * 7 + base.length)
  const dots = size * size * 0.06
  for (let i = 0; i < dots; i++) {
    const v = r()
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${noise * r()})` : `rgba(0,0,0,${noise * 1.6 * r()})`
    g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2)
  }
  g.strokeStyle = line
  g.lineWidth = Math.max(1, size / 128)
  const step = size / 4
  for (let i = 0; i <= 4; i++) {
    g.beginPath()
    g.moveTo(i * step, 0)
    g.lineTo(i * step, size)
    g.stroke()
    g.beginPath()
    g.moveTo(0, i * step)
    g.lineTo(size, i * step)
    g.stroke()
  }
  if (opts.seam) {
    // offset brick seams
    g.strokeStyle = line
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? step / 2 : 0
      for (let col = 0; col < 4; col++) {
        g.beginPath()
        g.moveTo(col * step + off, row * step)
        g.lineTo(col * step + off, row * step + step)
        g.stroke()
      }
    }
  }
  g.strokeStyle = accent
  g.lineWidth = Math.max(2, size / 64)
  g.strokeRect(1, 1, size - 2, size - 2)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = size >= 256 ? 4 : 1
  return tex
}

/**
 * World-space UVs so grid lines are the same size everywhere (great for reading speed),
 * plus vertex colours: a per-box tint and a darkening toward the ground (cheap fake AO).
 */
function boxGeometry(b: Box, uvScale: number) {
  const sx = b.maxx - b.minx
  const sy = b.maxy - b.miny
  const sz = b.maxz - b.minz
  const g = new THREE.BoxGeometry(sx, sy, sz)
  g.translate((b.minx + b.maxx) / 2, (b.miny + b.maxy) / 2, (b.minz + b.maxz) / 2)
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const uv = g.attributes.uv
  const colors = new Float32Array(pos.count * 3)
  const tint = 0.9 + visRand() * 0.16
  const grounded = b.miny <= 0.05 && b.kind !== 'ground'
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i))
    const ny = nor.getY(i)
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (Math.abs(ny) > 0.5) uv.setXY(i, x / uvScale, z / uvScale)
    else if (nx > 0.5) uv.setXY(i, z / uvScale, y / uvScale)
    else uv.setXY(i, x / uvScale, y / uvScale)
    let shade = tint
    if (Math.abs(ny) < 0.5) {
      // vertical faces: darker at the foot, lighter toward the top
      const h = (y - b.miny) / Math.max(0.01, sy)
      shade *= grounded ? 0.55 + 0.45 * Math.min(1, h * 1.4) : 0.8 + 0.2 * h
    } else if (ny < 0) shade *= 0.55 // undersides
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

let glowTex: THREE.Texture | null = null
/** Soft radial sprite used for lantern/pad glows (additive, no lights needed). */
export function glowTexture() {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  glowTex = new THREE.CanvasTexture(c)
  return glowTex
}

function glow(color: string, size: number, opacity = 0.8) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  s.scale.set(size, size, 1)
  return s
}

export function buildMapMeshes(boxes: Box[], texSize = 256): THREE.Group {
  const group = new THREE.Group()
  const lambert = (map: THREE.Texture, extra: THREE.MeshLambertMaterialParameters = {}) =>
    new THREE.MeshLambertMaterial({ map, vertexColors: true, ...extra })
  const mats: Record<BoxKind, THREE.Material> = {
    ground: lambert(panelTexture('#221d33', '#2f2846', '#43376a', texSize, { noise: 0.08 })),
    stone: lambert(panelTexture('#a39282', '#8a7a6c', '#c2ad98', texSize, { seam: true })),
    dark: lambert(panelTexture('#2f2a40', '#3d3656', '#55497a', texSize, { seam: true })),
    trim: lambert(panelTexture('#c23446', '#9c2733', '#ff6171', texSize), { emissive: new THREE.Color('#4a0c16') }),
    pad: new THREE.MeshBasicMaterial({ color: '#4ff6ff' }),
    boost: new THREE.MeshBasicMaterial({ color: '#ffb02e' }),
  }
  const byKind = new Map<BoxKind, THREE.BufferGeometry[]>()
  for (const b of boxes) {
    const list = byKind.get(b.kind) ?? []
    list.push(boxGeometry(b, 4))
    byKind.set(b.kind, list)
  }
  for (const [kind, geos] of byKind) {
    const merged = mergeGeometries(geos)
    geos.forEach((g) => g.dispose())
    const mesh = new THREE.Mesh(merged, mats[kind])
    mesh.castShadow = kind !== 'ground' && kind !== 'pad' && kind !== 'boost'
    mesh.receiveShadow = true
    group.add(mesh)
  }

  // Glow rings floating above pads and boost arrows
  const ringGeo = new THREE.TorusGeometry(1.4, 0.08, 6, 24)
  const ringMat = new THREE.MeshBasicMaterial({ color: '#7ff8ff', transparent: true, opacity: 0.85 })
  for (const b of boxes) {
    const cx = (b.minx + b.maxx) / 2
    const cz = (b.minz + b.maxz) / 2
    if (b.kind === 'pad') {
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = Math.PI / 2
      ring.position.set(cx, b.maxy + 0.6, cz)
      ring.userData.pad = true
      group.add(ring)
      const g = glow('#36e8ff', 6, 0.55)
      g.position.set(cx, b.maxy + 0.5, cz)
      group.add(g)
    }
    if (b.kind === 'boost' && b.dir) {
      const geo = new THREE.ConeGeometry(1, 2.4, 3)
      geo.rotateX(Math.PI / 2) // point along +Z
      const arrow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#fff0c4', transparent: true, opacity: 0.9 }))
      arrow.rotation.y = Math.atan2(b.dir[0], b.dir[1])
      arrow.scale.set(1, 0.15, 1)
      arrow.position.set(cx, b.maxy + 0.05, cz)
      group.add(arrow)
      const g = glow('#ff9a1f', 7, 0.45)
      g.position.set(cx, b.maxy + 0.4, cz)
      group.add(g)
    }
  }

  // Paper lanterns: emissive boxes + additive halo. Purely visual, placed on top of solid geometry.
  const lanternGeo = new THREE.BoxGeometry(0.7, 1, 0.7)
  const lanternMat = new THREE.MeshBasicMaterial({ color: '#ffcf8a' })
  const lantern = (x: number, y: number, z: number) => {
    const m = new THREE.Mesh(lanternGeo, lanternMat)
    m.position.set(x, y + 0.5, z)
    group.add(m)
    const g = glow('#ff9a4a', 5, 0.7)
    g.position.set(x, y + 0.6, z)
    group.add(g)
  }
  for (const [px, pz] of [
    [-11, -11],
    [11, -11],
    [-11, 11],
    [11, 11],
  ]) {
    lantern(px, 19.4, pz)
    lantern(px * 1.2, 8.4, pz * 1.2)
  }
  lantern(0, 54.4, 0)
  for (const [cx, cz] of [
    [-80, -80],
    [80, -80],
    [-80, 80],
    [80, 80],
  ]) {
    lantern(cx, 41.4, cz)
    for (const [ox, oz] of [
      [-6.5, -6.5],
      [6.5, 6.5],
    ])
      lantern(cx + ox, 14.4, cz + oz)
  }
  return group
}
