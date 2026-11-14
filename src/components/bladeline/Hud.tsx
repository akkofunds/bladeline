import { Copy, LogOut, MessageSquare, RotateCcw, Settings2, Swords, Users } from 'lucide-react'
import type { RefObject } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatClock, MODES, slashDamage } from '@/game/rules'
import type { ChatLine, HudState, KillFeedLine, NetStatus, PlayerInfo } from '@/game/types'
import { DESKTOP_CONTROLS, TOUCH_CONTROLS } from './settings'
import { AngledButton, ControlsGrid, Overlay, SectionLabel } from './ui'

export type FeedLine = KillFeedLine & { at: number }

export interface HudProps {
  hud: HudState
  status: NetStatus
  touch: boolean
  showFps: boolean
  feed: FeedLine[]
  banner: FeedLine | null
  chat: ChatLine[]
  chatOpen: boolean
  chatVisible: boolean
  chatText: string
  setChatText: (v: string) => void
  closeChat: (send: boolean) => void
  chatInputRef: RefObject<HTMLInputElement | null>
  showScores: boolean
  sens: number
  setSens: (v: number) => void
  onResume: () => void
  onLeave: () => void
  onCopyInvite: () => void
  onRematch: () => void
  onOpenSettings: () => void
  joinCode: string
  hosting: boolean
}

export function Hud(p: HudProps) {
  const { hud, status, touch } = p
  const now = hud.t
  const hitFlash = now - hud.hitMarker < 220
  const hurtFlash = now - hud.damageFlash < 300
  const ended = hud.match.phase === 'ended'
  const speedT = Math.max(0, Math.min(1, (hud.speed - 22) / 30))

  return (
    <>
      {/* speed lines: a cheap CSS overlay instead of a post-process pass */}
      {speedT > 0 && hud.alive && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: speedT * 0.55,
            background:
              'repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0.13) 0deg 0.6deg, transparent 0.6deg 7deg)',
            maskImage: 'radial-gradient(ellipse at center, transparent 38%, black 85%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, transparent 38%, black 85%)',
          }}
        />
      )}
      {/* damage vignette */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none',
          hurtFlash ? 'opacity-100' : 'opacity-0',
        )}
        style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(255,30,60,0.45) 100%)' }}
      />
      {hud.hp < 35 && hud.alive && (
        <div
          className="animate-blink pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(255,30,60,0.25) 100%)' }}
        />
      )}

      {/* crosshair */}
      {hud.alive && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="relative size-8">
            <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 bg-white shadow-[0_0_6px_rgba(0,0,0,0.9)]" />
            {[0, 90, 180, 270].map((r) => (
              <span
                key={r}
                className="absolute left-1/2 top-1/2 h-0.5 w-2 bg-white/80 shadow-[0_0_3px_rgba(0,0,0,0.9)]"
                style={{
                  transform: `translate(-50%,-50%) rotate(${r}deg) translateX(${8 + (1 - hud.slashReady) * 6}px)`,
                }}
              />
            ))}
            {hitFlash && (
              <>
                <span className="absolute left-1/2 top-1/2 h-0.5 w-9 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-primary" />
                <span className="absolute left-1/2 top-1/2 h-0.5 w-9 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-primary" />
                <span className="absolute left-8 -top-4 font-display text-3xl font-bold text-primary drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]">
                  {hud.lastDamage}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <MatchBar hud={hud} compact={touch} />
      <InstabilityBar hud={hud} />
      <CombatFlash hud={hud} />

      {/* top-left: room + meta */}
      <div className="absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] flex max-w-[40vw] flex-wrap items-center gap-2">
        {status.kind === 'online' && status.room && (
          <button
            type="button"
            onClick={p.onCopyInvite}
            className="flex items-center gap-2 border border-white/15 bg-black/45 px-2.5 py-1 text-sm backdrop-blur hover:bg-white/10"
          >
            <span className="font-semibold tracking-[0.2em]">{status.room}</span>
            <Copy className="size-3.5" aria-hidden />
            <span className="sr-only">Copy invite link</span>
          </button>
        )}
        <span className="flex items-center gap-1.5 border border-white/15 bg-black/45 px-2.5 py-1 text-sm backdrop-blur">
          <Users className="size-3.5" aria-hidden /> {hud.players.length}
        </span>
        {p.showFps && (
          <span className="border border-white/15 bg-black/45 px-2.5 py-1 text-xs tabular-nums text-white/70 backdrop-blur">
            {hud.fps} FPS · {Math.round(hud.renderScale * 100)}%
          </span>
        )}
      </div>

      {/* kill feed */}
      <div
        className={cn(
          'pointer-events-none absolute right-[max(0.75rem,env(safe-area-inset-right))] flex flex-col items-end gap-1',
          touch ? 'top-[max(6.5rem,calc(env(safe-area-inset-top)+6rem))]' : 'top-[max(0.75rem,env(safe-area-inset-top))]',
        )}
      >
        {p.feed.map((k) => (
          <div
            key={k.id}
            className={cn(
              'flex items-center gap-2 border-l-2 bg-black/60 px-2.5 py-0.5 text-xs backdrop-blur sm:text-sm',
              k.byYou ? 'border-primary bg-[oklch(0.65_0.22_20/0.3)]' : k.youDied ? 'border-white' : 'border-transparent',
            )}
          >
            <span style={{ color: k.killerColor }} className="font-semibold">
              {k.killer}
            </span>
            <Swords className="size-3.5 text-white/80" aria-hidden />
            <span style={{ color: k.victimColor }} className="font-semibold">
              {k.victim}
            </span>
            {k.speed > 0 && <span className="text-[10px] text-white/60">{k.speed} m/s</span>}
          </div>
        ))}
      </div>

      {/* elimination banner */}
      {p.banner && hud.alive && (
        <div
          key={p.banner.id}
          className="animate-banner pointer-events-none absolute inset-x-0 top-[62%] flex flex-col items-center"
        >
          <span className="clip-tag bg-primary px-4 pt-1 font-display text-2xl tracking-[0.2em] text-primary-foreground">
            {hud.streak > 1 ? `${hud.streak} STREAK` : 'ELIMINATED'}
          </span>
          <span className="mt-1 font-display text-4xl tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            {p.banner.victim}
          </span>
        </div>
      )}

      <Chat {...p} chatInputRef={p.chatInputRef} />

      {/* bottom HUD */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex items-end gap-3 px-[max(0.75rem,env(safe-area-inset-left))]',
          touch ? 'justify-center' : 'justify-between',
        )}
      >
        {!touch && (
          <div className="flex flex-col gap-2">
            <ResourceBlock hud={hud} />
            <HealthBlock hp={hud.hp} streak={hud.streak} />
          </div>
        )}
        {touch ? (
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2 bg-black/50 px-2 py-1 backdrop-blur">
              <span className="font-display text-xl leading-none tabular-nums">{Math.ceil(hud.hp)}</span>
              <div className="w-24">
                <HealthBar hp={hud.hp} />
              </div>
              <Pips count={hud.staminaMax} filled={hud.stamina} color="#35e0c2" />
              <Pips count={hud.ammoMax} filled={hud.ammo} color="#ffb02e" />
            </div>
            <SpeedBlock hud={hud} compact />
          </div>
        ) : (
          <SpeedBlock hud={hud} compact={false} />
        )}
        {!touch && (
          <div className="grid grid-cols-3 gap-1.5">
            <Ability label="Slash" keyName="LMB" ready={hud.slashReady} />
            <Ability label={`Gun ${hud.ammo}`} keyName="Q" ready={hud.ammo > 0 ? 1 : 0} />
            <Ability label="Parry" keyName="F" ready={hud.fatigued ? 0 : hud.parryReady} active={hud.parrying} />
            <Ability label="Hook" keyName="RMB" ready={hud.grappleReady} active={hud.grappling} />
            <Ability label="Dash" keyName="Shift" ready={hud.stamina >= 1 ? 1 : hud.stamina % 1} />
            <Ability label="Slide" keyName="C" ready={1} active={hud.sliding} />
          </div>
        )}
      </div>

      {/* death */}
      {!hud.alive && !ended && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
          <p className="font-display text-7xl tracking-wide text-primary drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">
            ELIMINATED
          </p>
          <p className="text-lg text-white/80">Respawning in {hud.respawnIn.toFixed(1)}s</p>
        </div>
      )}

      {p.showScores && !ended && <Scoreboard hud={hud} room={status.room} />}
      {ended && <EndScreen {...p} />}

      {/* connection states */}
      {status.kind === 'connecting' && (
        <Overlay>
          <span className="size-10 animate-turn rounded-full border-2 border-primary border-t-transparent" aria-hidden />
          <p className="font-display text-4xl tracking-wide">
            {p.hosting ? 'Opening your room…' : `Joining ${p.joinCode.toUpperCase()}…`}
          </p>
          <p className="text-muted-foreground">Connecting peer-to-peer</p>
          <AngledButton variant="outline" onClick={p.onLeave}>
            Cancel
          </AngledButton>
        </Overlay>
      )}
      {status.kind === 'error' && (
        <Overlay>
          <p className="font-display text-5xl tracking-wide text-primary">CONNECTION LOST</p>
          <p className="max-w-sm text-muted-foreground">{status.message}</p>
          <AngledButton onClick={p.onLeave}>Back to lobby</AngledButton>
        </Overlay>
      )}

      {status.kind === 'online' && !hud.locked && !p.chatOpen && !ended && <PauseMenu {...p} />}
    </>
  )
}

function MatchBar({ hud, compact }: { hud: HudState; compact: boolean }) {
  const m = MODES[hud.match.mode]
  const teams = m.teamSize > 0
  const me = hud.players.find((x) => x.isYou)
  const mine = hud.match.myTeam ?? 0
  // FFA: players are sorted by kills, so show the best score that isn't yours
  const leader = hud.players[0]
  const left = teams ? hud.match.teamScores[mine] : (me?.kills ?? 0)
  const right = teams
    ? hud.match.teamScores[1 - mine]
    : leader && !leader.isYou
      ? leader.kills
      : (hud.players[1]?.kills ?? 0)
  const clock =
    hud.match.phase === 'countdown'
      ? `0:0${Math.ceil(hud.match.timeLeft)}`
      : m.timeLimit
        ? formatClock(hud.match.timeLeft)
        : '∞'
  if (hud.match.mode === 'training') {
    return (
      <div className="pointer-events-none absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] -translate-x-1/2 text-center">
        <div className="clip-panel border border-white/15 bg-black/55 px-5 py-1 backdrop-blur">
          <p className="font-display text-2xl leading-none tracking-[0.2em]">TRAINING</p>
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/60">{me?.kills ?? 0} dummies cut</p>
        </div>
      </div>
    )
  }
  const low = m.timeLimit > 0 && hud.match.timeLeft < 30 && hud.match.phase === 'live'
  return (
    <div className="pointer-events-none absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] flex -translate-x-1/2 items-stretch">
      <ScoreBox value={left} label={teams ? 'Allies' : 'You'} color="var(--ally)" compact={compact} />
      <div className="flex min-w-20 flex-col items-center justify-center bg-black/70 px-3 backdrop-blur">
        <span className={cn('font-display text-3xl leading-none tabular-nums', low && 'text-primary')}>{clock}</span>
        <span className="text-[9px] uppercase tracking-[0.2em] text-white/55">to {m.scoreLimit}</span>
      </div>
      <ScoreBox value={right} label={teams ? 'Enemy' : 'Leader'} color="var(--enemy)" compact={compact} />
    </div>
  )
}

function ScoreBox({ value, label, color, compact }: { value: number; label: string; color: string; compact: boolean }) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center bg-black/50 px-3 backdrop-blur', compact ? 'min-w-12' : 'min-w-16')}
      style={{ boxShadow: `inset 0 -3px 0 ${color}` }}
    >
      <span className="font-display text-3xl leading-none tabular-nums" style={{ color }}>
        {value}
      </span>
      <span className="pb-1 text-[9px] uppercase tracking-[0.2em] text-white/55">{label}</span>
    </div>
  )
}

function HealthBar({ hp }: { hp: number }) {
  return (
    <div className="h-2 overflow-hidden bg-black/55">
      <div
        className="h-full transition-[width] duration-150 motion-reduce:transition-none"
        style={{ width: `${hp}%`, background: hp > 50 ? '#e8e4dc' : hp > 25 ? '#ffd24a' : '#ff3b5c' }}
      />
    </div>
  )
}

function HealthBlock({ hp, streak }: { hp: number; streak: number }) {
  return (
    <div className="clip-panel w-56 border border-white/10 bg-black/60 p-3 backdrop-blur">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-5xl leading-none tabular-nums">{Math.ceil(hp)}</span>
        <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Health</span>
        {streak > 0 && (
          <span className="ml-auto font-display text-xl leading-none text-primary">{streak} STREAK</span>
        )}
      </div>
      <div className="mt-1.5">
        <HealthBar hp={hp} />
      </div>
    </div>
  )
}

function speedColor(s: number) {
  if (s < 10) return '#ffffff'
  if (s < 18) return '#7ff8ff'
  if (s < 28) return '#ffe14d'
  if (s < 40) return '#ff9f1c'
  return '#ff3b5c'
}

function SpeedBlock({ hud, compact }: { hud: HudState; compact: boolean }) {
  const c = speedColor(hud.speed)
  return (
    <div className={cn('relative flex flex-col items-center bg-black/45 px-4 py-1.5 backdrop-blur', compact && 'mb-1 px-3 py-1')}>
      <span
        className={cn('font-display leading-none tabular-nums drop-shadow-[0_3px_3px_rgba(0,0,0,0.8)]', compact ? 'text-4xl' : 'text-6xl')}
        style={{ color: c }}
      >
        {Math.round(hud.speed)}
      </span>
      {hud.t - hud.boostAt < 900 && (
        <span
          key={hud.boostAt}
          className="animate-rise absolute -mt-7 font-display text-2xl leading-none text-primary drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]"
        >
          +{hud.boostAmount}
        </span>
      )}
      <span className="text-[10px] uppercase tracking-[0.3em] text-white/70">
        m/s · best {Math.round(hud.topSpeed)}
      </span>
      <div className={cn('mt-1 h-1 overflow-hidden bg-black/50', compact ? 'w-28' : 'w-48')}>
        <div className="h-full" style={{ width: `${Math.min(100, (hud.speed / 45) * 100)}%`, background: c }} />
      </div>
      <span className="mt-1 text-xs text-white/60">Slash dmg {slashDamage(hud.speed)}</span>
    </div>
  )
}

function Pips({ count, filled, color }: { count: number; filled: number; color: string }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }, (_, i) => {
        const f = Math.max(0, Math.min(1, filled - i))
        return (
          <span key={i} className="relative h-2.5 w-3 overflow-hidden bg-white/15">
            <span className="absolute inset-y-0 left-0" style={{ width: `${f * 100}%`, background: f >= 1 ? color : `${color}88` }} />
          </span>
        )
      })}
    </div>
  )
}

function ResourceBlock({ hud }: { hud: HudState }) {
  return (
    <div className="flex w-56 items-center justify-between gap-2 bg-black/60 px-3 py-1.5 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Stamina</span>
        <Pips count={hud.staminaMax} filled={hud.stamina} color="#35e0c2" />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Ammo</span>
        <Pips count={hud.ammoMax} filled={hud.ammo} color="#ffb02e" />
      </div>
    </div>
  )
}

function InstabilityBar({ hud }: { hud: HudState }) {
  if (hud.match.mode === 'training' && hud.instability <= 0) return null
  const v = Math.max(0, Math.min(100, hud.instability))
  const color = hud.destabilized ? '#ff2238' : v > 70 ? '#ff7a3d' : v > 40 ? '#ffd24a' : '#f2efe9'
  return (
    <div className="pointer-events-none absolute left-1/2 top-[max(4.4rem,calc(env(safe-area-inset-top)+3.9rem))] w-56 -translate-x-1/2 text-center">
      <div className="h-1.5 overflow-hidden bg-black/55">
        <div className="h-full transition-[width] duration-150" style={{ width: `${v}%`, background: color }} />
      </div>
      <p
        className={cn(
          'mt-0.5 text-[9px] uppercase tracking-[0.3em] drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]',
          hud.destabilized ? 'animate-blink font-semibold text-[#ff2238]' : 'text-white/70',
        )}
      >
        {hud.destabilized ? 'Destabilized' : hud.fatigued ? 'Parry fatigue' : `Instability ${Math.round(v)}%`}
      </p>
    </div>
  )
}

function CombatFlash({ hud }: { hud: HudState }) {
  const now = hud.t
  let text: string | null = null
  let color = '#ffffff'
  let key = 0
  if (now - hud.parryAt < 650) {
    text = 'PARRY'
    key = hud.parryAt
  } else if (now - hud.parriedAt < 750) {
    text = 'PARRIED'
    color = '#ff3b5c'
    key = hud.parriedAt
  } else if (now - hud.clashAt < 700) {
    text = hud.clashWon ? 'CLASH WON' : 'CLASH LOST'
    color = hud.clashWon ? '#35e0c2' : '#ff3b5c'
    key = hud.clashAt
  }
  if (!text) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center">
      <span
        key={key}
        className="animate-banner font-display text-5xl tracking-[0.2em] drop-shadow-[0_3px_4px_rgba(0,0,0,0.9)]"
        style={{ color }}
      >
        {text}
      </span>
    </div>
  )
}

function Ability({ label, keyName, ready, active }: { label: string; keyName: string; ready: number; active?: boolean }) {
  const r = Math.max(0, Math.min(1, ready))
  return (
    <div
      className={cn(
        'clip-btn relative w-[4.25rem] overflow-hidden border bg-black/60 px-1.5 py-1 text-center backdrop-blur',
        active ? 'border-accent' : r >= 1 ? 'border-white/25' : 'border-white/10',
      )}
    >
      <div className="absolute inset-x-0 bottom-0 bg-white/10" style={{ height: `${(1 - r) * 100}%` }} />
      <div className={cn('relative text-xs font-semibold uppercase tracking-wider', r >= 1 ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
      </div>
      <div className="relative mt-0.5 font-display text-lg leading-none text-accent">{keyName}</div>
    </div>
  )
}

function Chat({
  chat,
  chatOpen,
  chatVisible,
  hud,
  touch,
  chatInputRef,
  chatText,
  setChatText,
  closeChat,
}: HudProps) {
  return (
    <div
      className={cn(
        'absolute left-[max(0.75rem,env(safe-area-inset-left))] w-[min(420px,calc(100vw-2rem))]',
        touch ? 'top-[max(3.25rem,calc(env(safe-area-inset-top)+2.75rem))] w-[min(320px,45vw)]' : 'bottom-36',
        chatOpen && touch && 'z-40',
      )}
    >
      <div
        className={cn(
          'flex flex-col justify-end gap-0.5 overflow-hidden transition-opacity duration-500 motion-reduce:transition-none',
          touch ? 'max-h-28' : 'max-h-56',
          chatVisible ? 'opacity-100' : 'opacity-0',
        )}
      >
        {chat.slice(touch ? -4 : -9).map((l) => (
          <p
            key={l.id}
            className={cn(
              'w-fit max-w-full bg-black/55 px-2 py-0.5 text-xs break-words sm:text-sm',
              l.system && 'italic text-accent',
            )}
          >
            {!l.system && (
              <span className="font-semibold" style={{ color: l.color }}>
                {l.from}:{' '}
              </span>
            )}
            {l.text}
          </p>
        ))}
      </div>
      {chatOpen ? (
        <form
          className="mt-2"
          onSubmit={(e) => {
            e.preventDefault()
            closeChat(true)
          }}
        >
          <Input
            ref={chatInputRef}
            value={chatText}
            maxLength={200}
            aria-label="Chat message"
            enterKeyHint="send"
            placeholder={hud.match.online ? 'Say something…' : 'Bots are not great listeners…'}
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeChat(false)
              e.stopPropagation()
            }}
            onBlur={() => chatOpen && closeChat(false)}
            className="bg-black/75 backdrop-blur"
          />
        </form>
      ) : (
        hud.locked &&
        !touch && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-white/50">
            <MessageSquare className="size-3" aria-hidden /> Enter to chat
          </p>
        )
      )}
    </div>
  )
}

function ScoreTable({ players, title, accent }: { players: PlayerInfo[]; title?: string; accent?: string }) {
  return (
    <div>
      {title && (
        <p className="mb-1 font-display text-2xl leading-none tracking-wider" style={{ color: accent }}>
          {title}
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <th className="py-1 font-medium">Player</th>
            <th className="w-12 py-1 text-right font-medium">K</th>
            <th className="w-12 py-1 text-right font-medium">D</th>
          </tr>
        </thead>
        <tbody>
          {players.map((pl) => (
            <tr key={pl.id} className={cn('border-t border-white/10', pl.isYou && 'bg-white/10')}>
              <td className="py-1.5">
                <span className="mr-2 inline-block size-2.5" style={{ background: pl.color }} />
                <span className="font-semibold">{pl.name}</span>
                {pl.isYou && <span className="ml-2 text-xs text-muted-foreground">you</span>}
                {pl.isBot && <span className="ml-2 text-xs text-muted-foreground">bot</span>}
              </td>
              <td className="py-1.5 text-right tabular-nums">{pl.kills}</td>
              <td className="py-1.5 text-right tabular-nums">{pl.deaths}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScoreBody({ hud }: { hud: HudState }) {
  const teams = MODES[hud.match.mode].teamSize > 0
  if (!teams) return <ScoreTable players={hud.players} />
  const mine = hud.match.myTeam ?? 0
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ScoreTable
        title={`ALLIES · ${hud.match.teamScores[mine]}`}
        accent="var(--ally)"
        players={hud.players.filter((x) => x.team === mine)}
      />
      <ScoreTable
        title={`ENEMY · ${hud.match.teamScores[1 - mine]}`}
        accent="var(--enemy)"
        players={hud.players.filter((x) => x.team !== mine)}
      />
    </div>
  )
}

function Scoreboard({ hud, room }: { hud: HudState; room?: string }) {
  const m = MODES[hud.match.mode]
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-4">
      <div className="clip-panel max-h-[85vh] w-full max-w-2xl overflow-y-auto border border-white/15 bg-[oklch(0.13_0.025_255/0.92)] p-5 backdrop-blur-md">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-4xl leading-none tracking-wide">
            {m.label.toUpperCase()} <span className="text-primary">{m.tag.toUpperCase()}</span>
          </h2>
          {room && <span className="text-sm tracking-[0.2em] text-muted-foreground">ROOM {room}</span>}
        </div>
        <ScoreBody hud={hud} />
      </div>
    </div>
  )
}

function EndScreen(p: HudProps) {
  const { hud } = p
  const w = hud.match.winner
  const me = hud.players.find((x) => x.isYou)
  const draw = w === 'draw'
  const won = !draw && (w === `team:${hud.match.myTeam}` || (!!me && w === me.id))
  const winnerName = !draw && w && !w.startsWith('team:') ? hud.players.find((x) => x.id === w)?.name : null
  return (
    <Overlay className="z-40 bg-[oklch(0.1_0.02_255/0.85)]">
      <div className="animate-rise flex w-full max-w-2xl flex-col items-center gap-4">
        <SectionLabel>Match complete</SectionLabel>
        <h2
          className={cn(
            'font-display text-8xl leading-[0.8] tracking-[0.06em] sm:text-9xl',
            draw ? 'text-white' : won ? 'text-accent' : 'text-primary',
          )}
        >
          {draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT'}
        </h2>
        {winnerName && !won && <p className="text-white/75">{winnerName} took the match</p>}
        <div className="clip-panel w-full border border-white/15 bg-black/40 p-4 text-left">
          <ScoreBody hud={hud} />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {hud.match.online ? (
            <p className="w-full text-center text-sm text-muted-foreground">
              Next match in {Math.ceil(hud.match.restartIn)}s
            </p>
          ) : (
            <AngledButton onClick={p.onRematch}>
              <RotateCcw aria-hidden /> Play again
            </AngledButton>
          )}
          <AngledButton variant="outline" onClick={p.onLeave}>
            <LogOut aria-hidden /> Lobby
          </AngledButton>
        </div>
      </div>
    </Overlay>
  )
}

function PauseMenu(p: HudProps) {
  const { touch, hud } = p
  const m = MODES[hud.match.mode]
  return (
    <Overlay onClick={p.onResume}>
      <SectionLabel>
        {m.label} {m.tag}
      </SectionLabel>
      <p className="font-display text-6xl leading-none tracking-wide">{touch ? 'TAP TO PLAY' : 'CLICK TO FIGHT'}</p>
      <ControlsGrid controls={touch ? TOUCH_CONTROLS : DESKTOP_CONTROLS} />
      {!touch && (
        <div className="flex w-full max-w-sm items-center gap-3 text-sm" onClick={(e) => e.stopPropagation()}>
          <label htmlFor="sens" className="whitespace-nowrap text-muted-foreground">
            Mouse sensitivity
          </label>
          <input
            id="sens"
            type="range"
            min={0.5}
            max={6}
            step={0.1}
            value={p.sens}
            onChange={(e) => p.setSens(Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
          />
          <span className="w-8 tabular-nums">{p.sens.toFixed(1)}</span>
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-2" onClick={(e) => e.stopPropagation()}>
        <AngledButton onClick={p.onResume}>Resume</AngledButton>
        {p.status.room && (
          <AngledButton variant="ghost" onClick={p.onCopyInvite}>
            <Copy aria-hidden /> Invite
          </AngledButton>
        )}
        <AngledButton variant="ghost" onClick={p.onOpenSettings}>
          <Settings2 aria-hidden /> Settings
        </AngledButton>
        <AngledButton variant="outline" onClick={p.onLeave}>
          <LogOut aria-hidden /> Leave
        </AngledButton>
      </div>
      {!touch && (
        <p className="max-w-md text-sm text-white/55">
          Tip: hold Space and strafe into your turns (A while turning left, D while turning right) to build speed.
        </p>
      )}
    </Overlay>
  )
}
