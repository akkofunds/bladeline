import * as THREE from 'three'
import { Avatar, SLASH_TIME } from './avatar'
import { buildMapMeshes, generateMap, type Box } from './map'
import { Net } from './net'
import { createBody, floorHeight, MOVE, raycastBoxes, stepBody, type Body, type BodyEvent } from './physics'
import { Sfx } from './audio'
import { ViewModel } from './viewmodel'
import type { ChatLine, GameCallbacks, GameMode, HudState, NetMessage, PlayerInfo } from './types'

const SLASH_COOLDOWN = 0.42
const DASH_COOLDOWN = 2.2
const GRAPPLE_COOLDOWN = 0.7
const RESPAWN_TIME = 3
const EYE = 1.62
const TICK = 1 / 120
const BOT_NAMES = ['Kage', 'Sora', 'Ren', 'Hiro', 'Yumi', 'Tetsu', 'Mei', 'Akio']
const BOT_COLORS = ['#ff5d73', '#ffb84d', '#7dff9b', '#5dd6ff', '#c58bff', '#ff8bd8', '#f4ff6b', '#8bffef']

export const PLAYER_COLORS = ['#ff3b5c', '#ff9f1c', '#ffe14d', '#3bff8f', '#2ee6ff', '#5b7cff', '#b45bff', '#ff5bd1']

/** Damage scales with your speed — fast hits can one-shot. */
export function slashDamage(speed: number) {
  return Math.round(Math.min(100, 26 + speed * 1.7))
}

interface Bot {
  body: Body
  slashCD: number
  thinkT: number
  strafe: number
  jumpHold: boolean
  respawnAt: number
  targetId: string | null
  grappleT: number
}

interface Entity {
  id: string
  info: PlayerInfo
  avatar: Avatar
  rope: THREE.Mesh
  pos: THREE.Vector3
  netPos: THREE.Vector3
  vel: THREE.Vector3
  yaw: number
  pitch: number
  alive: boolean
  onGround: boolean
  hp: number
  slashSeq: number
  slashT: number
  grapple: THREE.Vector3 | null
  lastUpdate: number
  bot?: Bot
}

interface Particle {
  mesh: THREE.Mesh
  vel: THREE.Vector3
  life: number
}

export interface StartOptions {
  name: string
  color: string
  room?: string
}

export class Game {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(100, 1, 0.05, 1200)
  private vmScene = new THREE.Scene()
  private vmCamera = new THREE.PerspectiveCamera(68, 1, 0.01, 10)
  private sun = new THREE.DirectionalLight('#ffd7ad', 2.4)
  private boxes: Box[]
  private spawns: THREE.Vector3[]
  private mapGroup: THREE.Group
  private lastFrame = performance.now()
  private raf = 0
  private acc = 0
  private now = 0

  private mode: GameMode = 'menu'
  private net: Net | null = null
  private entities = new Map<string, Entity>()
  private particles: Particle[] = []
  private sfx = new Sfx()

  // local player
  private myId = 'me'
  private info: PlayerInfo = { id: 'me', name: 'You', color: PLAYER_COLORS[0], kills: 0, deaths: 0, isYou: true }
  private body: Body
  private yaw = 0
  private pitch = 0
  private hp = 100
  private alive = true
  private respawnAt = 0
  private slashCD = 0
  private slashSeq = 0
  private pendingHit = -1
  private dashCD = 0
  private grappleCD = 0
  private grappleHeld = false
  private topSpeed = 0
  private hitMarker = 0
  private lastDamage = 0
  private damageFlash = 0
  private thirdPerson = false
  private myAvatar: Avatar
  private myRope: THREE.Mesh
  private viewModel: ViewModel
  private lastKiller: string | null = null

  // input
  private keys = new Set<string>()
  private mouseDown = false
  private mouseDX = 0
  private mouseDY = 0
  private typing = false
  private locked = false
  sensitivity = 0.0022
  // touch input (mobile): the UI drives these through the public touch* methods
  private touchMode = false
  private touchActive = false
  private touchMoveX = 0
  private touchMoveY = 0
  private touchJump = false

  private sendT = 0
  private hudT = 0
  private lineId = 0
  private menuAngle = 0
  private disposed = false

  constructor(
    private container: HTMLElement,
    private cb: GameCallbacks,
  ) {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    // phones have dense screens but weak GPUs: render at a lower ratio there
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.25 : 1.75))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.autoClear = false
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'

    const { boxes, spawns } = generateMap()
    this.boxes = boxes
    this.spawns = spawns
    this.mapGroup = buildMapMeshes(boxes)
    this.scene.add(this.mapGroup)
    this.buildSky()

    this.scene.add(new THREE.HemisphereLight('#a9b4ff', '#40283a', 1.1))
    this.sun.position.set(80, 120, 40)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048)
    const sc = this.sun.shadow.camera
    sc.left = sc.bottom = -70
    sc.right = sc.top = 70
    sc.near = 1
    sc.far = 400
    this.sun.shadow.bias = -0.0005
    this.scene.add(this.sun, this.sun.target)

    this.vmScene.add(new THREE.HemisphereLight('#c8ceff', '#50303a', 1.6))
    const vmSun = new THREE.DirectionalLight('#ffe2c4', 2)
    vmSun.position.set(1, 2, 1)
    this.vmScene.add(vmSun)

    this.body = createBody(this.spawns[0])
    this.myAvatar = new Avatar('You', this.info.color)
    this.myAvatar.root.visible = false
    this.myAvatar.setLabelVisible(false)
    this.scene.add(this.myAvatar.root)
    this.myRope = this.makeRope('#ffffff')
    this.viewModel = new ViewModel(this.info.color)
    this.vmScene.add(this.viewModel.group)

    this.bindInput()
    this.resize()
    window.addEventListener('resize', this.resize)

    // the menu shows bots duelling while the camera orbits the arena
    for (let i = 0; i < 6; i++) this.addBot(i)
    this.loop()
  }

  /* ---------------- lifecycle ---------------- */

  async start(mode: Exclude<GameMode, 'menu'>, opts: StartOptions) {
    this.mode = mode
    this.info = { id: 'me', name: opts.name.slice(0, 16) || 'Ronin', color: opts.color, kills: 0, deaths: 0, isYou: true }
    this.myId = 'me'
    this.rebuildMyVisuals()
    this.clearEntities()
    this.respawn()

    if (mode === 'practice') {
      for (let i = 0; i < 5; i++) this.addBot(i)
      this.cb.onStatus({ kind: 'online', room: undefined })
      this.systemChat('Practice arena: five sparring bots. Chat works once you host or join a room.')
      return
    }

    this.cb.onStatus({ kind: 'connecting' })
    this.net = new Net({
      onReady: (id, room) => {
        this.myId = id
        this.info.id = id
        this.cb.onStatus({ kind: 'online', room })
        if (mode === 'host') this.systemChat(`Room ${room} is live. Share the code or the invite link with your friends.`)
      },
      onError: (message) => this.cb.onStatus({ kind: 'error', message }),
      onMessage: (msg) => this.onNet(msg),
      onPeerLeft: (id) => this.removePlayer(id),
    })
    if (mode === 'host') await this.net.hostRoom({ name: this.info.name, color: this.info.color })
    else await this.net.joinRoom(opts.room ?? '', { name: this.info.name, color: this.info.color })
  }

  leave() {
    this.net?.close()
    this.net = null
    this.mode = 'menu'
    this.clearEntities()
    for (let i = 0; i < 6; i++) this.addBot(i)
    document.exitPointerLock?.()
    this.touchActive = false
    this.clearTouch()
    this.cb.onStatus({ kind: 'idle' })
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.net?.close()
    this.sfx.close()
    window.removeEventListener('resize', this.resize)
    this.unbindInput()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private rebuildMyVisuals() {
    this.scene.remove(this.myAvatar.root)
    this.myAvatar = new Avatar(this.info.name, this.info.color)
    this.myAvatar.setLabelVisible(false)
    this.scene.add(this.myAvatar.root)
    this.vmScene.remove(this.viewModel.group)
    this.viewModel = new ViewModel(this.info.color)
    this.vmScene.add(this.viewModel.group)
  }

  /* ---------------- public controls ---------------- */

  setTyping(v: boolean) {
    this.typing = v
    if (v) {
      this.keys.clear()
      this.mouseDown = false
      this.clearTouch()
    }
  }

  /** In touch mode the game is "active" while unpaused instead of needing pointer lock. */
  setTouchMode(v: boolean) {
    this.touchMode = v
    if (!v) {
      this.touchActive = false
      this.clearTouch()
    }
  }

  pause() {
    this.touchActive = false
    this.clearTouch()
    document.exitPointerLock?.()
  }

  /** Analog move from the virtual stick: x = strafe (right +), y = forward (+). */
  touchMove(x: number, y: number) {
    this.touchMoveX = x
    this.touchMoveY = y
  }

  /** Look drag in screen pixels. */
  touchLook(dx: number, dy: number) {
    if (!this.touchActive) return
    this.mouseDX += dx * 1.6
    this.mouseDY += dy * 1.6
  }

  touchButton(btn: 'jump' | 'slash' | 'grapple', down: boolean) {
    if (!this.touchActive && down) return
    if (btn === 'jump') this.touchJump = down
    if (btn === 'slash') {
      this.mouseDown = down
      if (down) this.trySlash()
    }
    if (btn === 'grapple') {
      if (down) this.startGrapple()
      else this.releaseGrapple()
    }
  }

  touchDash() {
    if (this.touchActive) this.tryDash()
  }

  toggleCamera() {
    this.thirdPerson = !this.thirdPerson
  }

  private clearTouch() {
    this.touchMoveX = this.touchMoveY = 0
    this.touchJump = false
    this.mouseDown = false
    this.releaseGrapple()
  }

  requestLock() {
    if (this.mode === 'menu') return
    if (this.touchMode) {
      this.touchActive = true
      return
    }
    try {
      const r = this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined
      r?.catch?.(() => {})
    } catch {
      /* ignored: browsers throttle relock right after Esc */
    }
  }

  sendChat(text: string) {
    const clean = text.trim().slice(0, 200)
    if (!clean) return
    this.pushChat({ from: this.info.name, color: this.info.color, text: clean })
    this.net?.send({ t: 'chat', id: this.myId, name: this.info.name, color: this.info.color, text: clean })
  }

  /* ---------------- input ---------------- */

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.typing || this.mode === 'menu') return
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault()
    if (e.code === 'Enter' || e.code === 'KeyT') {
      e.preventDefault()
      this.keys.clear()
      this.cb.onRequestChat()
      return
    }
    if (e.repeat) return
    this.keys.add(e.code)
    if (e.code === 'KeyF') this.startGrapple()
    if (e.code === 'KeyV') this.thirdPerson = !this.thirdPerson
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
    if (e.code === 'KeyF') this.releaseGrapple()
  }
  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return
    this.mouseDX += e.movementX
    this.mouseDY += e.movementY
  }
  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked) return
    if (e.button === 0) {
      this.mouseDown = true
      this.trySlash()
    }
    if (e.button === 2) this.tryDash()
  }
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false
  }
  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement
    if (!this.locked) {
      this.keys.clear()
      this.mouseDown = false
      this.releaseGrapple()
    }
  }
  private onContext = (e: Event) => e.preventDefault()
  private onBlur = () => {
    this.keys.clear()
    this.mouseDown = false
  }

  private bindInput() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('pointerlockchange', this.onLockChange)
    this.renderer.domElement.addEventListener('contextmenu', this.onContext)
  }
  private unbindInput() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('pointerlockchange', this.onLockChange)
  }

  private resize = () => {
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.vmCamera.aspect = w / h
    this.vmCamera.updateProjectionMatrix()
  }

  /* ---------------- world helpers ---------------- */

  private buildSky() {
    const geo = new THREE.SphereGeometry(900, 32, 16)
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#1a1442') },
        mid: { value: new THREE.Color('#7a3a7a') },
        horizon: { value: new THREE.Color('#ff9a6a') },
        sunDir: { value: new THREE.Vector3(80, 120, 40).normalize() },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
        void main(){
          float h = vDir.y;
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, h));
          c = mix(c, top, smoothstep(0.25, 0.8, h));
          c = mix(c, horizon * 0.6, smoothstep(0.0, -0.2, h));
          float s = max(dot(vDir, sunDir), 0.0);
          c += vec3(1.0, 0.75, 0.5) * pow(s, 600.0) * 3.0 + vec3(1.0,0.5,0.35) * pow(s, 12.0) * 0.35;
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
    const sky = new THREE.Mesh(geo, mat)
    sky.renderOrder = -1
    this.scene.add(sky)
    this.scene.fog = new THREE.Fog('#b0627a', 120, 420)

    // a giant pale moon for silhouette
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(60, 48),
      new THREE.MeshBasicMaterial({ color: '#ffe8d2', fog: false, transparent: true, opacity: 0.9 }),
    )
    moon.position.set(-300, 260, -620)
    moon.lookAt(0, 0, 0)
    this.scene.add(moon)
  }

  private makeRope(color: string) {
    const rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1, 5, 1, true),
      new THREE.MeshBasicMaterial({ color }),
    )
    rope.visible = false
    this.scene.add(rope)
    return rope
  }

  private placeRope(rope: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3 | null) {
    if (!to) {
      rope.visible = false
      return
    }
    const d = new THREE.Vector3().subVectors(to, from)
    const len = d.length()
    rope.visible = len > 0.1
    rope.position.copy(from).addScaledVector(d, 0.5)
    rope.scale.set(1, len, 1)
    rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
  }

  private lookDir(yaw = this.yaw, pitch = this.pitch) {
    return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
  }

  private pickSpawn(): THREE.Vector3 {
    const others = [...this.entities.values()].filter((e) => e.alive).map((e) => e.pos)
    let best = this.spawns[0]
    let bestScore = -1
    for (const s of this.spawns) {
      const d = others.length ? Math.min(...others.map((o) => o.distanceTo(s))) : Math.random() * 100
      const score = d + Math.random() * 25
      if (score > bestScore) {
        bestScore = score
        best = s
      }
    }
    const p = best.clone()
    p.y = floorHeight(p.x, p.z, this.boxes) + 0.02
    return p
  }

  private spark(at: THREE.Vector3, color: string, count = 14, power = 7) {
    for (let i = 0; i < count; i++) {
      let p = this.particles.find((q) => q.life <= 0)
      if (!p) {
        if (this.particles.length > 160) return
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.08, 0.08),
          new THREE.MeshBasicMaterial({ color, transparent: true }),
        )
        this.scene.add(mesh)
        p = { mesh, vel: new THREE.Vector3(), life: 0 }
        this.particles.push(p)
      }
      ;(p.mesh.material as THREE.MeshBasicMaterial).color.set(color)
      p.mesh.visible = true
      p.mesh.position.copy(at)
      p.vel.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(power * (0.4 + Math.random()))
      p.life = 0.45 + Math.random() * 0.35
    }
  }

  /* ---------------- entities ---------------- */

  private createEntity(info: PlayerInfo, pos: THREE.Vector3): Entity {
    const avatar = new Avatar(info.name, info.color)
    this.scene.add(avatar.root)
    return {
      id: info.id,
      info,
      avatar,
      rope: this.makeRope(info.color),
      pos: pos.clone(),
      netPos: pos.clone(),
      vel: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      alive: true,
      onGround: true,
      hp: 100,
      slashSeq: 0,
      slashT: -1,
      grapple: null,
      lastUpdate: this.now,
    }
  }

  private addBot(i: number) {
    const id = `bot-${i}-${Math.random().toString(36).slice(2, 6)}`
    const info: PlayerInfo = {
      id,
      name: BOT_NAMES[i % BOT_NAMES.length],
      color: BOT_COLORS[i % BOT_COLORS.length],
      kills: 0,
      deaths: 0,
      isBot: true,
    }
    const pos = this.pickSpawn()
    const e = this.createEntity(info, pos)
    e.bot = {
      body: createBody(pos),
      slashCD: 1,
      thinkT: 0,
      strafe: Math.random() < 0.5 ? 1 : -1,
      jumpHold: false,
      respawnAt: 0,
      targetId: null,
      grappleT: 0,
    }
    this.entities.set(id, e)
  }

  private removeEntity(e: Entity) {
    this.scene.remove(e.avatar.root)
    this.scene.remove(e.rope)
    this.entities.delete(e.id)
  }

  private clearEntities() {
    for (const e of [...this.entities.values()]) this.removeEntity(e)
  }

  private removePlayer(id: string) {
    const e = this.entities.get(id)
    if (!e) return
    this.systemChat(`${e.info.name} left the arena`)
    this.removeEntity(e)
  }

  /* ---------------- networking ---------------- */

  private onNet(msg: NetMessage) {
    switch (msg.t) {
      case 'welcome': {
        this.myId = msg.you
        this.info.id = msg.you
        for (const p of msg.players) {
          if (p.id === msg.you) continue
          if (!this.entities.has(p.id)) this.entities.set(p.id, this.createEntity({ ...p }, new THREE.Vector3(0, -50, 0)))
        }
        this.systemChat(`Joined room — ${msg.players.length} ronin in the arena. Press Enter to chat.`)
        break
      }
      case 'join': {
        if (msg.player.id === this.myId || this.entities.has(msg.player.id)) break
        this.entities.set(msg.player.id, this.createEntity({ ...msg.player }, new THREE.Vector3(0, -50, 0)))
        this.systemChat(`${msg.player.name} entered the arena`)
        break
      }
      case 'leave':
        this.removePlayer(msg.id)
        break
      case 'state': {
        const e = this.entities.get(msg.id)
        if (!e) break
        const np = new THREE.Vector3(...msg.p)
        if (np.distanceTo(e.pos) > 12 || (!e.alive && msg.alive)) e.pos.copy(np)
        e.netPos.copy(np)
        e.vel.set(...msg.v)
        e.yaw = msg.yaw
        e.pitch = msg.pitch
        e.alive = msg.alive
        e.onGround = msg.gr
        e.hp = msg.hp
        if (msg.slash > e.slashSeq) {
          e.slashT = 0
          if (e.pos.distanceTo(this.body.pos) < 30) this.sfx.slash(0.4)
        }
        e.slashSeq = msg.slash
        e.grapple = msg.g ? new THREE.Vector3(...msg.g) : null
        e.lastUpdate = this.now
        break
      }
      case 'hit':
        if (msg.to === this.myId) this.takeDamage(msg.dmg, msg.from, new THREE.Vector3(...msg.kb))
        break
      case 'death':
        this.registerDeath(msg.id, msg.by, msg.speed)
        break
      case 'chat': {
        if (msg.id === this.myId) break
        this.pushChat({ from: msg.name, color: msg.color, text: String(msg.text).slice(0, 200) })
        break
      }
      default:
        break
    }
  }

  private sendState() {
    if (!this.net || !this.myId || this.myId === 'me') return
    const b = this.body
    const r = (n: number) => Math.round(n * 100) / 100
    this.net.send({
      t: 'state',
      id: this.myId,
      p: [r(b.pos.x), r(b.pos.y), r(b.pos.z)],
      v: [r(b.vel.x), r(b.vel.y), r(b.vel.z)],
      yaw: r(this.yaw),
      pitch: r(this.pitch),
      alive: this.alive,
      gr: b.onGround,
      hp: Math.max(0, Math.round(this.hp)),
      slash: this.slashSeq,
      g: b.grapple ? [r(b.grapple.x), r(b.grapple.y), r(b.grapple.z)] : null,
    })
  }

  /* ---------------- chat + feed ---------------- */

  private pushChat(line: Omit<ChatLine, 'id'>) {
    this.cb.onChat({ id: ++this.lineId, ...line })
  }
  private systemChat(text: string) {
    this.pushChat({ from: '', color: '#ffffff', text, system: true })
  }

  private findInfo(id: string): PlayerInfo | undefined {
    if (id === this.myId || id === 'me') return this.info
    return this.entities.get(id)?.info
  }

  private registerDeath(victimId: string, killerId: string, speed: number) {
    const v = this.findInfo(victimId)
    const k = this.findInfo(killerId)
    if (v) v.deaths++
    if (k && killerId !== victimId) k.kills++
    if (v && k) {
      this.cb.onKill({
        id: ++this.lineId,
        killer: k.name,
        killerColor: k.color,
        victim: v.name,
        victimColor: v.color,
        speed: Math.round(speed),
      })
    }
    if ((killerId === this.myId || killerId === 'me') && victimId !== killerId) this.sfx.kill()
  }

  /* ---------------- combat ---------------- */

  private speedH(v: THREE.Vector3) {
    return Math.hypot(v.x, v.z)
  }

  private trySlash() {
    if (!this.alive || this.slashCD > 0 || this.mode === 'menu') return
    this.slashCD = SLASH_COOLDOWN
    this.slashSeq++
    const side = this.slashSeq % 2 ? 1 : -1
    this.viewModel.slash(side)
    this.sfx.slash()
    this.pendingHit = 0.08
  }

  private resolveMySlash() {
    const eye = this.body.pos.clone().add(new THREE.Vector3(0, EYE, 0))
    const look = this.lookDir()
    const speed = this.body.vel.length()
    const reach = 3.3 + Math.min(1.6, speed * 0.035)
    const dmg = slashDamage(speed)
    let landed = false
    for (const e of this.entities.values()) {
      if (!e.alive) continue
      const center = e.pos.clone().add(new THREE.Vector3(0, 1, 0))
      const to = center.sub(eye)
      const dist = to.length()
      if (dist > reach) continue
      to.normalize()
      if (dist > 1.3 && to.dot(look) < 0.5) continue
      // walls block slashes
      const wall = raycastBoxes(eye, to, dist, this.boxes)
      if (wall && wall.t < dist - 0.6) continue
      const kb = look.clone().setY(0).normalize().multiplyScalar(7).add(new THREE.Vector3(0, 4, 0))
      kb.addScaledVector(this.body.vel, 0.25)
      this.applyHit(this.myId, e, dmg, kb)
      landed = true
    }
    if (landed) {
      this.hitMarker = performance.now()
      this.lastDamage = dmg
      this.sfx.hit()
    }
  }

  private applyHit(fromId: string, victim: Entity, dmg: number, kb: THREE.Vector3) {
    this.spark(victim.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), '#ff3b5c', 16, 8)
    if (victim.bot) {
      victim.hp -= dmg
      victim.bot.body.vel.add(kb)
      victim.bot.body.onGround = false
      if (victim.hp <= 0 && victim.alive) {
        victim.alive = false
        victim.bot.respawnAt = this.now + RESPAWN_TIME
        victim.bot.body.grapple = null
        const atk = fromId === this.myId ? this.body.vel : (this.entities.get(fromId)?.vel ?? new THREE.Vector3())
        this.registerDeath(victim.id, fromId, atk.length())
      }
    } else if (this.net) {
      this.net.send({ t: 'hit', from: this.myId, to: victim.id, dmg, kb: [kb.x, kb.y, kb.z] })
    }
  }

  private takeDamage(dmg: number, fromId: string, kb: THREE.Vector3) {
    if (!this.alive) return
    this.hp -= dmg
    this.damageFlash = performance.now()
    this.body.vel.add(kb)
    this.body.onGround = false
    this.sfx.hurt()
    this.spark(this.body.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), '#ff3b5c', 10, 6)
    if (this.hp <= 0) {
      this.alive = false
      this.hp = 0
      this.respawnAt = this.now + RESPAWN_TIME
      this.body.grapple = null
      this.lastKiller = fromId
      const atk = this.entities.get(fromId)
      const speed = atk ? (atk.bot ? atk.bot.body.vel.length() : atk.vel.length()) : 0
      this.registerDeath(this.myId, fromId, speed)
      this.net?.send({ t: 'death', id: this.myId, by: fromId, speed })
    }
  }

  private respawn() {
    this.body = createBody(this.pickSpawn())
    this.hp = 100
    this.alive = true
    this.lastKiller = null
    this.yaw = Math.atan2(this.body.pos.x, this.body.pos.z) // face the shrine
    this.pitch = 0
    this.topSpeed = 0
  }

  private tryDash() {
    if (!this.alive || this.dashCD > 0 || this.mode === 'menu') return
    this.dashCD = DASH_COOLDOWN
    const d = this.lookDir()
    const flat = new THREE.Vector3(d.x, 0, d.z).normalize()
    this.body.vel.addScaledVector(flat, 11)
    this.body.vel.y = Math.max(this.body.vel.y, 3.5)
    this.body.onGround = false
    this.sfx.boost()
  }

  private startGrapple() {
    if (!this.alive || this.grappleCD > 0 || this.body.grapple || this.mode === 'menu') return
    this.grappleHeld = true
    const eye = this.body.pos.clone().add(new THREE.Vector3(0, EYE, 0))
    const hit = raycastBoxes(eye, this.lookDir(), MOVE.grappleRange, this.boxes)
    if (!hit) {
      this.grappleCD = 0.25
      this.sfx.tone(500, 300, 0.1, 0.1)
      return
    }
    this.body.grapple = hit.point.clone().addScaledVector(hit.normal, 0.05)
    this.body.ropeLen = hit.t
    // slow? the hook yanks you up to speed
    const sp = this.speedH(this.body.vel)
    if (sp < 16) {
      const dir = new THREE.Vector3().subVectors(hit.point, eye).normalize()
      this.body.vel.addScaledVector(dir, Math.min(10, 16 - sp + 3))
    }
    this.sfx.grapple()
  }

  private releaseGrapple() {
    if (!this.grappleHeld && !this.body.grapple) return
    this.grappleHeld = false
    if (this.body.grapple) {
      this.body.grapple = null
      this.grappleCD = GRAPPLE_COOLDOWN
    }
  }

  /* ---------------- bots ---------------- */

  private combatants() {
    const list: { id: string; pos: THREE.Vector3; alive: boolean }[] = []
    if (this.mode !== 'menu') list.push({ id: this.myId, pos: this.body.pos, alive: this.alive })
    for (const e of this.entities.values()) list.push({ id: e.id, pos: e.pos, alive: e.alive })
    return list
  }

  private updateBot(e: Entity, dt: number) {
    const bot = e.bot!
    if (!e.alive) {
      if (this.now >= bot.respawnAt) {
        const p = this.pickSpawn()
        bot.body = createBody(p)
        e.pos.copy(p)
        e.hp = 100
        e.alive = true
      }
      return
    }
    bot.thinkT -= dt
    bot.slashCD -= dt
    bot.grappleT -= dt
    const all = this.combatants()
    if (bot.thinkT <= 0) {
      bot.thinkT = 0.5 + Math.random() * 0.5
      let best: string | null = null
      let bestD = 140
      for (const c of all) {
        if (c.id === e.id || !c.alive) continue
        const d = c.pos.distanceTo(e.pos) * (c.id === this.myId ? 0.8 : 1)
        if (d < bestD) {
          bestD = d
          best = c.id
        }
      }
      bot.targetId = best
      if (Math.random() < 0.3) bot.strafe *= -1
      bot.jumpHold = Math.random() < 0.7
    }
    const target = all.find((c) => c.id === bot.targetId && c.alive)
    const wish = new THREE.Vector3()
    let dist = 999
    if (target) {
      const to = new THREE.Vector3().subVectors(target.pos, e.pos)
      dist = to.length()
      to.y = 0
      to.normalize()
      e.yaw = Math.atan2(-to.x, -to.z)
      const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(bot.strafe * (dist < 6 ? 0.8 : 0.25))
      wish.copy(to).add(side).normalize()
      // hook up toward high targets
      if (target.pos.y - e.pos.y > 4 && bot.grappleT < -2 && !bot.body.grapple) {
        const eye = e.pos.clone().add(new THREE.Vector3(0, EYE, 0))
        const up = new THREE.Vector3().subVectors(target.pos, eye).add(new THREE.Vector3(0, 6, 0)).normalize()
        const hit = raycastBoxes(eye, up, 60, this.boxes)
        if (hit) {
          bot.body.grapple = hit.point
          bot.body.ropeLen = hit.t
          bot.grappleT = 1.2
        }
      }
      if (dist < 3.2 && bot.slashCD <= 0) {
        bot.slashCD = 0.75 + Math.random() * 0.5
        e.slashSeq++
        e.slashT = 0
        if (e.pos.distanceTo(this.body.pos) < 30 && this.mode !== 'menu') this.sfx.slash(0.35)
        if (Math.random() < 0.72) {
          const dmg = Math.round(11 + bot.body.vel.length() * 0.9)
          const kb = to.clone().multiplyScalar(5).add(new THREE.Vector3(0, 3.5, 0))
          if (target.id === this.myId) this.takeDamage(dmg, e.id, kb)
          else {
            const victim = this.entities.get(target.id)
            if (victim) this.applyHit(e.id, victim, dmg, kb)
          }
        }
      }
    }
    if (bot.grappleT <= 0) bot.body.grapple = null
    const events: BodyEvent[] = []
    stepBody(bot.body, { wish, jump: bot.jumpHold && dist > 4 }, dt, this.boxes, events)
    e.pos.copy(bot.body.pos)
    e.vel.copy(bot.body.vel)
    e.onGround = bot.body.onGround
    e.grapple = bot.body.grapple
    e.pitch = 0
  }

  /* ---------------- main loop ---------------- */

  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const nowMs = performance.now()
    const dt = Math.min(0.05, (nowMs - this.lastFrame) / 1000)
    this.lastFrame = nowMs
    this.now += dt

    // mouse look
    if (this.mode !== 'menu' && (this.locked || this.touchActive)) {
      this.yaw -= this.mouseDX * this.sensitivity
      this.pitch -= this.mouseDY * this.sensitivity
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.54, 1.54)
    }
    const mdx = this.mouseDX
    const mdy = this.mouseDY
    this.mouseDX = this.mouseDY = 0

    this.acc += dt
    while (this.acc >= TICK) {
      this.acc -= TICK
      this.fixedUpdate(TICK)
    }

    this.updateVisuals(dt, mdx, mdy)

    this.sendT -= dt
    if (this.sendT <= 0 && this.net) {
      this.sendT = 1 / 20
      this.sendState()
    }
    this.hudT -= dt
    if (this.hudT <= 0) {
      this.hudT = 1 / 15
      this.emitHud()
    }

    this.renderer.clear()
    this.renderer.render(this.scene, this.camera)
    if (this.mode !== 'menu' && this.alive && !this.thirdPerson) {
      this.renderer.clearDepth()
      this.renderer.render(this.vmScene, this.vmCamera)
    }
  }

  private fixedUpdate(dt: number) {
    if (this.mode !== 'menu') {
      this.slashCD = Math.max(0, this.slashCD - dt)
      this.dashCD = Math.max(0, this.dashCD - dt)
      this.grappleCD = Math.max(0, this.grappleCD - dt)
      if (this.pendingHit >= 0) {
        this.pendingHit -= dt
        if (this.pendingHit < 0) this.resolveMySlash()
      }
      if (this.mouseDown) this.trySlash()

      if (this.alive) {
        const k = this.keys
        let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
        let s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
        if (this.touchActive) {
          f = THREE.MathUtils.clamp(f + this.touchMoveY, -1, 1)
          s = THREE.MathUtils.clamp(s + this.touchMoveX, -1, 1)
        }
        const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
        const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
        const wish = fwd.multiplyScalar(f).addScaledVector(right, s)
        const events: BodyEvent[] = []
        stepBody(this.body, { wish, jump: k.has('Space') || (this.touchActive && this.touchJump) }, dt, this.boxes, events)
        for (const ev of events) {
          if (ev === 'jump') this.sfx.jump()
          if (ev === 'pad') this.sfx.pad()
          if (ev === 'boost') this.sfx.boost()
        }
        const sp = this.speedH(this.body.vel)
        if (sp > this.topSpeed) this.topSpeed = sp
        if (this.body.pos.y < -40) this.takeDamage(999, this.myId, new THREE.Vector3())
      } else if (this.now >= this.respawnAt) {
        this.respawn()
      }
    }
    for (const e of this.entities.values()) if (e.bot) this.updateBot(e, dt)
  }

  private updateVisuals(dt: number, mdx: number, mdy: number) {
    // remote players: extrapolate from last snapshot, smooth toward it
    for (const e of this.entities.values()) {
      if (!e.bot) {
        const age = Math.min(0.25, this.now - e.lastUpdate)
        const predicted = e.netPos.clone().addScaledVector(e.vel, age)
        e.pos.lerp(predicted, 1 - Math.exp(-dt * 18))
      }
      if (e.slashT >= 0) {
        e.slashT += dt
        if (e.slashT > SLASH_TIME) e.slashT = -1
      }
      e.avatar.root.position.copy(e.pos)
      e.avatar.root.rotation.y = e.yaw
      e.avatar.update(dt, {
        speedH: this.speedH(e.vel),
        onGround: e.onGround,
        vy: e.vel.y,
        pitch: e.pitch,
        slashT: e.slashT,
        slashSide: e.slashSeq % 2 ? 1 : -1,
        grappling: !!e.grapple,
        alive: e.alive,
      })
      e.avatar.drawLabel(e.hp)
      const hand = e.pos.clone().add(new THREE.Vector3(0, 1.4, 0))
      this.placeRope(e.rope, hand, e.alive ? e.grapple : null)
    }

    // particles
    for (const p of this.particles) {
      if (p.life <= 0) continue
      p.life -= dt
      p.vel.y -= 18 * dt
      p.mesh.position.addScaledVector(p.vel, dt)
      ;(p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life * 2)
      if (p.life <= 0) p.mesh.visible = false
    }
    // pad rings pulse
    const t = this.now
    this.mapGroup.children.forEach((c) => {
      if (c.userData.pad) {
        c.position.y += Math.sin(t * 3 + c.position.x) * 0.004
        c.rotation.z = t
      }
    })

    if (this.mode === 'menu') {
      this.menuAngle += dt * 0.05
      const r = 95
      this.camera.position.set(Math.cos(this.menuAngle) * r, 34, Math.sin(this.menuAngle) * r)
      this.camera.lookAt(0, 10, 0)
      this.camera.fov = 70
      this.camera.updateProjectionMatrix()
      this.sun.target.position.set(0, 0, 0)
      this.sun.position.set(80, 120, 40)
      this.myAvatar.root.visible = false
      this.myRope.visible = false
      return
    }

    // local avatar (third person / death cam)
    const speedH = this.speedH(this.body.vel)
    const mySlashT = this.slashCD > 0 ? SLASH_COOLDOWN - this.slashCD : -1
    this.myAvatar.root.position.copy(this.body.pos)
    this.myAvatar.root.rotation.y = this.yaw
    this.myAvatar.update(dt, {
      speedH,
      onGround: this.body.onGround,
      vy: this.body.vel.y,
      pitch: this.pitch,
      slashT: mySlashT,
      slashSide: this.slashSeq % 2 ? 1 : -1,
      grappling: !!this.body.grapple,
      alive: this.alive,
    })
    const showSelf = this.thirdPerson || !this.alive
    this.myAvatar.root.visible = showSelf

    const eye = this.body.pos.clone().add(new THREE.Vector3(0, EYE, 0))
    const look = this.lookDir()
    if (!this.alive) {
      // death cam orbits your body and looks at the killer if visible
      const killer = this.lastKiller ? this.entities.get(this.lastKiller) : undefined
      const focus = killer?.alive ? killer.pos.clone().add(new THREE.Vector3(0, 1, 0)) : this.body.pos
      const a = this.now * 0.6
      this.camera.position.set(this.body.pos.x + Math.cos(a) * 6, this.body.pos.y + 4, this.body.pos.z + Math.sin(a) * 6)
      this.camera.lookAt(focus)
    } else if (this.thirdPerson) {
      const back = look.clone().multiplyScalar(-4.5).add(new THREE.Vector3(0, 0.6, 0))
      const len = back.length()
      const hit = raycastBoxes(eye, back.clone().normalize(), len, this.boxes)
      const dist = hit ? Math.max(0.5, hit.t - 0.3) : len
      this.camera.position.copy(eye).addScaledVector(back.normalize(), dist)
      this.camera.lookAt(eye.clone().addScaledVector(look, 10))
    } else {
      this.camera.position.copy(eye)
      this.camera.rotation.set(0, 0, 0)
      this.camera.rotation.order = 'YXZ'
      this.camera.rotation.y = this.yaw
      this.camera.rotation.x = this.pitch
      // subtle roll when strafing
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
      const lateral = this.body.vel.dot(right)
      this.camera.rotation.z = THREE.MathUtils.clamp(-lateral * 0.003, -0.04, 0.04)
    }
    const targetFov = 98 + THREE.MathUtils.clamp((this.body.vel.length() - 10) * 0.45, 0, 22)
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 6)
    this.camera.updateProjectionMatrix()

    // grapple rope from the off hand
    const hand = this.thirdPerson
      ? this.body.pos.clone().add(new THREE.Vector3(0, 1.4, 0))
      : eye
          .clone()
          .add(new THREE.Vector3(-0.35, -0.35, -0.3).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')))
    this.placeRope(this.myRope, hand, this.alive ? this.body.grapple : null)

    this.viewModel.update(dt, speedH, this.body.onGround, mdx, mdy)
    this.sfx.setWind(this.body.vel.length())

    // shadows follow the player
    this.sun.target.position.copy(this.body.pos)
    this.sun.position.copy(this.body.pos).add(new THREE.Vector3(80, 120, 40))
  }

  private emitHud() {
    const players: PlayerInfo[] = []
    if (this.mode !== 'menu') players.push({ ...this.info, id: this.myId, isYou: true })
    for (const e of this.entities.values()) players.push({ ...e.info })
    players.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    const hud: HudState = {
      t: performance.now(),
      speed: this.speedH(this.body.vel),
      topSpeed: this.topSpeed,
      hp: Math.max(0, this.hp),
      alive: this.alive,
      respawnIn: Math.max(0, this.respawnAt - this.now),
      grappleReady: this.body.grapple ? 1 : 1 - this.grappleCD / GRAPPLE_COOLDOWN,
      grappling: !!this.body.grapple,
      dashReady: 1 - this.dashCD / DASH_COOLDOWN,
      slashReady: 1 - this.slashCD / SLASH_COOLDOWN,
      hitMarker: this.hitMarker,
      lastDamage: this.lastDamage,
      damageFlash: this.damageFlash,
      locked: this.locked || this.touchActive,
      thirdPerson: this.thirdPerson,
      players,
    }
    this.cb.onHud(hud)
  }
}

