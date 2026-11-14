import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import type { Game } from '@/game/Game'
import type { MatchMode } from '@/game/rules'
import type { ChatLine, GameMode, HudState, NetStatus } from '@/game/types'
import { BootScreen } from './BootScreen'
import { Hud, type FeedLine } from './Hud'
import { Lobby, type QueueState } from './Lobby'
import { MatchLoading } from './MatchLoading'
import { SettingsPanel } from './SettingsPanel'
import { TouchControls } from './TouchControls'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  loadStats,
  resolveQuality,
  resolveTouch,
  saveSettings,
  saveStats,
  type Settings,
  type Stats,
} from './settings'

type Screen = 'boot' | 'lobby' | 'game'
type Session = { kind: Exclude<GameMode, 'menu'>; mode: MatchMode }

/** Brief loading card shown for matches without a countdown (online rooms, training). */
const LOADING_MS = 2200

export function Bladeline() {
  const mountRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const topSpeedRef = useRef(0)
  const queueTimers = useRef<number[]>([])
  const sessionKind = useRef<Session['kind'] | null>(null)
  const [game, setGame] = useState<Game | null>(null)

  const [ready, setReady] = useState(false)
  const [screen, setScreen] = useState<Screen>('boot')
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [stats, setStats] = useState<Stats>({ matches: 0, wins: 0, kills: 0, deaths: 0, topSpeed: 0 })
  const [showSettings, setShowSettings] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [queue, setQueue] = useState<QueueState | null>(null)
  const [status, setStatus] = useState<NetStatus>({ kind: 'idle' })
  const [hud, setHud] = useState<HudState | null>(null)
  const [chat, setChat] = useState<ChatLine[]>([])
  const [feed, setFeed] = useState<FeedLine[]>([])
  const [banner, setBanner] = useState<FeedLine | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatText, setChatText] = useState('')
  const [showScores, setShowScores] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [lastChatAt, setLastChatAt] = useState(0)
  const [loadingUntil, setLoadingUntil] = useState(0)
  const [clock, setClock] = useState(0)

  const touch = resolveTouch(settings.controls)

  // boot the engine (client only: three.js and PeerJS need the browser)
  useEffect(() => {
    let disposed = false
    void import('@/game/Game').then(({ Game }) => {
      if (disposed || !mountRef.current) return
      const s = loadSettings()
      setSettings(s)
      setSettingsLoaded(true)
      setStats(loadStats())
      const hash = window.location.hash.replace('#', '').toUpperCase()
      if (/^[A-Z0-9]{5}$/.test(hash)) setJoinCode(hash)
      const engine = new Game(
        mountRef.current,
        {
          onHud: (h) => {
            if (h.speed > topSpeedRef.current) topSpeedRef.current = h.speed
            setHud(h)
          },
          onChat: (line) => {
            setChat((c) => [...c.slice(-59), line])
            setLastChatAt(performance.now())
          },
          onKill: (line) => {
            const l = { ...line, at: performance.now() }
            setFeed((f) => [...f.slice(-5), l])
            if (line.byYou) setBanner(l)
          },
          onStatus: (st) => {
            setStatus(st)
            if (st.kind !== 'online') return
            // online rooms have no countdown, so show the loading card briefly once connected
            if (sessionKind.current && sessionKind.current !== 'local') setLoadingUntil(performance.now() + LOADING_MS)
            if (st.room) history.replaceState(null, '', `#${st.room}`)
          },
          onRequestChat: () => {
            setChatOpen(true)
            gameRef.current?.setTyping(true)
            setTimeout(() => chatInputRef.current?.focus(), 0)
          },
          onMatchEnd: (r) => {
            if (r.mode === 'training') return
            setStats((st) => {
              const next = {
                matches: st.matches + 1,
                wins: st.wins + (r.won ? 1 : 0),
                kills: st.kills + r.kills,
                deaths: st.deaths + r.deaths,
                topSpeed: Math.max(st.topSpeed, topSpeedRef.current),
              }
              saveStats(next)
              return next
            })
          },
        },
        { quality: resolveQuality(s.quality) },
      )
      gameRef.current = engine
      // dev-only handle for debugging in the browser console / automated tests
      if (import.meta.env.DEV) (window as unknown as { __bladeline?: Game }).__bladeline = engine
      setGame(engine)
      setReady(true)
    })
    return () => {
      disposed = true
      gameRef.current?.dispose()
      gameRef.current = null
    }
  }, [])

  // push settings into the engine and persist them
  useEffect(() => {
    const g = gameRef.current
    if (g) {
      g.sensitivity = settings.sens / 1000
      g.touchLookScale = settings.touchSens
      g.fullscreenOnPlay = settings.fullscreen
      g.setVolume(settings.volume)
      g.setQuality(resolveQuality(settings.quality))
      g.setResolution(settings.resolution)
      g.setTouchMode(resolveTouch(settings.controls))
    }
    if (settingsLoaded) saveSettings(settings)
  }, [settings, ready, settingsLoaded])

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), [])

  // ticking clock for timed UI (feed expiry, loading card)
  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now()
      setClock(now)
      setFeed((f) => (f.some((l) => now - l.at > 6000) ? f.filter((l) => now - l.at < 6000) : f))
    }, 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!banner) return
    const id = setTimeout(() => setBanner(null), 1800)
    return () => clearTimeout(id)
  }, [banner])

  // Tab scoreboard
  useEffect(() => {
    if (screen !== 'game') return
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
  }, [screen])

  const clearQueueTimers = () => {
    queueTimers.current.forEach((t) => clearTimeout(t))
    queueTimers.current = []
  }

  const beginMatch = useCallback(
    (kind: Session['kind'], mode: MatchMode) => {
      const game = gameRef.current
      if (!game) return
      clearQueueTimers()
      setQueue(null)
      setChat([])
      setFeed([])
      setBanner(null)
      setShowScores(false)
      topSpeedRef.current = 0
      setSession({ kind, mode })
      sessionKind.current = kind
      setScreen('game')
      if (kind === 'local' && mode === 'training') setLoadingUntil(performance.now() + LOADING_MS)
      else setLoadingUntil(0)
      void game.start(kind, {
        name: settings.name.trim() || 'Ronin',
        color: settings.color,
        room: joinCode.trim().toUpperCase(),
        match: mode,
      })
      if (resolveTouch(settings.controls)) game.requestLock()
    },
    [settings, joinCode],
  )

  const goFullscreen = () => {
    if (!resolveTouch(settings.controls)) return
    try {
      const el = document.documentElement
      if (!document.fullscreenElement && el.requestFullscreen) {
        void el
          .requestFullscreen({ navigationUI: 'hide' })
          .then(() => (window.screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape'))
          .catch(() => {})
      }
    } catch {
      /* not supported (iPhone Safari) */
    }
  }

  const onQueue = (mode: MatchMode) => {
    const game = gameRef.current
    if (!game) return
    game.unlockAudio()
    goFullscreen()
    if (mode === 'training') {
      game.uiSound('click')
      beginMatch('local', mode)
      return
    }
    game.uiSound('queue')
    const startedAt = performance.now()
    setQueue({ mode, startedAt, found: false })
    const wait = 1800 + Math.random() * 2200
    queueTimers.current.push(
      window.setTimeout(() => {
        gameRef.current?.uiSound('found')
        setQueue({ mode, startedAt, found: true })
      }, wait),
      window.setTimeout(() => beginMatch('local', mode), wait + 1500),
    )
  }

  const cancelQueue = () => {
    clearQueueTimers()
    setQueue(null)
    gameRef.current?.uiSound('click')
  }

  const leave = useCallback(() => {
    gameRef.current?.leave()
    setSession(null)
    sessionKind.current = null
    setScreen('lobby')
    setChatOpen(false)
    setShowScores(false)
    gameRef.current?.setTyping(false)
    if (window.location.hash) history.replaceState(null, '', window.location.pathname)
  }, [])

  const closeChat = (send: boolean) => {
    if (send && chatText.trim()) gameRef.current?.sendChat(chatText)
    setChatText('')
    setChatOpen(false)
    gameRef.current?.setTyping(false)
    gameRef.current?.requestLock()
  }

  const openChat = () => {
    setChatOpen(true)
    gameRef.current?.setTyping(true)
    setTimeout(() => chatInputRef.current?.focus(), 0)
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

  const ui = useCallback((kind: 'hover' | 'click') => {
    if (kind === 'click') gameRef.current?.unlockAudio()
    gameRef.current?.uiSound(kind)
  }, [])

  const onIntroStart = useCallback(() => gameRef.current?.playIntro(), [])
  const onBootDone = useCallback(() => {
    gameRef.current?.skipIntro()
    setScreen('lobby')
  }, [])

  const inGame = screen === 'game' && hud !== null
  const showLoading =
    inGame && status.kind === 'online' && (hud.match.phase === 'countdown' || clock < loadingUntil)
  const chatVisible = chatOpen || clock - lastChatAt < 8000
  const ended = hud?.match.phase === 'ended'

  return (
    <div className="fixed inset-0 overflow-hidden bg-background text-foreground select-none">
      <div
        ref={mountRef}
        className="absolute inset-0 touch-none"
        onClick={() => {
          if (screen === 'game' && !chatOpen && !touch) gameRef.current?.requestLock()
        }}
      />

      {screen === 'boot' && (
        <BootScreen
          ready={ready && settingsLoaded}
          skipIntro={settings.skipIntro}
          onIntroStart={onIntroStart}
          onDone={onBootDone}
        />
      )}

      {screen === 'lobby' && (
        <Lobby
          ready={ready}
          settings={settings}
          update={update}
          stats={stats}
          queue={queue}
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          onQueue={onQueue}
          onCancelQueue={cancelQueue}
          onHost={(mode) => {
            gameRef.current?.unlockAudio()
            goFullscreen()
            beginMatch('host', mode)
          }}
          onJoin={() => {
            gameRef.current?.unlockAudio()
            goFullscreen()
            beginMatch('join', 'ffa')
          }}
          onOpenSettings={() => setShowSettings(true)}
          onUi={ui}
        />
      )}

      {inGame && (
        <>
          {touch && hud.locked && !chatOpen && !ended && !showLoading && status.kind === 'online' && (
            <TouchControls
              game={game}
              hud={hud}
              onChat={openChat}
              onScores={() => setShowScores((v) => !v)}
              onPause={() => {
                gameRef.current?.pause()
                setShowScores(false)
              }}
            />
          )}
          <Hud
            hud={hud}
            status={status}
            touch={touch}
            showFps={settings.showFps}
            feed={feed}
            banner={banner}
            chat={chat}
            chatOpen={chatOpen}
            chatVisible={chatVisible}
            chatText={chatText}
            setChatText={setChatText}
            closeChat={closeChat}
            chatInputRef={chatInputRef}
            showScores={showScores}
            sens={settings.sens}
            setSens={(sens) => update({ sens })}
            onResume={() => gameRef.current?.requestLock()}
            onLeave={leave}
            onCopyInvite={copyInvite}
            onRematch={() => {
              topSpeedRef.current = 0
              gameRef.current?.restartMatch()
              gameRef.current?.requestLock()
            }}
            onOpenSettings={() => setShowSettings(true)}
            joinCode={joinCode}
            hosting={session?.kind === 'host'}
          />
          {showLoading && <MatchLoading hud={hud} />}
          {touch && (
            <div className="pointer-events-none absolute inset-x-0 bottom-24 hidden justify-center portrait:flex">
              <span className="flex items-center gap-2 bg-black/60 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-white/80">
                <RotateCw className="size-4" aria-hidden /> Rotate for the best view
              </span>
            </div>
          )}
        </>
      )}

      {showSettings && <SettingsPanel settings={settings} update={update} onClose={() => setShowSettings(false)} />}
    </div>
  )
}
