import { useEffect, useState } from 'react'
import { Crosshair, Link2, LogIn, Settings2, Swords, Target, Trophy, Users, X, Zap } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatClock, MAP_NAME, MODES, type MatchMode } from '@/game/rules'
import { COLORS, MODE_ORDER, type Settings, type Stats } from './settings'
import { AngledButton, Logo, Panel, SectionLabel } from './ui'

export interface QueueState {
  mode: MatchMode
  startedAt: number
  found: boolean
}

type Tab = 'play' | 'custom' | 'career'

const MODE_ICON: Record<MatchMode, typeof Swords> = {
  ffa: Crosshair,
  duo: Users,
  squad: Swords,
  training: Target,
}

export function Lobby(props: {
  ready: boolean
  settings: Settings
  update: (patch: Partial<Settings>) => void
  stats: Stats
  queue: QueueState | null
  joinCode: string
  setJoinCode: (v: string) => void
  onQueue: (mode: MatchMode) => void
  onCancelQueue: () => void
  onHost: (mode: MatchMode) => void
  onJoin: () => void
  onOpenSettings: () => void
  onUi: (kind: 'hover' | 'click') => void
}) {
  const { settings, update, queue, onUi } = props
  const [tab, setTab] = useState<Tab>(props.joinCode ? 'custom' : 'play')
  const [mode, setMode] = useState<MatchMode>('ffa')

  const tabs: [Tab, string][] = [
    ['play', 'Play'],
    ['custom', 'Custom'],
    ['career', 'Career'],
  ]

  return (
    <div className="absolute inset-0 z-10 flex flex-col overflow-hidden">
      {/* readability gradients over the live arena */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[oklch(0.11_0.02_255/0.9)] via-transparent to-[oklch(0.11_0.02_255/0.95)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[oklch(0.11_0.02_255/0.7)] via-transparent to-transparent" />

      {/* top bar */}
      <header className="safe-pad relative flex shrink-0 items-center gap-3 border-b border-white/10 bg-[oklch(0.11_0.02_255/0.6)] !py-2 backdrop-blur-md sm:gap-6 short:!py-1">
        <Logo size="sm" className="shrink-0 sm:text-3xl" />
        <nav className="flex flex-1 justify-center gap-1 sm:gap-4" aria-label="Lobby">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onUi('click')
                setTab(id)
              }}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'relative px-2 pt-1 font-display text-2xl uppercase tracking-[0.12em] transition-colors sm:px-4 sm:text-3xl',
                tab === id ? 'text-foreground' : 'text-white/45 hover:text-white/80',
              )}
            >
              {label}
              {tab === id && <span className="absolute inset-x-2 -bottom-2 h-0.5 bg-primary sm:inset-x-4" />}
            </button>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-2 border border-white/10 bg-black/30 px-3 py-1.5 text-sm sm:flex">
            <span className="size-2.5 rounded-full" style={{ background: settings.color }} />
            <span className="max-w-28 truncate font-semibold">{settings.name.trim() || 'Ronin'}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onUi('click')
              props.onOpenSettings()
            }}
            className="grid size-10 place-items-center border border-white/10 bg-black/30 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Settings2 className="size-5" aria-hidden />
            <span className="sr-only">Settings</span>
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {tab === 'play' && (
          <PlayTab
            {...props}
            mode={mode}
            setMode={(m) => {
              onUi('click')
              setMode(m)
            }}
          />
        )}
        {tab === 'custom' && <CustomTab {...props} />}
        {tab === 'career' && <CareerTab stats={props.stats} settings={settings} update={update} onUi={onUi} />}
      </div>

      {queue && <QueueBanner queue={queue} onCancel={props.onCancelQueue} />}
    </div>
  )
}

function PlayTab(props: Parameters<typeof Lobby>[0] & { mode: MatchMode; setMode: (m: MatchMode) => void }) {
  const { mode, setMode, queue, ready, settings, update, onUi } = props
  const info = MODES[mode]
  return (
    <div className="safe-pad mx-auto flex min-h-full max-w-6xl flex-col gap-5 !pt-6 pb-28 lg:justify-end lg:pb-8 short:justify-end short:gap-3 short:!pt-3 short:!pb-3">
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-end short:block">
        {/* selected mode hero */}
        <div className="animate-rise" key={mode}>
          <span className="clip-tag inline-block bg-primary px-3 py-0.5 text-xs font-semibold uppercase tracking-[0.3em] text-primary-foreground">
            {mode === 'training' ? 'Solo' : 'Vs bots'} · {MAP_NAME}
          </span>
          <h1 className="mt-2 font-display text-6xl leading-[0.85] tracking-[0.03em] text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)] sm:text-8xl short:text-5xl sm:short:text-6xl">
            {info.label.toUpperCase()} <span className="text-primary">{info.tag.toUpperCase()}</span>
          </h1>
          <p className="mt-2 max-w-lg text-base text-white/80 sm:text-lg short:mt-1 short:text-sm">{info.blurb}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em] text-white/70 short:hidden">
            <Chip>{info.teamSize ? `${info.teamSize} v ${info.teamSize}` : mode === 'training' ? 'Passive dummies' : `${info.botMatchSize} players`}</Chip>
            <Chip>{info.scoreLimit ? `First to ${info.scoreLimit}` : 'No score limit'}</Chip>
            <Chip>{info.timeLimit ? `${formatClock(info.timeLimit)} clock` : 'No timer'}</Chip>
          </div>
        </div>

        {/* on short screens the operator card lives in the Career tab only */}
        <div className="short:hidden">
          <OperatorCard settings={settings} update={update} onUi={onUi} />
        </div>
      </div>

      {/* mode cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4 short:grid-cols-4" role="radiogroup" aria-label="Game mode">
        {MODE_ORDER.map((id) => {
          const m = MODES[id]
          const Icon = MODE_ICON[id]
          const selected = id === mode
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!!queue}
              onMouseEnter={() => onUi('hover')}
              onClick={() => setMode(id)}
              className={cn(
                'clip-panel group relative flex min-h-24 flex-col justify-between overflow-hidden border p-3 text-left transition-[background-color,border-color] duration-150 sm:min-h-28 sm:p-4 short:min-h-16 sm:short:min-h-16 short:p-2.5',
                selected
                  ? 'border-primary bg-[oklch(0.65_0.22_20/0.18)]'
                  : 'border-white/10 bg-[oklch(0.14_0.025_255/0.8)] hover:border-white/30 hover:bg-[oklch(0.2_0.03_255/0.85)]',
                'disabled:opacity-60',
              )}
            >
              <Icon
                className={cn(
                  'absolute -right-3 -bottom-3 size-20 opacity-10 transition-transform group-hover:scale-110',
                  selected && 'text-primary opacity-25',
                )}
                aria-hidden
              />
              <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                {m.label}
              </span>
              <span className={cn('font-display text-3xl leading-none sm:text-4xl', selected && 'text-primary')}>
                {m.tag.toUpperCase()}
              </span>
            </button>
          )
        })}
      </div>

      {/* start */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-[oklch(0.11_0.02_255)] to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] lg:static lg:bg-none lg:p-0 short:static short:bg-none short:p-0">
        <AngledButton
          className="h-14 w-full max-w-md text-3xl sm:h-16 sm:text-4xl short:h-12 sm:short:h-12 short:text-3xl"
          disabled={!ready || !!queue}
          onClick={() => props.onQueue(mode)}
        >
          {mode === 'training' ? <Target aria-hidden /> : <Zap aria-hidden />}
          {mode === 'training' ? 'Enter range' : 'Start'}
        </AngledButton>
      </div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="border border-white/15 bg-black/35 px-2.5 py-1 backdrop-blur">{children}</span>
}

function OperatorCard({
  settings,
  update,
  onUi,
}: {
  settings: Settings
  update: (p: Partial<Settings>) => void
  onUi: (k: 'hover' | 'click') => void
}) {
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <SectionLabel>Operator</SectionLabel>
      <div className="flex items-center gap-3">
        <div
          className="clip-btn grid size-12 shrink-0 place-items-center font-display text-3xl text-black"
          style={{ background: settings.color }}
          aria-hidden
        >
          {(settings.name.trim() || 'R')[0].toUpperCase()}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="op-name" className="sr-only">
            Your name
          </label>
          <Input
            id="op-name"
            value={settings.name}
            maxLength={16}
            placeholder="Ronin"
            onChange={(e) => update({ name: e.target.value })}
            className="h-10 bg-black/40 text-base font-semibold"
          />
        </div>
      </div>
      <fieldset>
        <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          Scarf colour
        </legend>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={c === settings.color}
              onClick={() => {
                onUi('click')
                update({ color: c })
              }}
              className={cn(
                'size-8 border-2 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none',
                c === settings.color ? 'scale-110 border-white' : 'border-transparent hover:scale-105',
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </fieldset>
    </Panel>
  )
}

function CustomTab(props: Parameters<typeof Lobby>[0]) {
  const { ready, joinCode, setJoinCode, onHost, onJoin, onUi } = props
  const [mode, setMode] = useState<MatchMode>('ffa')
  const codeValid = /^[A-Z0-9]{5}$/i.test(joinCode.trim())
  const online: MatchMode[] = ['ffa', 'duo', 'squad']
  return (
    <div className="safe-pad mx-auto grid min-h-full max-w-5xl content-center gap-4 !pt-6 pb-10 md:grid-cols-2">
      <div className="md:col-span-2">
        <h1 className="font-display text-6xl leading-[0.85] text-white sm:text-7xl">
          PLAY WITH <span className="text-primary">FRIENDS</span>
        </h1>
        <p className="mt-2 max-w-xl text-white/75">
          Host a private room and share the 5-letter code or the invite link. Rooms are peer-to-peer and close when the
          host leaves.
        </p>
      </div>

      <Panel className="flex flex-col gap-4 p-5">
        <SectionLabel>Host a room</SectionLabel>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Room mode">
          {online.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => {
                onUi('click')
                setMode(id)
              }}
              className={cn(
                'clip-btn flex flex-col items-start border px-3 py-2 text-left',
                mode === id ? 'border-primary bg-[oklch(0.65_0.22_20/0.18)]' : 'border-white/10 bg-black/30 hover:bg-white/10',
              )}
            >
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{MODES[id].label}</span>
              <span className="font-display text-2xl leading-none">{MODES[id].tag.toUpperCase()}</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Up to {MODES[mode].maxPlayers} players.{' '}
          {MODES[mode].teamSize ? 'Teams are balanced automatically as friends join.' : 'Everyone for themselves.'}
        </p>
        <AngledButton disabled={!ready} onClick={() => onHost(mode)}>
          <Link2 aria-hidden /> Create room
        </AngledButton>
      </Panel>

      <Panel className="flex flex-col gap-4 p-5">
        <SectionLabel>Join a room</SectionLabel>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (codeValid) onJoin()
          }}
        >
          <label htmlFor="room-code" className="sr-only">
            Room code
          </label>
          <Input
            id="room-code"
            value={joinCode}
            maxLength={5}
            placeholder="CODE"
            autoCapitalize="characters"
            autoComplete="off"
            className="h-14 bg-black/40 text-center font-display text-4xl uppercase tracking-[0.4em]"
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
          <AngledButton type="submit" variant="outline" disabled={!ready || !codeValid}>
            <LogIn aria-hidden /> Join
          </AngledButton>
        </form>
        <p className="text-sm text-muted-foreground">Got an invite link? Opening it fills the code in for you.</p>
      </Panel>
    </div>
  )
}

function CareerTab({
  stats,
  settings,
  update,
  onUi,
}: {
  stats: Stats
  settings: Settings
  update: (p: Partial<Settings>) => void
  onUi: (k: 'hover' | 'click') => void
}) {
  const kd = stats.deaths ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2)
  const winRate = stats.matches ? Math.round((stats.wins / stats.matches) * 100) : 0
  const tiles: [string, string][] = [
    ['Matches', String(stats.matches)],
    ['Wins', String(stats.wins)],
    ['Win rate', `${winRate}%`],
    ['Eliminations', String(stats.kills)],
    ['K / D', kd],
    ['Top speed', `${Math.round(stats.topSpeed)} m/s`],
  ]
  return (
    <div className="safe-pad mx-auto grid min-h-full max-w-5xl content-center gap-4 !pt-6 pb-10 lg:grid-cols-[1fr_20rem]">
      <div>
        <h1 className="font-display text-6xl leading-[0.85] text-white sm:text-7xl">
          CAREER <Trophy className="inline size-12 text-primary" aria-hidden />
        </h1>
        <p className="mt-2 text-white/70">Stats from finished matches on this device.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tiles.map(([k, v]) => (
            <Panel key={k} className="p-4">
              <SectionLabel>{k}</SectionLabel>
              <p className="mt-1 font-display text-5xl leading-none tabular-nums">{v}</p>
            </Panel>
          ))}
        </div>
      </div>
      <div className="lg:self-end">
        <OperatorCard settings={settings} update={update} onUi={onUi} />
      </div>
    </div>
  )
}

function QueueBanner({ queue, onCancel }: { queue: QueueState; onCancel: () => void }) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(id)
  }, [])
  const m = MODES[queue.mode]
  const secs = Math.max(0, (now - queue.startedAt) / 1000)
  return (
    <div className="absolute inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-30 flex justify-center px-4 pt-3">
      <div
        className={cn(
          'clip-panel animate-rise flex w-full max-w-md items-center gap-4 border px-4 py-3 backdrop-blur-md',
          queue.found ? 'border-accent bg-[oklch(0.83_0.13_180/0.2)]' : 'border-primary/60 bg-[oklch(0.14_0.025_255/0.92)]',
        )}
        role="status"
        aria-live="polite"
      >
        <span
          className={cn(
            'size-8 shrink-0 rounded-full border-2 border-t-transparent',
            queue.found ? 'border-accent' : 'animate-turn border-primary',
          )}
          aria-hidden
        />
        <div className="flex-1">
          <p className="font-display text-3xl leading-none tracking-wide">
            {queue.found ? <span className="text-accent">MATCH FOUND</span> : 'FINDING MATCH'}
          </p>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {m.label} {m.tag} · {queue.found ? 'Loading map' : formatClock(Math.floor(secs))}
          </p>
        </div>
        {!queue.found && (
          <button
            type="button"
            onClick={onCancel}
            className="grid size-10 place-items-center border border-white/15 text-white/80 hover:bg-white/10"
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Cancel queue</span>
          </button>
        )}
      </div>
    </div>
  )
}
