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

  // Long, tall wallrun walls between the mid ring and the outskirts
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2
    const r = 74 + rand() * 8
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const eastWest = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a))
    const len = 24 + rand() * 8
    boxes.push(box(x, 0, z, eastWest ? 1.6 : len, 12 + rand() * 4, eastWest ? len : 1.6, 'dark'))
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

function gridTexture(base: string, line: string, accent: string, size = 128) {
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
  tex.anisotropy = 4
  return tex
}

/**
 * World-space UVs so grid lines are the same size everywhere (great for reading speed),
 * plus baked vertex-colour shading: walls darken toward their base and undersides are dim.
 * It reads like ambient occlusion but costs nothing at runtime.
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
  const glow = b.kind === 'pad' || b.kind === 'boost'
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i))
    const nyRaw = nor.getY(i)
    const ny = Math.abs(nyRaw)
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (ny > 0.5) uv.setXY(i, x / uvScale, z / uvScale)
    else if (nx > 0.5) uv.setXY(i, z / uvScale, y / uvScale)
    else uv.setXY(i, x / uvScale, y / uvScale)
    let shade = 1
    if (!glow && b.kind !== 'ground') {
      if (nyRaw < -0.5) shade = 0.42 // undersides
      else if (ny < 0.5) shade = 0.5 + 0.5 * Math.min(1, Math.max(0, y) / 10) // walls fade up from the floor
      // side faces facing away from the sun read a touch darker
      if (ny < 0.5) shade *= nor.getX(i) + nor.getZ(i) > 0 ? 1 : 0.82
    }
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

/**
 * `lite` swaps physically based materials for Lambert ones. They look almost the same here
 * (everything is matte) and are much cheaper per pixel on integrated GPUs and phones.
 */
export function buildMapMeshes(boxes: Box[], lite = false): THREE.Group {
  const group = new THREE.Group()
  const mat = (o: { map?: THREE.Texture; color?: string; roughness?: number; emissive?: string; ei?: number }) => {
    const common = {
      ...(o.map ? { map: o.map } : {}),
      color: o.color ?? '#ffffff',
      vertexColors: true,
      emissive: new THREE.Color(o.emissive ?? '#000000'),
      emissiveIntensity: o.ei ?? 1,
    }
    return lite
      ? new THREE.MeshLambertMaterial(common)
      : new THREE.MeshStandardMaterial({ ...common, roughness: o.roughness ?? 0.85 })
  }
  const mats: Record<BoxKind, THREE.Material> = {
    // light concrete daylight palette with red accents
    ground: mat({ map: gridTexture('#c9cdd3', '#b7bcc4', '#a7adb6'), roughness: 0.9 }),
    stone: mat({ map: gridTexture('#eef0f2', '#dfe2e6', '#cfd3d9'), roughness: 0.8 }),
    dark: mat({ map: gridTexture('#a3a9b2', '#959ba5', '#878e98'), roughness: 0.85 }),
    trim: mat({ map: gridTexture('#e3303f', '#c92535', '#ff6b76'), roughness: 0.6, emissive: '#3a070c' }),
    pad: mat({ color: '#2ef2ff', emissive: '#14c8e0', ei: 1.4 }),
    boost: mat({ color: '#ffb02e', emissive: '#ff8a00', ei: 1.3 }),
  }
  const byKind = new Map<BoxKind, THREE.BufferGeometry[]>()
  for (const b of boxes) {
    const list = byKind.get(b.kind) ?? []
    list.push(boxGeometry(b, b.kind === 'ground' ? 4 : 4))
    byKind.set(b.kind, list)
  }
  // Crisp dark outlines on every block: one draw call, and it makes the light map read clearly
  const edgeGeos: THREE.BufferGeometry[] = []
  for (const b of boxes) {
    if (b.kind === 'ground' || b.kind === 'pad' || b.kind === 'boost') continue
    const g = new THREE.BoxGeometry(b.maxx - b.minx, b.maxy - b.miny, b.maxz - b.minz)
    g.translate((b.minx + b.maxx) / 2, (b.miny + b.maxy) / 2, (b.minz + b.maxz) / 2)
    const e = new THREE.EdgesGeometry(g)
    g.dispose()
    edgeGeos.push(e)
  }
  const edges = new THREE.LineSegments(
    mergeGeometries(edgeGeos),
    new THREE.LineBasicMaterial({ color: '#1f232a', transparent: true, opacity: 0.55 }),
  )
  edgeGeos.forEach((g) => g.dispose())
  group.add(edges)

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
