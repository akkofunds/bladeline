import type { MatchMode, Quality } from '@/game/rules'

export const COLORS = ['#ff3b5c', '#ff9f1c', '#ffe14d', '#3bff8f', '#2ee6ff', '#5b7cff', '#b45bff', '#ff5bd1']

export type QualitySetting = Quality | 'auto'
export type ControlScheme = 'auto' | 'touch' | 'mouse'

export interface Settings {
  name: string
  color: string
  sens: number
  touchSens: number
  quality: QualitySetting
  controls: ControlScheme
  volume: number
  showFps: boolean
  skipIntro: boolean
}

export interface Stats {
  matches: number
  wins: number
  kills: number
  deaths: number
  topSpeed: number
}

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  color: COLORS[0],
  sens: 2.2,
  touchSens: 1.6,
  quality: 'auto',
  controls: 'auto',
  volume: 0.5,
  showFps: false,
  skipIntro: false,
}

const EMPTY_STATS: Stats = { matches: 0, wins: 0, kills: 0, deaths: 0, topSpeed: 0 }

function read<T>(key: string): Partial<T> | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Partial<T>) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage can be blocked (private mode); settings just won't persist */
  }
}

export function loadSettings(): Settings {
  const saved = read<Settings>('bladeline:settings')
  if (saved) return { ...DEFAULT_SETTINGS, ...saved }
  // carry over settings from the BLADEHOP days
  const s = { ...DEFAULT_SETTINGS }
  try {
    const name = localStorage.getItem('bladehop:name')
    const color = localStorage.getItem('bladehop:color')
    const sens = Number(localStorage.getItem('bladehop:sens'))
    if (name) s.name = name
    if (color && COLORS.includes(color)) s.color = color
    if (sens) s.sens = sens
  } catch {
    /* ignore */
  }
  return s
}

export function saveSettings(s: Settings) {
  write('bladeline:settings', s)
}

export function loadStats(): Stats {
  return { ...EMPTY_STATS, ...read<Stats>('bladeline:stats') }
}

export function saveStats(s: Stats) {
  write('bladeline:stats', s)
}

export function isTouchDevice() {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const fine = window.matchMedia?.('(pointer: fine)').matches ?? false
  return coarse || (navigator.maxTouchPoints > 1 && !fine)
}

/** Picks a starting quality: phones and Chromebooks / low-core machines get Low. */
export function detectQuality(): Quality {
  if (typeof navigator === 'undefined') return 'medium'
  const ua = navigator.userAgent
  const cores = navigator.hardwareConcurrency || 4
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  if (isTouchDevice() || /CrOS/.test(ua) || cores <= 4 || mem <= 4) return 'low'
  if (cores >= 8 && mem >= 8) return 'high'
  return 'medium'
}

export function resolveQuality(q: QualitySetting): Quality {
  return q === 'auto' ? detectQuality() : q
}

export function resolveTouch(c: ControlScheme) {
  return c === 'auto' ? isTouchDevice() : c === 'touch'
}

export const DESKTOP_CONTROLS: [string, string][] = [
  ['WASD', 'Move'],
  ['Space (hold)', 'Jump / auto bunny hop'],
  ['A/D + mouse', 'Air strafe for speed'],
  ['Left click', 'Katana slash'],
  ['Right click', 'Dash'],
  ['F (hold)', 'Grapple hook'],
  ['V', 'Third-person camera'],
  ['Enter / T', 'Chat'],
  ['Tab', 'Scoreboard'],
]

export const TOUCH_CONTROLS: [string, string][] = [
  ['Left thumb', 'Move stick'],
  ['Right side drag', 'Look around'],
  ['JUMP (hold)', 'Auto bunny hop'],
  ['Slash', 'Katana strike'],
  ['Dash', 'Burst forward'],
  ['Hook (hold)', 'Grapple'],
]

export const MODE_ORDER: MatchMode[] = ['ffa', 'duo', 'squad', 'training']
