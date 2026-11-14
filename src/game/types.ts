// Shared types between the engine (src/game) and the React UI.
import type { MatchMode, MatchPhase, Quality } from './rules'

export type Vec3Tuple = [number, number, number]

export interface PlayerInfo {
  id: string
  name: string
  color: string
  kills: number
  deaths: number
  /** 0 or 1 in team modes */
  team?: number
  isBot?: boolean
  isYou?: boolean
}

export interface ChatLine {
  id: number
  from: string
  color: string
  text: string
  system?: boolean
}

export interface KillFeedLine {
  id: number
  killer: string
  killerColor: string
  victim: string
  victimColor: string
  speed: number
  byYou: boolean
  youDied: boolean
}

/** What every peer needs to agree on about the current match. */
export interface MatchSync {
  mode: MatchMode
  phase: MatchPhase
  timeLeft: number
  teamScores: [number, number]
  /** 'team:0' | 'team:1' | a player id | 'draw' | null */
  winner: string | null
}

export interface HudMatch extends MatchSync {
  online: boolean
  isHost: boolean
  scoreLimit: number
  myTeam: number | null
  restartIn: number
}

export interface HudState {
  t: number // performance.now() when emitted
  speed: number
  topSpeed: number
  hp: number
  alive: boolean
  respawnIn: number
  grappleReady: number // 0..1 cooldown progress
  grappling: boolean
  dashReady: number // 0..1
  slashReady: number // 0..1
  hitMarker: number // timestamp of last landed hit
  lastDamage: number
  damageFlash: number // timestamp of last damage taken
  locked: boolean
  thirdPerson: boolean
  streak: number
  players: PlayerInfo[]
  match: HudMatch
  fps: number
  renderScale: number
  quality: Quality
}

export type GameMode = 'menu' | 'local' | 'host' | 'join'

/** Network messages. Every message is relayed by the host to every other peer. */
export type NetMessage =
  | { t: 'hello'; name: string; color: string }
  | { t: 'welcome'; you: string; players: PlayerInfo[]; m: MatchSync }
  | { t: 'reject'; reason: string }
  | { t: 'join'; player: PlayerInfo }
  | { t: 'leave'; id: string }
  | {
      t: 'state'
      id: string
      p: Vec3Tuple
      v: Vec3Tuple
      yaw: number
      pitch: number
      alive: boolean
      gr: boolean // on ground
      hp: number
      slash: number // slash sequence counter
      g: Vec3Tuple | null // grapple anchor
    }
  | { t: 'hit'; from: string; to: string; dmg: number; kb: Vec3Tuple }
  | { t: 'death'; id: string; by: string; speed: number }
  | { t: 'chat'; id: string; name: string; color: string; text: string }
  | { t: 'match'; m: MatchSync }

export type NetStatus = { kind: 'idle' | 'connecting' | 'online' | 'error'; message?: string; room?: string }

export interface GameCallbacks {
  onHud: (hud: HudState) => void
  onChat: (line: ChatLine) => void
  onKill: (line: KillFeedLine) => void
  onStatus: (status: NetStatus) => void
  onRequestChat: () => void
  onMatchEnd?: (result: { won: boolean; draw: boolean; kills: number; deaths: number; mode: MatchMode }) => void
}
