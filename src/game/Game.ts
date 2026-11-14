import * as THREE from 'three'
import { Avatar, SLASH_TIME } from './avatar'
import { buildMapMeshes, generateMap, type Box } from './map'
import { Net } from './net'
import { createBody, floorHeight, MOVE, raycastBoxes, stepBody, type Body, type BodyEvent } from './physics'
import { Sfx } from './audio'
import { ViewModel } from './viewmodel'
import { buildMoon, buildSky, buildSkyline, Embers, makeBlobShadow, SUN_DIR } from './scenery'
import {
  ALLY_COLOR,
  ENEMY_COLOR,
  INTRO_SECONDS,
  MODES,
  slashDamage,
  type MatchMode,
  type MatchPhase,
  type Quality,
} from './rules'
import type { ChatLine, GameCallbacks, GameMode, HudState, MatchSync, NetMessage, PlayerInfo } from './types'

export { slashDamage }

const SLASH_COOLDOWN = 0.42
const DASH_COOLDOWN = 2.2
const GRAPPLE_COOLDOWN = 0.7
const RESPAWN_TIME = 3
const TRAINING_RESPAWN = 1.5
const COUNTDOWN = 4
const ONLINE_RESTART = 12
const EYE = 1.62
/** hook release in the air: speed added along your travel direction */
const SLING_BASE = 2.5
const SLING_MAX = 9
/** after a hook release, the next few hops each add speed while jump is held */
const MOMENTUM_WINDOW = 1.8
const MOMENTUM_HOPS = 3
const MOMENTUM_HOP_BONUS = 1.6
const TICK = 1 / 120
const BOT_NAMES = ['Kage', 'Sora', 'Ren', 'Hiro', 'Yumi', 'Tetsu', 'Mei', 'Akio', 'Rin', 'Daichi', 'Nami', 'Shin']
const BOT_COLORS = ['#ff5d73', '#ffb84d', '#7dff9b', '#5dd6ff', '#c58bff', '#ff8bd8', '#f4ff6b', '#8bffef']

export const PLAYER_COLORS = ['#ff3b5c', '#ff9f1c', '#ffe14d', '#3bff8f', '#2ee6ff', '#5b7cff', '#b45bff', '#ff5bd1']

interface Bot {
  body: Body
  slashCD: number
  thinkT: number
  strafe: number
  jumpHold: boolean
  respawnAt: number
  targetId: string | null
  grappleT: number
  passive: boolean
  wander: THREE.Vector3
}

interface Entity {
  id: string
  info: PlayerInfo
  avatar: Avatar
  rope: Rope
  blob: THREE.Mesh
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

/** Glowing red hook line: a hot core, a soft additive glow, and a flare at the anchor. */
interface Rope {
  line: THREE.Group
  anchor: THREE.Mesh
}

export type ResolutionMode = 'auto' | '75' | '100' | 'native'

interface Particle {
  mesh: THREE.Mesh
  vel: THREE.Vector3
  life: number
}

export interface StartOptions {
  name: string
  color: string
  room?: string
  match: MatchMode
}

export interface GameOptions {
  quality: Quality
}

const _v1 = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const DOWN = new THREE.Vector3(0, -1, 0)

/** Boot flyover: skims the arena floor, climbs past the shrine, and ends where the lobby orbit starts. */
const INTRO_PATH = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-125, 62, 115),
  new THREE.Vector3(-78, 16, 74),
  new THREE.Vector3(-38, 5, 44),
  new THREE.Vector3(4, 7, 33),
  new THREE.Vector3(34, 20, 14),
  new THREE.Vector3(70, 34, -12),
  new THREE.Vector3(95, 34, 0),
])
const SHRINE_FOCUS = new THREE.Vector3(0, 12, 0)

export class Game {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(100, 1, 0.05, 1600)
  private vmScene = new THREE.Scene()
  private vmCamera = new THREE.PerspectiveCamera(68, 1, 0.01, 10)
  private sun = new THREE.DirectionalLight('#ffd7ad', 2.4)
  private hemi = new THREE.HemisphereLight('#a9b4ff', '#40283a', 1.1)
  private boxes: Box[]
  private spawns: THREE.Vector3[]
  private mapGroup: THREE.Group
  private embers: Embers
  private lastFrame = performance.now()
  private raf = 0
  private acc = 0
  private now = 0

  // quality + adaptive resolution
  private quality: Quality
  private baseRatio = 1
  private renderScale = 1
  private resolution: ResolutionMode = 'auto'
  private perfT = 0
  private perfFrames = 0
  private goodWindows = 0
  private fps = 60

  // menu camera
  private cinematic: 'intro' | 'orbit' = 'orbit'
  private introT = 0
  private menuAngle = 0

  // session + match
  private mode: GameMode = 'menu'
  private matchMode: MatchMode = 'ffa'
  private phase: MatchPhase = 'live'
  private timeLeft = 0
  private teamScores: [number, number] = [0, 0]
  private winner: string | null = null
  private restartIn = 0
  private lastTick = 0
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
  private streak = 0
  private thirdPerson = false
  private myAvatar: Avatar
  private myRope: Rope
  private myBlob: THREE.Mesh
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
  touchLookScale = 1.6
  // touch input (mobile): the UI drives these through the public touch* methods
  private touchMode = false
  private touchActive = false
  private touchMoveX = 0
  private touchMoveY = 0
  private touchJump = false
  private jumpHeldPrev = false
  private momentumT = 0
  private momentumHops = 0
  private fovKick = 0
  private boostAt = 0
  private boostAmount = 0

  private sendT = 0
  private hudT = 0
  private lineId = 0
  private disposed = false

  constructor(
    private container: HTMLElement,
    private cb: GameCallbacks,
    opts: GameOptions,
  ) {
    this.quality = opts.quality
    this.renderer = new THREE.WebGLRenderer({
      // MSAA is cheap at 1x on laptops/Chromebooks and removes the jaggies; phones skip it
      antialias: !(window.matchMedia?.('(pointer: coarse)').matches ?? false),
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.autoClear = false
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'none'

    const { boxes, spawns } = generateMap()
    this.boxes = boxes
    this.spawns = spawns
    this.mapGroup = buildMapMeshes(boxes, opts.quality !== 'high')
    this.scene.add(this.mapGroup)
    this.scene.add(buildSky(), buildMoon(), buildSkyline())
    this.scene.fog = new THREE.Fog('#a45a78', 110, 430)
    this.embers = new Embers(opts.quality === 'low' ? 120 : 360)
    this.scene.add(this.embers.points)

    this.scene.add(this.hemi)
    this.sun.position.copy(SUN_DIR).multiplyScalar(150)
    const sc = this.sun.shadow.camera
    sc.left = sc.bottom = -60
    sc.right = sc.top = 60
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
    this.myRope = this.makeRope()
    this.myBlob = makeBlobShadow()
    this.scene.add(this.myBlob)
    this.viewModel = new ViewModel(this.info.color)
    this.vmScene.add(this.viewModel.group)

    this.applyQuality(true)
    this.bindInput()
    this.resize()
    window.addEventListener('resize', this.resize)

    // the menu shows bots duelling while the camera orbits the arena
    this.addMenuBots()
    this.loop()
  }

  /* ---------------- lifecycle ---------------- */

  async start(mode: Exclude<GameMode, 'menu'>, opts: StartOptions) {
    this.net?.close()
    this.net = null
    this.mode = mode
    this.matchMode = opts.match
    const teams = MODES[opts.match].teamSize > 0
    this.info = {
      id: 'me',
      name: opts.name.slice(0, 16) || 'Ronin',
      color: opts.color,
      kills: 0,
      deaths: 0,
      isYou: true,
      team: teams ? 0 : undefined,
    }
    this.myId = 'me'
    this.cinematic = 'orbit'
    this.clearEntities()
    this.rebuildMyVisuals()
    this.resetMatchState(mode === 'local' && opts.match !== 'training')
    this.respawn()

    if (mode === 'local') {
      const m = MODES[opts.match]
      const passive = opts.match === 'training'
      for (let i = 0; i < m.botMatchSize - 1; i++) {
        // fill your team first (minus you), then the enemy side
        const team = teams ? (i < m.teamSize - 1 ? 0 : 1) : undefined
        this.addBot(i, { team, passive })
      }
      this.cb.onStatus({ kind: 'online', room: undefined })
      if (passive) this.systemChat('Training range: dummies never fight back. Build speed, then slash for bigger numbers.')
      else this.systemChat(`${m.label} ${m.tag} vs bots. ${m.blurb}`)
      return
    }

    this.cb.onStatus({ kind: 'connecting' })
    this.net = new Net({
      onReady: (id, room) => {
        this.myId = id
        this.info.id = id
        this.cb.onStatus({ kind: 'online', room })
        if (mode === 'host') {
          const m = MODES[this.matchMode]
          this.systemChat(`Room ${room} is live: ${m.label} ${m.tag}. Share the code or invite link with friends.`)
        }
      },
      onError: (message) => this.cb.onStatus({ kind: 'error', message }),
      onMessage: (msg) => this.onNet(msg),
      onPeerLeft: (id) => this.removePlayer(id),
      getMatch: () => this.matchSync(),
    })
    if (mode === 'host') {
      await this.net.hostRoom({ name: this.info.name, color: this.info.color, team: this.info.team }, { mode: opts.match })
    } else await this.net.joinRoom(opts.room ?? '', { name: this.info.name, color: this.info.color })
  }

  leave() {
    this.net?.close()
    this.net = null
    this.mode = 'menu'
    this.matchMode = 'ffa'
    this.clearEntities()
    this.addMenuBots()
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
    this.embers.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private addMenuBots() {
    for (let i = 0; i < 6; i++) this.addBot(i, {})
  }

  private rebuildMyVisuals() {
    const color = this.displayColor(this.info)
    this.scene.remove(this.myAvatar.root)
    this.myAvatar = new Avatar(this.info.name, color)
    this.myAvatar.setLabelVisible(false)
    this.scene.add(this.myAvatar.root)
    this.vmScene.remove(this.viewModel.group)
    this.viewModel = new ViewModel(color)
    this.vmScene.add(this.viewModel.group)
  }

  /* ---------------- quality ---------------- */

  setQuality(q: Quality) {
    if (q === this.quality) return
    this.quality = q
    this.applyQuality(false)
  }

  private applyQuality(initial: boolean) {
    const q = this.quality
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
    const dpr = window.devicePixelRatio || 1
    if (this.resolution === 'native') this.baseRatio = Math.min(dpr, 2)
    else {
      const cap = q === 'high' ? 2 : q === 'medium' ? 1.5 : 1.25
      this.baseRatio = Math.min(dpr, coarse ? Math.min(cap, 1.5) : cap)
    }
    this.renderScale = this.resolution === '75' ? 0.75 : 1
    this.applyRatio()

    const shadows = q !== 'low'
    this.renderer.shadowMap.enabled = shadows
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.sun.castShadow = shadows
    const size = q === 'high' ? 2048 : 1024
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
    }
    this.hemi.intensity = shadows ? 1.1 : 1.35

    if (!initial) {
      this.scene.remove(this.mapGroup)
      this.mapGroup.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        m.geometry.dispose()
        const mat = m.material as THREE.MeshStandardMaterial
        mat.map?.dispose()
        mat.dispose()
      })
      this.mapGroup = buildMapMeshes(this.boxes, q !== 'high')
      this.scene.add(this.mapGroup)
      this.scene.remove(this.embers.points)
      this.embers.dispose()
      this.embers = new Embers(q === 'low' ? 120 : 360)
      this.scene.add(this.embers.points)
      // materials must recompile when the shadow map toggles
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true))
        else if (m) m.needsUpdate = true
      })
    }
    this.myBlob.visible = false
  }

  private applyRatio() {
    this.renderer.setPixelRatio(Math.max(0.5, this.baseRatio * this.renderScale))
  }

  /** 'auto' adapts to the frame rate; the others lock the resolution. */
  setResolution(mode: ResolutionMode) {
    if (mode === this.resolution) return
    this.resolution = mode
    this.applyQuality(true)
  }

  /** Drop render resolution when frames run long, bring it back when there's headroom. */
  private adaptResolution(rawDt: number) {
    if (rawDt > 0.25 || document.hidden) return
    this.perfT += rawDt
    this.perfFrames++
    if (this.perfT < 1.5) return
    const avg = this.perfT / this.perfFrames
    this.fps = Math.round(1 / avg)
    this.perfT = 0
    this.perfFrames = 0
    if (this.resolution !== 'auto') return
    const max = 1
    const min = 0.7
    // only give up sharpness when the game is genuinely struggling (< ~40 FPS)
    if (avg > 1 / 40 && this.renderScale > min) {
      this.renderScale = Math.max(min, this.renderScale - 0.05)
      this.goodWindows = 0
      this.applyRatio()
    } else if (avg < 1 / 57) {
      this.goodWindows++
      if (this.goodWindows >= 3 && this.renderScale < max) {
        this.renderScale = Math.min(max, this.renderScale + 0.05)
        this.goodWindows = 0
        this.applyRatio()
      }
    } else this.goodWindows = 0
  }

  /* ---------------- public controls ---------------- */

  playIntro() {
    this.cinematic = 'intro'
    this.introT = 0
  }

  skipIntro() {
    this.cinematic = 'orbit'
    this.menuAngle = 0
  }

  setVolume(v: number) {
    this.sfx.setVolume(v)
  }

  unlockAudio() {
    this.sfx.unlock()
  }

  uiSound(kind: Parameters<Sfx['ui']>[0]) {
    this.sfx.ui(kind)
  }

  /** Local matches only: start a fresh match with the same bots. */
  restartMatch() {
    if (this.mode !== 'local') return
    this.resetMatch()
  }

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
    this.mouseDX += dx * this.touchLookScale
    this.mouseDY += dy * this.touchLookScale
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
      else this.releaseGrapple(true)
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
    this.sfx.unlock()
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
    this.pushChat({ from: this.info.name, color: this.displayColor(this.info), text: clean })
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
    if (e.code === 'KeyF') this.releaseGrapple(true)
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

  private makeRope(): Rope {
    const line = new THREE.Group()
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ff3347', fog: false }),
    )
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 1, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#ff1030',
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    )
    line.add(core, glow)
    line.visible = false
    const anchor = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshBasicMaterial({
        color: '#ff4a5c',
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    )
    anchor.visible = false
    this.scene.add(line, anchor)
    return { line, anchor }
  }

  private removeRope(r: Rope) {
    this.scene.remove(r.line, r.anchor)
  }

  private placeRope(rope: Rope, from: THREE.Vector3, to: THREE.Vector3 | null, thickness = 1) {
    if (!to) {
      rope.line.visible = rope.anchor.visible = false
      return
    }
    const d = _v1.subVectors(to, from)
    const len = d.length()
    rope.line.visible = rope.anchor.visible = len > 0.1
    rope.line.position.copy(from).addScaledVector(d, 0.5)
    rope.line.scale.set(thickness, len, thickness)
    rope.line.quaternion.setFromUnitVectors(UP, d.normalize())
    rope.anchor.position.copy(to)
    rope.anchor.scale.setScalar(0.85 + Math.sin(this.now * 30) * 0.15)
  }

  private placeBlob(blob: THREE.Mesh, pos: THREE.Vector3, visible: boolean) {
    blob.visible = visible && this.quality === 'low'
    if (!blob.visible) return
    const hit = raycastBoxes(_v1.set(pos.x, pos.y + 0.3, pos.z), DOWN, 30, this.boxes)
    if (!hit) {
      blob.visible = false
      return
    }
    const h = pos.y - hit.point.y
    blob.position.set(pos.x, hit.point.y + 0.03, pos.z)
    const s = Math.max(0.35, 1 - h / 12)
    blob.scale.set(s, 1, s)
    ;(blob.material as THREE.MeshBasicMaterial).opacity = s
  }

  private lookDir(yaw = this.yaw, pitch = this.pitch) {
    return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
  }

  /** Spawns as far as possible from enemies; in team modes each side spawns on its own half. */
  private pickSpawn(team?: number): THREE.Vector3 {
    const teams = this.isTeams() && team !== undefined
    const others: THREE.Vector3[] = []
    for (const e of this.entities.values()) {
      if (!e.alive) continue
      if (teams && e.info.team === team) continue
      others.push(e.pos)
    }
    if (this.mode !== 'menu' && this.alive && !(teams && this.info.team === team)) others.push(this.body.pos)
    let best = this.spawns[0]
    let bestScore = -Infinity
    for (const s of this.spawns) {
      if (teams && (team === 0 ? s.x > 5 : s.x < -5)) continue
      let d = Math.random() * 100
      if (others.length) {
        d = Infinity
        for (const o of others) d = Math.min(d, o.distanceTo(s))
      }
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
    const max = this.quality === 'low' ? 60 : 160
    for (let i = 0; i < count; i++) {
      let p = this.particles.find((q) => q.life <= 0)
      if (!p) {
        if (this.particles.length > max) return
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
      p.vel
        .set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(power * (0.4 + Math.random()))
      p.life = 0.45 + Math.random() * 0.35
    }
  }

  /* ---------------- teams ---------------- */

  private isTeams() {
    return this.mode !== 'menu' && MODES[this.matchMode].teamSize > 0
  }

  private teamOf(id: string): number | undefined {
    return this.findInfo(id)?.team
  }

  private allies(a: string, b: string) {
    if (!this.isTeams()) return false
    const ta = this.teamOf(a)
    return ta !== undefined && ta === this.teamOf(b)
  }

  /** In team modes colours are relative to you: allies teal, enemies red. */
  private displayColor(info: PlayerInfo) {
    if (!this.isTeams() || info.team === undefined) return info.color
    return info.team === this.info.team ? ALLY_COLOR : ENEMY_COLOR
  }

  /* ---------------- entities ---------------- */

  private createEntity(info: PlayerInfo, pos: THREE.Vector3): Entity {
    const color = this.displayColor(info)
    const avatar = new Avatar(info.name, color)
    if (this.isTeams() && info.team === this.info.team) avatar.setLabelXray(true)
    this.scene.add(avatar.root)
    const blob = makeBlobShadow()
    this.scene.add(blob)
    return {
      id: info.id,
      info,
      avatar,
      rope: this.makeRope(),
      blob,
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

  private addBot(i: number, opts: { team?: number; passive?: boolean }) {
    const id = `bot-${i}-${Math.random().toString(36).slice(2, 6)}`
    const info: PlayerInfo = {
      id,
      name: opts.passive ? `Dummy ${i + 1}` : BOT_NAMES[i % BOT_NAMES.length],
      color: opts.passive ? '#c9c3b8' : BOT_COLORS[i % BOT_COLORS.length],
      kills: 0,
      deaths: 0,
      isBot: true,
      team: opts.team,
    }
    const pos = this.pickSpawn(opts.team)
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
      passive: !!opts.passive,
      wander: pos.clone(),
    }
    this.entities.set(id, e)
  }

  private removeEntity(e: Entity) {
    this.scene.remove(e.avatar.root)
    this.removeRope(e.rope)
    this.scene.remove(e.blob)
    this.entities.delete(e.id)
  }

  private clearEntities() {
    for (const e of [...this.entities.values()]) this.removeEntity(e)
  }

  private removePlayer(id: string) {
    const e = this.entities.get(id)
    if (!e) return
    this.systemChat(`${e.info.name} left the match`)
    this.removeEntity(e)
  }

  /* ---------------- match flow ---------------- */

  private matchSync(): MatchSync {
    return {
      mode: this.matchMode,
      phase: this.phase,
      timeLeft: this.timeLeft,
      teamScores: [...this.teamScores],
      winner: this.winner,
    }
  }

  private isAuthority() {
    return this.mode === 'local' || this.mode === 'host'
  }

  private resetMatchState(withCountdown: boolean) {
    const m = MODES[this.matchMode]
    this.phase = withCountdown ? 'countdown' : 'live'
    this.timeLeft = withCountdown ? COUNTDOWN : m.timeLimit
    this.lastTick = Math.ceil(this.timeLeft)
    this.teamScores = [0, 0]
    this.winner = null
    this.restartIn = 0
    this.streak = 0
  }

  private resetMatch() {
    this.resetMatchState(this.mode === 'local' && this.matchMode !== 'training')
    this.info.kills = this.info.deaths = 0
    for (const e of this.entities.values()) {
      e.info.kills = e.info.deaths = 0
      if (e.bot) {
        const p = this.pickSpawn(e.info.team)
        e.bot.body = createBody(p)
        e.pos.copy(p)
        e.hp = 100
        e.alive = true
      }
    }
    this.net?.resetScores()
    this.respawn()
    if (this.mode === 'host') this.net?.send({ t: 'match', m: this.matchSync() })
  }

  private applyMatch(m: MatchSync) {
    const wasEnded = this.phase === 'ended'
    const modeChanged = m.mode !== this.matchMode
    this.matchMode = m.mode
    this.phase = m.phase
    this.timeLeft = m.timeLeft
    this.teamScores = [...m.teamScores]
    this.winner = m.winner
    if (modeChanged) this.rebuildMyVisuals()
    if (m.phase === 'ended' && !wasEnded) {
      this.restartIn = ONLINE_RESTART
      this.onEnded()
    }
    if (m.phase !== 'ended' && wasEnded) {
      // host started a new match
      this.info.kills = this.info.deaths = 0
      for (const e of this.entities.values()) e.info.kills = e.info.deaths = 0
      this.streak = 0
      this.respawn()
      this.systemChat('New match started. Good luck.')
    }
  }

  private endMatch(winner: string) {
    if (this.phase === 'ended') return
    this.phase = 'ended'
    this.winner = winner
    this.restartIn = this.mode === 'host' ? ONLINE_RESTART : 0
    if (this.mode === 'host') this.net?.send({ t: 'match', m: this.matchSync() })
    this.onEnded()
  }

  private onEnded() {
    const myTeam = this.info.team
    const draw = this.winner === 'draw'
    const won = !draw && (this.winner === this.myId || (myTeam !== undefined && this.winner === `team:${myTeam}`))
    this.sfx.ui(won ? 'win' : 'lose')
    this.mouseDown = false
    this.cb.onMatchEnd?.({ won, draw, kills: this.info.kills, deaths: this.info.deaths, mode: this.matchMode })
  }

  private allPlayers(): PlayerInfo[] {
    const list: PlayerInfo[] = []
    if (this.mode !== 'menu') list.push({ ...this.info, id: this.myId })
    for (const e of this.entities.values()) list.push(e.info)
    return list
  }

  private leader(): string {
    if (this.isTeams()) {
      const [a, b] = this.teamScores
      return a === b ? 'draw' : a > b ? 'team:0' : 'team:1'
    }
    const ps = this.allPlayers().sort((x, y) => y.kills - x.kills)
    if (!ps.length || (ps[1] && ps[1].kills === ps[0].kills)) return 'draw'
    return ps[0].id
  }

  private updateMatch(dt: number) {
    if (this.mode === 'menu') return
    const m = MODES[this.matchMode]
    if (this.phase === 'countdown') {
      this.timeLeft -= dt
      const tick = Math.ceil(this.timeLeft)
      if (tick !== this.lastTick && tick > 0) this.sfx.ui('tick')
      this.lastTick = tick
      if (this.timeLeft <= 0) {
        this.phase = 'live'
        this.timeLeft = m.timeLimit
        this.sfx.ui('go')
      }
      return
    }
    if (this.phase === 'ended') {
      if (this.mode === 'local') return // the player chooses when to rematch
      this.restartIn -= dt
      if (this.mode === 'host' && this.restartIn <= 0) this.resetMatch()
      return
    }
    if (m.timeLimit > 0) this.timeLeft = Math.max(0, this.timeLeft - dt)
    if (!this.isAuthority()) return
    if (m.scoreLimit > 0) {
      if (this.isTeams()) {
        const i = this.teamScores.findIndex((s) => s >= m.scoreLimit)
        if (i >= 0) return this.endMatch(`team:${i}`)
      } else {
        const top = this.allPlayers().find((p) => p.kills >= m.scoreLimit)
        if (top) return this.endMatch(top.id)
      }
    }
    if (m.timeLimit > 0 && this.timeLeft <= 0) this.endMatch(this.leader())
  }

  /* ---------------- networking ---------------- */

  private onNet(msg: NetMessage) {
    switch (msg.t) {
      case 'welcome': {
        this.myId = msg.you
        this.info.id = msg.you
        const me = msg.players.find((p) => p.id === msg.you)
        this.info.team = me?.team
        this.matchMode = msg.m.mode
        this.applyMatch(msg.m)
        this.rebuildMyVisuals()
        for (const p of msg.players) {
          if (p.id === msg.you) continue
          if (!this.entities.has(p.id)) this.entities.set(p.id, this.createEntity({ ...p }, new THREE.Vector3(0, -50, 0)))
        }
        this.respawn()
        const m = MODES[this.matchMode]
        this.systemChat(`Joined ${m.label} ${m.tag}: ${msg.players.length} players in the match. Press Enter to chat.`)
        break
      }
      case 'join': {
        if (msg.player.id === this.myId || this.entities.has(msg.player.id)) break
        this.entities.set(msg.player.id, this.createEntity({ ...msg.player }, new THREE.Vector3(0, -50, 0)))
        this.systemChat(`${msg.player.name} joined the match`)
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
        if (msg.to !== this.myId || this.phase !== 'live') break
        if (this.allies(msg.from, this.myId)) break // no friendly fire
        this.takeDamage(Math.min(100, Math.max(0, msg.dmg)), msg.from, new THREE.Vector3(...msg.kb).clampLength(0, 40))
        break
      case 'death':
        this.registerDeath(msg.id, msg.by, msg.speed)
        break
      case 'chat': {
        if (msg.id === this.myId) break
        const sender = this.entities.get(msg.id)
        const color = sender ? this.displayColor(sender.info) : msg.color
        this.pushChat({ from: msg.name, color, text: String(msg.text).slice(0, 200) })
        break
      }
      case 'match':
        if (this.mode === 'join') this.applyMatch(msg.m)
        break
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
    const counts = this.mode === 'menu' || this.phase === 'live'
    const isMe = (id: string) => id === this.myId || id === 'me'
    if (counts) {
      if (v) v.deaths++
      if (k && killerId !== victimId) {
        k.kills++
        if (this.isTeams() && v && k.team !== undefined && k.team !== v.team) this.teamScores[k.team]++
      }
    }
    if (v && k) {
      this.cb.onKill({
        id: ++this.lineId,
        killer: k.name,
        killerColor: this.displayColor(k),
        victim: v.name,
        victimColor: this.displayColor(v),
        speed: Math.round(speed),
        byYou: isMe(killerId) && killerId !== victimId,
        youDied: isMe(victimId),
      })
    }
    if (isMe(killerId) && victimId !== killerId) {
      this.sfx.kill()
      this.streak++
    }
    if (isMe(victimId)) this.streak = 0
  }

  /* ---------------- combat ---------------- */

  private speedH(v: THREE.Vector3) {
    return Math.hypot(v.x, v.z)
  }

  private canFight() {
    return this.mode !== 'menu' && this.phase === 'live'
  }

  private trySlash() {
    if (!this.alive || this.slashCD > 0 || !this.canFight()) return
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
      if (!e.alive || this.allies(this.myId, e.id)) continue
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
        victim.bot.respawnAt = this.now + (victim.bot.passive ? TRAINING_RESPAWN : RESPAWN_TIME)
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
      this.respawnAt = this.now + (this.matchMode === 'training' ? TRAINING_RESPAWN : RESPAWN_TIME)
      this.body.grapple = null
      this.lastKiller = fromId
      const atk = this.entities.get(fromId)
      const speed = atk ? (atk.bot ? atk.bot.body.vel.length() : atk.vel.length()) : 0
      this.registerDeath(this.myId, fromId, speed)
      this.net?.send({ t: 'death', id: this.myId, by: fromId, speed })
    }
  }

  private respawn() {
    this.body = createBody(this.pickSpawn(this.info.team))
    this.hp = 100
    this.alive = true
    this.lastKiller = null
    this.yaw = Math.atan2(this.body.pos.x, this.body.pos.z) // face the shrine
    this.pitch = 0
    this.topSpeed = 0
  }

  private tryDash() {
    if (!this.alive || this.dashCD > 0 || this.mode === 'menu' || this.phase === 'countdown') return
    this.dashCD = DASH_COOLDOWN
    const d = this.lookDir()
    const flat = new THREE.Vector3(d.x, 0, d.z).normalize()
    this.body.vel.addScaledVector(flat, 11)
    this.body.vel.y = Math.max(this.body.vel.y, 3.5)
    this.body.onGround = false
    this.sfx.boost()
  }

  private startGrapple() {
    if (!this.alive || this.grappleCD > 0 || this.body.grapple || this.mode === 'menu' || this.phase === 'countdown')
      return
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
    this.fovKick = 6
    this.spark(this.body.grapple, '#ff3347', 10, 5)
    this.sfx.grapple()
  }

  /**
   * `sling`: a deliberate release (letting go of the hook, or jumping off it). In the air that
   * slingshots you along your travel direction and opens a momentum window for bhops.
   * `fling` (jump pressed while hooked) adds an upward pop on top.
   */
  private releaseGrapple(sling = false, fling = false) {
    if (!this.grappleHeld && !this.body.grapple) return
    this.grappleHeld = false
    if (!this.body.grapple) return
    this.body.grapple = null
    this.grappleCD = GRAPPLE_COOLDOWN
    if (!sling || this.body.onGround || !this.alive) return
    const v = this.body.vel
    const h = Math.hypot(v.x, v.z)
    const dir = h > 1 ? new THREE.Vector3(v.x / h, 0, v.z / h) : this.lookDir().setY(0).normalize()
    const add = Math.min(SLING_MAX, SLING_BASE + h * 0.12 + (fling ? 2.5 : 0))
    v.addScaledVector(dir, add)
    v.y = Math.max(v.y, fling ? MOVE.jumpSpeed + 1.5 : 3)
    this.momentumT = MOMENTUM_WINDOW
    this.momentumHops = MOMENTUM_HOPS
    this.fovKick = 8
    this.flashBoost(add)
    this.sfx.boost()
  }

  private flashBoost(amount: number) {
    this.boostAt = performance.now()
    this.boostAmount = Math.round(amount * 10) / 10
  }

  /* ---------------- bots ---------------- */

  private combatants() {
    const list: { id: string; pos: THREE.Vector3; alive: boolean; team?: number }[] = []
    if (this.mode !== 'menu') list.push({ id: this.myId, pos: this.body.pos, alive: this.alive, team: this.info.team })
    for (const e of this.entities.values()) list.push({ id: e.id, pos: e.pos, alive: e.alive, team: e.info.team })
    return list
  }

  private updateBot(e: Entity, dt: number) {
    const bot = e.bot!
    if (!e.alive) {
      if (this.now >= bot.respawnAt) {
        const p = this.pickSpawn(e.info.team)
        bot.body = createBody(p)
        e.pos.copy(p)
        e.hp = 100
        e.alive = true
      }
      return
    }
    const frozen = this.mode !== 'menu' && this.phase === 'countdown'
    const wish = new THREE.Vector3()
    let dist = 999
    let jump = false
    if (!frozen) {
      bot.thinkT -= dt
      bot.slashCD -= dt
      bot.grappleT -= dt
      if (bot.passive) {
        // training dummy: wander between random points, hop around, never attack
        if (bot.thinkT <= 0 || bot.wander.distanceTo(e.pos) < 4) {
          bot.thinkT = 3 + Math.random() * 3
          bot.wander.set((Math.random() * 2 - 1) * 60, 0, (Math.random() * 2 - 1) * 60)
          bot.jumpHold = Math.random() < 0.5
        }
        const to = new THREE.Vector3().subVectors(bot.wander, e.pos).setY(0).normalize()
        e.yaw = Math.atan2(-to.x, -to.z)
        wish.copy(to).multiplyScalar(0.6)
        jump = bot.jumpHold
      } else {
        const all = this.combatants()
        const fighting = this.mode === 'menu' || this.phase === 'live'
        if (bot.thinkT <= 0) {
          bot.thinkT = 0.5 + Math.random() * 0.5
          let best: string | null = null
          let bestD = 140
          for (const c of all) {
            if (c.id === e.id || !c.alive) continue
            if (this.isTeams() && c.team === e.info.team) continue
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
          if (fighting && dist < 3.2 && bot.slashCD <= 0) {
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
        jump = bot.jumpHold && dist > 4
      }
    }
    if (bot.grappleT <= 0) bot.body.grapple = null
    const events: BodyEvent[] = []
    stepBody(bot.body, { wish, jump }, dt, this.boxes, events)
    if (bot.body.pos.y < -40) {
      bot.body = createBody(this.pickSpawn(e.info.team))
    }
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
    const rawDt = (nowMs - this.lastFrame) / 1000
    const dt = Math.min(0.05, rawDt)
    this.lastFrame = nowMs
    this.now += dt
    this.adaptResolution(rawDt)

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
    this.updateMatch(dt)

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
        const frozen = this.phase === 'countdown'
        const k = this.keys
        let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
        let s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
        if (this.touchActive) {
          f = THREE.MathUtils.clamp(f + this.touchMoveY, -1, 1)
          s = THREE.MathUtils.clamp(s + this.touchMoveX, -1, 1)
        }
        if (frozen) f = s = 0
        const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
        const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
        const wish = fwd.multiplyScalar(f).addScaledVector(right, s)
        const jump = !frozen && (k.has('Space') || (this.touchActive && this.touchJump))
        // tap jump while hooked: jump off the rope with a fling
        if (jump && !this.jumpHeldPrev && this.body.grapple) this.releaseGrapple(true, true)
        this.jumpHeldPrev = jump
        this.momentumT = Math.max(0, this.momentumT - dt)
        const events: BodyEvent[] = []
        stepBody(this.body, { wish, jump }, dt, this.boxes, events)
        for (const ev of events) {
          if (ev === 'jump' && this.momentumT > 0 && this.momentumHops > 0) {
            // carried momentum: each hop right after a hook adds speed
            const v = this.body.vel
            const h = Math.hypot(v.x, v.z)
            if (h > 1) {
              v.x += (v.x / h) * MOMENTUM_HOP_BONUS
              v.z += (v.z / h) * MOMENTUM_HOP_BONUS
              this.flashBoost(MOMENTUM_HOP_BONUS)
            }
            this.momentumHops--
            this.momentumT = MOMENTUM_WINDOW
          }
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

  private updateMenuCamera(dt: number) {
    if (this.cinematic === 'intro') {
      this.introT += dt
      const raw = Math.min(1, this.introT / INTRO_SECONDS)
      const t = raw * raw * (3 - 2 * raw)
      INTRO_PATH.getPointAt(t, this.camera.position)
      const ahead = INTRO_PATH.getPointAt(Math.min(1, t + 0.06), _v1)
      const blend = THREE.MathUtils.smoothstep(t, 0.3, 1)
      ahead.y -= 2
      ahead.lerp(SHRINE_FOCUS, blend)
      this.camera.lookAt(ahead)
      this.camera.fov = 78 - blend * 8
      if (raw >= 1) this.skipIntro()
    } else {
      this.menuAngle += dt * 0.05
      const r = 95
      this.camera.position.set(Math.cos(this.menuAngle) * r, 34, Math.sin(this.menuAngle) * r)
      this.camera.lookAt(SHRINE_FOCUS.x, 10, SHRINE_FOCUS.z)
      this.camera.fov = 70
    }
    this.camera.updateProjectionMatrix()
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
      this.placeBlob(e.blob, e.pos, e.alive)
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
    for (const c of this.mapGroup.children) {
      if (c.userData.pad) {
        c.position.y += Math.sin(t * 3 + c.position.x) * 0.004
        c.rotation.z = t
      }
    }
    this.embers.update(t, this.renderer.domElement.height)

    if (this.mode === 'menu') {
      this.updateMenuCamera(dt)
      this.sun.target.position.set(0, 0, 0)
      this.sun.position.copy(SUN_DIR).multiplyScalar(150)
      this.myAvatar.root.visible = false
      this.placeRope(this.myRope, this.body.pos, null)
      this.myBlob.visible = false
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
    this.placeBlob(this.myBlob, this.body.pos, showSelf)

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
    this.fovKick = Math.max(0, this.fovKick - dt * 20)
    const targetFov = 98 + THREE.MathUtils.clamp((this.body.vel.length() - 10) * 0.45, 0, 22) + this.fovKick
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 6)
    this.camera.updateProjectionMatrix()

    // grapple rope from the off hand
    const hand = this.thirdPerson
      ? this.body.pos.clone().add(new THREE.Vector3(0, 1.4, 0))
      : eye
          .clone()
          .add(new THREE.Vector3(-0.35, -0.35, -0.3).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')))
    // first person: the line starts right next to the camera, so keep it slim
    this.placeRope(this.myRope, hand, this.alive ? this.body.grapple : null, this.thirdPerson ? 1 : 0.4)

    this.viewModel.update(dt, speedH, this.body.onGround, mdx, mdy)
    this.sfx.setWind(this.body.vel.length())

    // shadows follow the player
    this.sun.target.position.copy(this.body.pos)
    this.sun.position.copy(this.body.pos).addScaledVector(SUN_DIR, 150)
  }

  private emitHud() {
    const players: PlayerInfo[] = []
    if (this.mode !== 'menu') players.push({ ...this.info, id: this.myId, isYou: true, color: this.displayColor(this.info) })
    for (const e of this.entities.values()) players.push({ ...e.info, color: this.displayColor(e.info) })
    players.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    const m = MODES[this.matchMode]
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
      boostAt: this.boostAt,
      boostAmount: this.boostAmount,
      lastDamage: this.lastDamage,
      damageFlash: this.damageFlash,
      locked: this.locked || this.touchActive,
      thirdPerson: this.thirdPerson,
      streak: this.streak,
      players,
      match: {
        ...this.matchSync(),
        online: this.mode === 'host' || this.mode === 'join',
        isHost: this.mode === 'host',
        scoreLimit: m.scoreLimit,
        myTeam: this.info.team ?? null,
        restartIn: Math.max(0, this.restartIn),
      },
      fps: this.fps,
      renderScale: this.renderScale,
      quality: this.quality,
    }
    this.cb.onHud(hud)
  }
}
