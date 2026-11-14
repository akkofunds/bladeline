// Shared types between the engine (src/game) and the React UI.

export type Vec3Tuple = [number, number, number]

/** Playable modes picked from the lobby. */
export type MatchMode = 'training' | 'ffa' | 'skirmish2' | 'skirmish5' | 'custom-host' | 'custom-join'
export type GameMode = 'menu' | MatchMode | 'practice' | 'host' | 'join'

export type Quality = 'low' | 'medium' | 'high'

export interface PlayerInfo {
  id: string
  name: string
  color: string
  kills: number
  deaths: number
  /** 0 or 1 in team modes, undefined in free-for-all */
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
  /** your kill or your death, for highlighting */
  mine?: boolean
}

export interface MatchResult {
  /** winning team in team modes */
  winnerTeam?: number
  winnerId?: string
  winnerName?: string
}

export interface MatchHud {
  mode: MatchMode
  /** seconds left, or -1 when the mode has no clock */
  timeLeft: number
  scoreLimit: number
  teams: boolean
  myTeam?: number
  /** [ally/blue team, red team] when `teams` */
  teamScores: [number, number]
  myKills: number
  leaderKills: number
  leaderName: string
  ended: MatchResult | null
  /** seconds of the pre-fight countdown left (0 when fighting) */
  freeze: number
  online: boolean
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
  fps?: number
  players: PlayerInfo[]
  match?: MatchHud | null
}

/** Network messages. Every message is relayed by the host to every other peer. */
export type NetMessage =
  | { t: 'hello'; name: string; color: string }
  | { t: 'welcome'; you: string; players: PlayerInfo[] }
  | { t: 'full' }
  | { t: 'join'; player: PlayerInfo }
  | { t: 'leave'; id: string; quiet?: boolean }
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
  | { t: 'match'; timeLeft: number; ended: MatchResult | null }

export type NetStatus = { kind: 'idle' | 'connecting' | 'online' | 'error'; message?: string; room?: string; offline?: boolean }

export interface GameCallbacks {
  onHud: (hud: HudState) => void
  onChat: (line: ChatLine) => void
  onKill: (line: KillFeedLine) => void
  onStatus: (status: NetStatus) => void
  onRequestChat: () => void
  /** desktop: Esc / pointer lock lost while playing */
  onPause?: () => void
}
