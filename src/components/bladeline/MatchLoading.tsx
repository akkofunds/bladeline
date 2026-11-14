import { MAP_NAME, MAP_REGION, MODES } from '@/game/rules'
import type { HudState, PlayerInfo } from '@/game/types'
import { cn } from '@/lib/utils'
import { SectionLabel } from './ui'

/** Pre-match screen: map title, both rosters as player cards, countdown. */
export function MatchLoading({ hud }: { hud: HudState }) {
  const m = MODES[hud.match.mode]
  const teams = m.teamSize > 0
  const mine = hud.match.myTeam
  const allies = teams ? hud.players.filter((p) => p.team === mine) : hud.players
  const enemies = teams ? hud.players.filter((p) => p.team !== mine) : []
  const count = hud.match.phase === 'countdown' ? Math.ceil(hud.match.timeLeft) : 0
  return (
    <div className="safe-pad absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-[oklch(0.1_0.02_255/0.88)] backdrop-blur-sm">
      <div className="bl-scanlines pointer-events-none absolute inset-0" />
      <div className="relative text-center">
        <SectionLabel>
          {m.label} {m.tag}
        </SectionLabel>
        <h2 className="animate-wipe font-display text-6xl leading-[0.85] tracking-[0.04em] sm:text-8xl">
          {MAP_NAME.toUpperCase()}
        </h2>
        <p className="text-xs uppercase tracking-[0.35em] text-white/60">{MAP_REGION}</p>
      </div>

      <div
        className={cn(
          'relative grid w-full max-w-5xl gap-4',
          teams ? 'grid-cols-[1fr_auto_1fr] items-center' : 'grid-cols-1',
        )}
      >
        <Roster players={allies} side="ally" teams={teams} />
        {teams && <span className="font-display text-4xl text-white/40 sm:text-6xl">VS</span>}
        {teams && <Roster players={enemies} side="enemy" teams={teams} />}
      </div>

      <div className="relative flex flex-col items-center">
        {count > 0 ? (
          <>
            <span key={count} className="animate-rise font-display text-8xl leading-none text-primary tabular-nums">
              {count}
            </span>
            <span className="text-xs uppercase tracking-[0.3em] text-white/60">Match starts</span>
          </>
        ) : (
          <span className="animate-blink font-display text-3xl tracking-[0.2em] text-white/80">LOADING</span>
        )}
      </div>
    </div>
  )
}

function Roster({ players, side, teams }: { players: PlayerInfo[]; side: 'ally' | 'enemy'; teams: boolean }) {
  return (
    <div
      className={cn(
        'grid gap-2',
        teams ? 'grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(7rem,1fr))]' : 'grid-cols-2 sm:grid-cols-4',
      )}
    >
      {players.map((p, i) => (
        <div
          key={p.id}
          className={cn(
            'clip-panel animate-rise flex items-center gap-2 border bg-[oklch(0.16_0.025_255/0.9)] px-3 py-2 sm:flex-col sm:items-start sm:py-3',
            side === 'ally' ? 'border-[var(--ally)]/40' : 'border-[var(--enemy)]/40',
            p.isYou && 'border-white/70',
          )}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <span
            className="clip-btn grid size-8 shrink-0 place-items-center font-display text-xl text-black sm:size-10 sm:text-2xl"
            style={{ background: p.color }}
            aria-hidden
          >
            {p.name[0]?.toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{p.name}</span>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {p.isYou ? 'You' : p.isBot ? 'Bot' : 'Player'}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}
