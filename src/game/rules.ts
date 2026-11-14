// Match rules shared by the engine and the React UI.
// Keep this file free of three.js / PeerJS imports so routes can import it at module level (SSR safe).

export type MatchMode = 'ffa' | 'duo' | 'squad' | 'training'
export type MatchPhase = 'countdown' | 'live' | 'ended'
export type Quality = 'low' | 'medium' | 'high'

export interface ModeInfo {
  id: MatchMode
  label: string
  tag: string
  /** 0 = free-for-all */
  teamSize: number
  /** total players in a bot match (you included) */
  botMatchSize: number
  /** max humans in an online room */
  maxPlayers: number
  /** kills to win (per player in FFA, per team otherwise); 0 = no limit */
  scoreLimit: number
  /** seconds; 0 = no limit */
  timeLimit: number
  blurb: string
}

export const MODES: Record<MatchMode, ModeInfo> = {
  ffa: {
    id: 'ffa',
    label: 'Quick Play',
    tag: 'FFA',
    teamSize: 0,
    botMatchSize: 8,
    maxPlayers: 8,
    scoreLimit: 20,
    timeLimit: 300,
    blurb: 'Everyone for themselves. First blade to 20 eliminations wins.',
  },
  duo: {
    id: 'duo',
    label: 'Skirmish',
    tag: '2v2',
    teamSize: 2,
    botMatchSize: 4,
    maxPlayers: 4,
    scoreLimit: 15,
    timeLimit: 300,
    blurb: 'Tight two-on-two team fights. First team to 15 wins.',
  },
  squad: {
    id: 'squad',
    label: 'Skirmish',
    tag: '5v5',
    teamSize: 5,
    botMatchSize: 10,
    maxPlayers: 10,
    scoreLimit: 40,
    timeLimit: 420,
    blurb: 'Full five-stack team deathmatch. First team to 40 wins.',
  },
  training: {
    id: 'training',
    label: 'Training',
    tag: 'Range',
    teamSize: 0,
    botMatchSize: 5,
    maxPlayers: 1,
    scoreLimit: 0,
    timeLimit: 0,
    blurb: 'No timer, no pressure. Practise bhops, grapples and slashes on passive dummies.',
  },
}

export const MAP_NAME = 'Dusk Shrine'
/** Length of the boot flyover that shows off the map before the lobby. */
export const INTRO_SECONDS = 7
export const MAP_REGION = 'Kyoto Outskirts · Night'

/** Team 0 / team 1 are drawn relative to the viewer: your side is always teal, theirs red. */
export const ALLY_COLOR = '#35e0c2'
export const ENEMY_COLOR = '#ff4a5c'

/** Damage scales with your speed: fast hits can one-shot. */
export function slashDamage(speed: number) {
  return Math.round(Math.min(100, 26 + speed * 1.7))
}

export function formatClock(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
