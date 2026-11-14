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

function gridTexture(base: string, line: string, accent: string, size = 256) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = base
  g.fillRect(0, 0, size, size)
  g.strokeStyle = line
  g.lineWidth = 2
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
  g.strokeStyle = accent
  g.lineWidth = 4
  g.strokeRect(2, 2, size - 4, size - 4)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** World-space UVs so grid lines are the same size everywhere (great for reading speed). */
function boxGeometry(b: Box, uvScale: number) {
  const sx = b.maxx - b.minx
  const sy = b.maxy - b.miny
  const sz = b.maxz - b.minz
  const g = new THREE.BoxGeometry(sx, sy, sz)
  g.translate((b.minx + b.maxx) / 2, (b.miny + b.maxy) / 2, (b.minz + b.maxz) / 2)
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i))
    const ny = Math.abs(nor.getY(i))
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (ny > 0.5) uv.setXY(i, x / uvScale, z / uvScale)
    else if (nx > 0.5) uv.setXY(i, z / uvScale, y / uvScale)
    else uv.setXY(i, x / uvScale, y / uvScale)
  }
  return g
}

export function buildMapMeshes(boxes: Box[]): THREE.Group {
  const group = new THREE.Group()
  const mats: Record<BoxKind, THREE.Material> = {
    ground: new THREE.MeshStandardMaterial({
      map: gridTexture('#1d1a2b', '#2c2742', '#3a2f55'),
      roughness: 0.9,
    }),
    stone: new THREE.MeshStandardMaterial({
      map: gridTexture('#8d7f74', '#7a6c62', '#a69384'),
      roughness: 0.8,
    }),
    dark: new THREE.MeshStandardMaterial({
      map: gridTexture('#2e2a3d', '#3a3550', '#4b4466'),
      roughness: 0.85,
    }),
    trim: new THREE.MeshStandardMaterial({
      map: gridTexture('#b8333f', '#9c2833', '#e0525e'),
      roughness: 0.6,
      emissive: new THREE.Color('#3a0a10'),
    }),
    pad: new THREE.MeshStandardMaterial({
      color: '#2ef2ff',
      emissive: new THREE.Color('#14c8e0'),
      emissiveIntensity: 1.4,
    }),
    boost: new THREE.MeshStandardMaterial({
      color: '#ffb02e',
      emissive: new THREE.Color('#ff8a00'),
      emissiveIntensity: 1.3,
    }),
  }
  const byKind = new Map<BoxKind, THREE.BufferGeometry[]>()
  for (const b of boxes) {
    const list = byKind.get(b.kind) ?? []
    list.push(boxGeometry(b, b.kind === 'ground' ? 4 : 4))
    byKind.set(b.kind, list)
  }
  for (const [kind, geos] of byKind) {
    const merged = mergeGeometries(geos)
    geos.forEach((g) => g.dispose())
    const mesh = new THREE.Mesh(merged, mats[kind])
    mesh.castShadow = kind !== 'ground'
    mesh.receiveShadow = true
    group.add(mesh)
  }

  // Glow rings floating above pads and boost arrows
  for (const b of boxes) {
    if (b.kind === 'pad') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.4, 0.08, 6, 24),
        new THREE.MeshBasicMaterial({ color: '#7ff8ff', transparent: true, opacity: 0.8 }),
      )
      ring.rotation.x = Math.PI / 2
      ring.position.set((b.minx + b.maxx) / 2, b.maxy + 0.6, (b.minz + b.maxz) / 2)
      ring.userData.pad = true
      group.add(ring)
    }
    if (b.kind === 'boost' && b.dir) {
      const geo = new THREE.ConeGeometry(1, 2.4, 3)
      geo.rotateX(Math.PI / 2) // point along +Z
      const arrow = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.85 }),
      )
      arrow.rotation.y = Math.atan2(b.dir[0], b.dir[1])
      arrow.scale.set(1, 0.15, 1)
      arrow.position.set((b.minx + b.maxx) / 2, b.maxy + 0.05, (b.minz + b.maxz) / 2)
      group.add(arrow)
    }
  }
  return group
}
