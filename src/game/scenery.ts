import * as THREE from 'three'

/**
 * Cheap atmosphere: everything here is one draw call (or close to it) and has no per-frame CPU work
 * beyond a single uniform update, so it stays friendly to Chromebooks and phones.
 */

export const SUN_DIR = new THREE.Vector3(80, 120, 40).normalize()

export function buildSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(900, 24, 12)
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#0d1030') },
      mid: { value: new THREE.Color('#5a2f72') },
      horizon: { value: new THREE.Color('#ff8f6a') },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main(){
        float h = vDir.y;
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, top, smoothstep(0.22, 0.75, h));
        c = mix(c, horizon * 0.55, smoothstep(0.0, -0.2, h));
        // thin cloud bands near the horizon
        float band = sin(h * 90.0 + vDir.x * 4.0) * 0.5 + 0.5;
        c += vec3(1.0, 0.55, 0.5) * band * 0.05 * smoothstep(0.02, 0.1, h) * (1.0 - smoothstep(0.1, 0.3, h));
        // stars
        vec3 cell = floor(vDir * 260.0);
        float st = step(0.9965, hash(cell)) * smoothstep(0.25, 0.7, h);
        c += vec3(st) * (0.5 + 0.5 * hash(cell + 3.1));
        float s = max(dot(vDir, sunDir), 0.0);
        c += vec3(1.0, 0.75, 0.5) * pow(s, 600.0) * 3.0 + vec3(1.0, 0.5, 0.35) * pow(s, 12.0) * 0.3;
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
  const sky = new THREE.Mesh(geo, mat)
  sky.renderOrder = -2
  sky.frustumCulled = false
  return sky
}

export function buildMoon(): THREE.Mesh {
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(60, 32),
    new THREE.MeshBasicMaterial({ color: '#ffe8d2', fog: false, transparent: true, opacity: 0.9 }),
  )
  moon.position.set(-300, 260, -620)
  moon.lookAt(0, 0, 0)
  moon.renderOrder = -1
  return moon
}

/** Two layered rings of jagged mountains with a few pagoda spikes, all in one merged mesh. */
export function buildSkyline(): THREE.Mesh {
  const positions: number[] = []
  const colors: number[] = []
  const layer = (radius: number, base: number, amp: number, seed: number, low: THREE.Color, high: THREE.Color) => {
    const seg = 120
    const height = (a: number) => {
      let h = 0
      h += Math.sin(a * 3 + seed) * 0.5 + 0.5
      h += (Math.sin(a * 7.3 + seed * 2.1) * 0.5 + 0.5) * 0.6
      h += (Math.sin(a * 17.1 + seed * 0.7) * 0.5 + 0.5) * 0.25
      // occasional sharp spire
      const spike = Math.pow(Math.max(0, Math.sin(a * 23 + seed * 3)), 40) * 1.6
      return base + (h / 1.85) * amp + spike * amp * 0.5
    }
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2
      const a1 = ((i + 1) / seg) * Math.PI * 2
      const h0 = height(a0)
      const h1 = height(a1)
      const p = (a: number, y: number) => [Math.cos(a) * radius, y, Math.sin(a) * radius]
      const quad = [p(a0, -30), p(a1, -30), p(a1, h1), p(a0, -30), p(a1, h1), p(a0, h0)]
      const cols = [low, low, high, low, high, high]
      quad.forEach((v, k) => {
        positions.push(...v)
        colors.push(cols[k].r, cols[k].g, cols[k].b)
      })
    }
  }
  layer(720, 25, 110, 1.3, new THREE.Color('#c86a78'), new THREE.Color('#5a3060'))
  layer(520, 5, 55, 4.1, new THREE.Color('#9a4a68'), new THREE.Color('#2d1d40'))
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }),
  )
  mesh.renderOrder = -1
  mesh.frustumCulled = false
  return mesh
}

/** Floating embers animated entirely in the vertex shader. */
export class Embers {
  points: THREE.Points
  private mat: THREE.ShaderMaterial

  constructor(count: number) {
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 150
      pos[i * 3 + 1] = Math.random() * 60
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * 150
      seed[i] = Math.random() * 100
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1))
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, scale: { value: 300 } },
      vertexShader: `uniform float time; uniform float scale; attribute float seed; varying float vA;
        void main(){
          vec3 p = position;
          p.y = mod(p.y + time * (0.6 + fract(seed) * 0.8), 60.0);
          p.x += sin(time * 0.3 + seed) * 3.0;
          p.z += cos(time * 0.25 + seed * 1.3) * 3.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = smoothstep(0.0, 6.0, p.y) * (1.0 - smoothstep(48.0, 60.0, p.y)) * (0.5 + 0.5 * sin(time * 2.0 + seed * 7.0));
          gl_PointSize = clamp(scale * (0.08 + fract(seed * 3.7) * 0.08) / -mv.z, 1.0, 6.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(d)) * vA;
          gl_FragColor = vec4(1.0, 0.62, 0.38, a);
        }`,
    })
    this.points = new THREE.Points(geo, this.mat)
    this.points.frustumCulled = false
  }

  update(t: number, viewportHeight: number) {
    this.mat.uniforms.time.value = t
    this.mat.uniforms.scale.value = viewportHeight * 0.5
  }

  dispose() {
    this.points.geometry.dispose()
    this.mat.dispose()
  }
}

let blobTex: THREE.Texture | null = null
let blobGeo: THREE.PlaneGeometry | null = null

/** Soft round shadow decal used on Low quality instead of real shadow maps. */
export function makeBlobShadow(): THREE.Mesh {
  if (!blobTex) {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31)
    grad.addColorStop(0, 'rgba(0,0,0,0.55)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    blobTex = new THREE.CanvasTexture(c)
    blobGeo = new THREE.PlaneGeometry(1.3, 1.3)
    blobGeo.rotateX(-Math.PI / 2)
  }
  const m = new THREE.Mesh(
    blobGeo!,
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }),
  )
  m.renderOrder = 1
  return m
}
