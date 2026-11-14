import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, LogOut, MessageSquare, Swords, Users, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Game } from '@/game/Game'
import type { ChatLine, HudState, KillFeedLine } from '@/game/types'

const COLORS = ['#ff3b5c', '#ff9f1c', '#ffe14d', '#3bff8f', '#2ee6ff', '#5b7cff', '#b45bff', '#ff5bd1']

type Status = { kind: 'idle' | 'connecting' | 'online' | 'error'; message?: string; room?: string }
type Mode = 'practice' | 'host' | 'join'

const CONTROLS: [string, string][] = [
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

export function BladeHop() {
  const mountRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState<Mode | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [hud, setHud] = useState<HudState | null>(null)
  const [chat, setChat] = useState<ChatLine[]>([])
  const [feed, setFeed] = useState<(KillFeedLine & { at: number })[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [chatText, setChatText] = useState('')
  const [showScores, setShowScores] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [joinCode, setJoinCode] = useState('')
  const [sens, setSens] = useState(2.2)
  const [lastChatAt, setLastChatAt] = useState(0)

  // boot the engine (client only — three.js and PeerJS need the browser)
  useEffect(() => {
    let disposed = false
    const savedName = localStorage.getItem('bladehop:name')
    const savedColor = localStorage.getItem('bladehop:color')
    const savedSens = localStorage.getItem('bladehop:sens')
    if (savedName) setName(savedName)
    if (savedColor && COLORS.includes(savedColor)) setColor(savedColor)
    if (savedSens) setSens(Number(savedSens) || 2.2)
    const hash = window.location.hash.replace('#', '').toUpperCase()
    if (/^[A-Z0-9]{5}$/.test(hash)) setJoinCode(hash)

    void import('@/game/Game').then(({ Game }) => {
      if (disposed || !mountRef.current) return
      const game = new Game(mountRef.current, {
        onHud: setHud,
        onChat: (line) => {
          setChat((c) => [...c.slice(-59), line])
          setLastChatAt(performance.now())
        },
        onKill: (line) => setFeed((f) => [...f.slice(-5), { ...line, at: performance.now() }]),
        onStatus: setStatus,
        onRequestChat: () => {
          setChatOpen(true)
          gameRef.current?.setTyping(true)
          setTimeout(() => chatInputRef.current?.focus(), 0)
        },
      })
      gameRef.current = game
      setReady(true)
    })
    return () => {
      disposed = true
      gameRef.current?.dispose()
      gameRef.current = null
    }
  }, [])

  useEffect(() => {
    if (gameRef.current) gameRef.current.sensitivity = sens / 1000
    localStorage.setItem('bladehop:sens', String(sens))
  }, [sens, ready])

  // expire kill feed lines
  useEffect(() => {
    const id = setInterval(() => setFeed((f) => f.filter((l) => performance.now() - l.at < 6000)), 1000)
    return () => clearInterval(id)
  }, [])

  // Tab scoreboard
  useEffect(() => {
    if (!playing) return
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault()
        setShowScores(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Tab') setShowScores(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [playing])

  const start = useCallback(
    (mode: Mode) => {
      const game = gameRef.current
      if (!game) return
      const n = name.trim() || 'Ronin'
      localStorage.setItem('bladehop:name', n)
      localStorage.setItem('bladehop:color', color)
      setChat([])
      setFeed([])
      setPlaying(mode)
      void game.start(mode, { name: n, color, room: joinCode.trim().toUpperCase() })
      game.requestLock()
    },
    [name, color, joinCode],
  )

  const leave = useCallback(() => {
    gameRef.current?.leave()
    setPlaying(null)
    setChatOpen(false)
    gameRef.current?.setTyping(false)
    if (window.location.hash) history.replaceState(null, '', window.location.pathname)
  }, [])

  // reflect the room in the URL so the address bar is the invite link
  useEffect(() => {
    if (status.kind === 'online' && status.room) history.replaceState(null, '', `#${status.room}`)
  }, [status])

  const closeChat = (send: boolean) => {
    if (send && chatText.trim()) gameRef.current?.sendChat(chatText)
    setChatText('')
    setChatOpen(false)
    gameRef.current?.setTyping(false)
    gameRef.current?.requestLock()
  }

  const copyInvite = async () => {
    if (!status.room) return
    const url = `${window.location.origin}/#${status.room}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Invite link copied', { description: url })
    } catch {
      toast(`Room code: ${status.room}`)
    }
  }

  const now = hud?.t ?? 0
  const hitFlash = hud && now - hud.hitMarker < 220
  const hurtFlash = hud && now - hud.damageFlash < 300
  const chatVisible = chatOpen || now - lastChatAt < 8000
  const inGame = playing !== null

  return (
    <div className="fixed inset-0 overflow-hidden bg-background text-foreground select-none">
      <div
        ref={mountRef}
        className="absolute inset-0"
        onClick={() => {
          if (inGame && !chatOpen) gameRef.current?.requestLock()
        }}
      />

      {!inGame && (
        <Lobby
          ready={ready}
          name={name}
          setName={setName}
          color={color}
          setColor={setColor}
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          onStart={start}
        />
      )}

      {inGame && hud && (
        <>
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
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(255,30,60,0.25) 100%)' }}
            />
          )}

          {/* crosshair */}
          {hud.alive && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="relative size-8">
                <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_6px_rgba(0,0,0,0.9)]" />
                <span
                  className="absolute inset-0 rounded-full border-2 border-white/50"
                  style={{ opacity: hud.slashReady >= 1 ? 1 : 0.15, transform: `scale(${0.7 + 0.3 * hud.slashReady})` }}
                />
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

          {/* top-left: room */}
          <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
            <div className="rounded-md border border-border bg-card px-3 py-1.5 backdrop-blur">
              <span className="font-display text-2xl leading-none tracking-wide text-primary">BLADEHOP</span>
            </div>
            {status.kind === 'online' && status.room && (
              <button
                type="button"
                onClick={copyInvite}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm backdrop-blur hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="text-muted-foreground">Room</span>
                <span className="font-semibold tracking-[0.2em]">{status.room}</span>
                <Copy className="size-3.5" aria-hidden />
                <span className="sr-only">Copy invite link</span>
              </button>
            )}
            {playing === 'practice' && (
              <span className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground backdrop-blur">
                Practice arena
              </span>
            )}
            <span className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm backdrop-blur">
              <Users className="size-3.5" aria-hidden /> {hud.players.length}
            </span>
          </div>

          {/* top-right: kill feed */}
          <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-1.5">
            {feed.map((k) => (
              <div key={k.id} className="flex items-center gap-2 rounded bg-black/55 px-3 py-1 text-sm backdrop-blur">
                <span style={{ color: k.killerColor }} className="font-semibold">
                  {k.killer}
                </span>
                <Swords className="size-3.5 text-white/80" aria-hidden />
                <span style={{ color: k.victimColor }} className="font-semibold">
                  {k.victim}
                </span>
                {k.speed > 0 && <span className="text-xs text-white/60">{k.speed} m/s</span>}
              </div>
            ))}
          </div>

          {/* chat */}
          <div className="absolute bottom-36 left-4 w-[min(420px,calc(100vw-2rem))]">
            <div
              className={cn(
                'flex max-h-56 flex-col justify-end gap-0.5 overflow-hidden transition-opacity duration-500 motion-reduce:transition-none',
                chatVisible ? 'opacity-100' : 'opacity-0',
              )}
            >
              {chat.slice(-9).map((l) => (
                <p
                  key={l.id}
                  className={cn(
                    'w-fit max-w-full rounded bg-black/50 px-2 py-0.5 text-sm break-words',
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
                  placeholder={playing === 'practice' ? 'Talk to yourself… (host a room to chat)' : 'Say something…'}
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') closeChat(false)
                    e.stopPropagation()
                  }}
                  onBlur={() => chatOpen && closeChat(false)}
                  className="bg-black/70 backdrop-blur"
                />
              </form>
            ) : (
              hud.locked && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-white/50">
                  <MessageSquare className="size-3" aria-hidden /> Enter to chat
                </p>
              )
            )}
          </div>

          {/* bottom HUD */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex items-end justify-between gap-4 px-4">
            <div className="w-56 rounded-lg border border-border bg-card p-3 backdrop-blur">
              <div className="flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Health</span>
                <span className="font-display text-3xl leading-none">{Math.ceil(hud.hp)}</span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-black/50">
                <div
                  className="h-full rounded-full transition-[width] duration-150 motion-reduce:transition-none"
                  style={{
                    width: `${hud.hp}%`,
                    background: hud.hp > 50 ? '#3bff8f' : hud.hp > 25 ? '#ffd24a' : '#ff3b5c',
                  }}
                />
              </div>
            </div>

            <div className="flex flex-col items-center">
              <span
                className="font-display text-6xl leading-none drop-shadow-[0_3px_3px_rgba(0,0,0,0.8)]"
                style={{ color: speedColor(hud.speed) }}
              >
                {Math.round(hud.speed)}
              </span>
              <span className="text-xs uppercase tracking-[0.3em] text-white/70">m/s · best {Math.round(hud.topSpeed)}</span>
              <div className="mt-1 h-1 w-48 overflow-hidden rounded-full bg-black/50">
                <div
                  className="h-full"
                  style={{ width: `${Math.min(100, (hud.speed / 45) * 100)}%`, background: speedColor(hud.speed) }}
                />
              </div>
              <span className="mt-1 text-xs text-white/60">Damage {slashPreview(hud.speed)}</span>
            </div>

            <div className="flex gap-2">
              <Ability label="Slash" keyName="LMB" ready={hud.slashReady} />
              <Ability label="Dash" keyName="RMB" ready={hud.dashReady} />
              <Ability label="Grapple" keyName="F" ready={hud.grappleReady} active={hud.grappling} />
            </div>
          </div>

          {/* death */}
          {!hud.alive && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
              <p className="font-display text-7xl tracking-wide text-primary drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">
                SLAIN
              </p>
              <p className="text-lg text-white/80">Respawning in {hud.respawnIn.toFixed(1)}s</p>
            </div>
          )}

          {/* scoreboard */}
          {showScores && <Scoreboard hud={hud} room={status.room} />}

          {/* connection states */}
          {status.kind === 'connecting' && (
            <Overlay>
              <p className="font-display text-4xl tracking-wide">
                {playing === 'host' ? 'Opening your room…' : `Joining ${joinCode.toUpperCase()}…`}
              </p>
              <p className="text-muted-foreground">Connecting peer-to-peer</p>
              <Button variant="secondary" onClick={leave}>
                Cancel
              </Button>
            </Overlay>
          )}
          {status.kind === 'error' && (
            <Overlay>
              <p className="font-display text-4xl tracking-wide text-primary">Connection lost</p>
              <p className="max-w-sm text-muted-foreground">{status.message}</p>
              <Button onClick={leave}>Back to the lobby</Button>
            </Overlay>
          )}

          {/* pause / click to play */}
          {status.kind === 'online' && !hud.locked && !chatOpen && (
            <Overlay onClick={() => gameRef.current?.requestLock()}>
              <p className="font-display text-5xl tracking-wide">Click to fight</p>
              <ControlsGrid />
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
                  value={sens}
                  onChange={(e) => setSens(Number(e.target.value))}
                  className="w-full accent-[var(--primary)]"
                />
                <span className="w-8 tabular-nums">{sens.toFixed(1)}</span>
              </div>
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                {status.room && (
                  <Button variant="secondary" onClick={copyInvite}>
                    <Copy aria-hidden /> Copy invite
                  </Button>
                )}
                <Button variant="outline" onClick={leave}>
                  <LogOut aria-hidden /> Leave arena
                </Button>
              </div>
            </Overlay>
          )}
        </>
      )}
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

function slashPreview(speed: number) {
  return Math.round(Math.min(100, 26 + speed * 1.7))
}

function Ability({ label, keyName, ready, active }: { label: string; keyName: string; ready: number; active?: boolean }) {
  const r = Math.max(0, Math.min(1, ready))
  return (
    <div
      className={cn(
        'relative w-20 overflow-hidden rounded-lg border bg-card p-2 text-center backdrop-blur',
        active ? 'border-accent' : r >= 1 ? 'border-border' : 'border-border/40',
      )}
    >
      <div className="absolute inset-x-0 bottom-0 bg-white/10" style={{ height: `${(1 - r) * 100}%` }} />
      <div className={cn('relative text-xs font-semibold', r >= 1 ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
      </div>
      <div className="relative mt-0.5 font-display text-xl leading-none text-accent">{keyName}</div>
    </div>
  )
}

function Overlay({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      className="absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-center gap-5 bg-black/55 px-4 text-center backdrop-blur-sm"
      onClick={onClick}
    >
      {children}
    </div>
  )
}

function ControlsGrid() {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-left text-sm sm:grid-cols-3">
      {CONTROLS.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <dt className="font-semibold text-accent">{k}</dt>
          <dd className="text-white/75">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Scoreboard({ hud, room }: { hud: HudState; room?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 backdrop-blur-md">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-4xl leading-none tracking-wide">Scoreboard</h2>
          {room && <span className="text-sm tracking-[0.2em] text-muted-foreground">ROOM {room}</span>}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
              <th className="py-1 font-medium">Ronin</th>
              <th className="py-1 text-right font-medium">Kills</th>
              <th className="py-1 text-right font-medium">Deaths</th>
            </tr>
          </thead>
          <tbody>
            {hud.players.map((p) => (
              <tr key={p.id} className={cn('border-t border-border/60', p.isYou && 'bg-white/5')}>
                <td className="py-1.5">
                  <span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: p.color }} />
                  <span className="font-semibold">{p.name}</span>
                  {p.isYou && <span className="ml-2 text-xs text-muted-foreground">you</span>}
                  {p.isBot && <span className="ml-2 text-xs text-muted-foreground">bot</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums">{p.kills}</td>
                <td className="py-1.5 text-right tabular-nums">{p.deaths}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Lobby(props: {
  ready: boolean
  name: string
  setName: (v: string) => void
  color: string
  setColor: (v: string) => void
  joinCode: string
  setJoinCode: (v: string) => void
  onStart: (mode: Mode) => void
}) {
  const { ready, name, setName, color, setColor, joinCode, setJoinCode, onStart } = props
  const codeValid = /^[A-Z0-9]{5}$/i.test(joinCode.trim())
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-gradient-to-r from-[#0d0a1c]/95 via-[#0d0a1c]/70 to-transparent">
      <div className="flex min-h-full max-w-content flex-col justify-center gap-8 px-6 py-10 sm:px-12">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-accent">Katana movement arena</p>
          <h1 className="font-display text-8xl leading-[0.85] tracking-wide text-white drop-shadow-[0_4px_12px_rgba(255,59,92,0.45)] sm:text-9xl">
            BLADE<span className="text-primary">HOP</span>
          </h1>
          <p className="mt-3 max-w-md text-lg text-white/80">
            Bunny hop, grapple and slash. No guns — just a blade and your momentum. The faster you move, the harder
            you hit.
          </p>
        </header>

        <div className="flex w-full max-w-md flex-col gap-5 rounded-xl border border-border bg-card p-5 backdrop-blur-md">
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Your name
            </label>
            <Input
              id="name"
              value={name}
              maxLength={16}
              placeholder="Ronin"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Scarf colour
            </legend>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={c === color}
                  onClick={() => setColor(c)}
                  className={cn(
                    'size-8 rounded-full border-2 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none',
                    c === color ? 'scale-110 border-white' : 'border-transparent hover:scale-105',
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </fieldset>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="lg" disabled={!ready} onClick={() => onStart('host')}>
              <Swords aria-hidden /> Host a room
            </Button>
            <Button size="lg" variant="secondary" disabled={!ready} onClick={() => onStart('practice')}>
              <Zap aria-hidden /> Practice vs bots
            </Button>
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (codeValid) onStart('join')
            }}
          >
            <Input
              aria-label="Room code"
              value={joinCode}
              maxLength={5}
              placeholder="ROOM CODE"
              className="font-semibold uppercase tracking-[0.3em]"
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
            <Button type="submit" variant="outline" disabled={!ready || !codeValid}>
              Join
            </Button>
          </form>
          {!ready && <p className="text-sm text-muted-foreground">Forging the arena…</p>}
        </div>

        <div className="max-w-xl">
          <ControlsGrid />
          <p className="mt-4 max-w-md text-sm text-white/60">
            Tip: hold Space and strafe in the air (hold A while turning left, D while turning right) to build speed.
            Slow? Hold F on any wall or pillar to grapple and get yanked back up to speed.
          </p>
        </div>
      </div>
    </div>
  )
}
