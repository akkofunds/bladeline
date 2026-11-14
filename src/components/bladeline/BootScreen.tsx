import { useEffect, useRef, useState } from 'react'
import { ChevronsRight } from 'lucide-react'
import { INTRO_SECONDS, MAP_NAME, MAP_REGION } from '@/game/rules'
import { cn } from '@/lib/utils'
import { Logo } from './ui'

const TIPS = [
  'Hold jump and strafe into your turns to build speed.',
  'Damage scales with speed. A fast enough slash is a one-shot.',
  'Lost momentum? Grapple a pillar and get yanked back up to speed.',
  'Cyan pads launch you skyward. Orange strips push you forward.',
]

/**
 * Boot flow: logo + loading bar while the engine loads, then the map flyover
 * with a title card, then the lobby. Any key / click / tap skips the flyover.
 */
export function BootScreen({
  ready,
  skipIntro,
  onIntroStart,
  onDone,
}: {
  ready: boolean
  skipIntro: boolean
  onIntroStart: () => void
  onDone: () => void
}) {
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState<'loading' | 'intro'>('loading')
  const [tipIndex, setTipIndex] = useState(0)
  const done = useRef(false)
  const finish = useRef(onDone)
  useEffect(() => {
    finish.current = onDone
  }, [onDone])

  // rotate tips (a random pick here would differ between server and client render)
  useEffect(() => {
    const id = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 2500)
    return () => clearInterval(id)
  }, [])

  // fake-but-honest progress: creeps toward 90% until the engine reports ready
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => (ready ? 100 : Math.min(90, p + (90 - p) * 0.08 + 0.4)))
    }, 50)
    return () => clearInterval(id)
  }, [ready])

  useEffect(() => {
    if (!ready || progress < 100 || stage !== 'loading') return
    const id = setTimeout(() => {
      if (skipIntro) {
        done.current = true
        finish.current()
      } else {
        setStage('intro')
        onIntroStart()
      }
    }, 350)
    return () => clearTimeout(id)
  }, [ready, progress, stage, skipIntro, onIntroStart])

  useEffect(() => {
    if (stage !== 'intro') return
    const end = () => {
      if (done.current) return
      done.current = true
      finish.current()
    }
    const id = setTimeout(end, INTRO_SECONDS * 1000 - 200)
    window.addEventListener('keydown', end)
    return () => {
      clearTimeout(id)
      window.removeEventListener('keydown', end)
    }
  }, [stage])

  if (stage === 'loading') {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-[oklch(0.11_0.02_255)] px-6">
        <div className="bl-scanlines pointer-events-none absolute inset-0" />
        <div className="animate-rise">
          <Logo size="xl" />
        </div>
        <div className="w-full max-w-sm">
          <div className="h-1 overflow-hidden bg-white/10">
            <div className="h-full bg-primary transition-[width] duration-100" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <span>{ready ? 'Arena ready' : 'Forging the arena'}</span>
            <span className="tabular-nums">{Math.round(progress)}%</span>
          </div>
        </div>
        <p className="max-w-sm text-center text-sm text-white/55">{TIPS[tipIndex]}</p>
      </div>
    )
  }

  return (
    <div
      className="absolute inset-0 z-50 cursor-pointer"
      onClick={() => {
        if (done.current) return
        done.current = true
        finish.current()
      }}
    >
      {/* letterbox bars */}
      <div className="absolute inset-x-0 top-0 h-[9vh] bg-black" />
      <div className="absolute inset-x-0 bottom-0 h-[9vh] bg-black" />
      <div className="safe-pad absolute bottom-[12vh] left-0 flex flex-col gap-1 sm:left-6">
        <span className="animate-wipe clip-tag w-fit bg-primary px-3 py-0.5 text-xs font-semibold uppercase tracking-[0.3em] text-primary-foreground">
          Map
        </span>
        <h2
          className="animate-wipe font-display text-6xl leading-[0.85] tracking-[0.04em] text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)] sm:text-8xl"
          style={{ animationDelay: '0.15s' }}
        >
          {MAP_NAME.toUpperCase()}
        </h2>
        <p
          className="animate-rise text-sm uppercase tracking-[0.35em] text-white/75"
          style={{ animationDelay: '0.5s' }}
        >
          {MAP_REGION}
        </p>
      </div>
      <button
        type="button"
        className={cn(
          'safe-pad absolute right-2 top-[10vh] flex items-center gap-1 text-sm uppercase tracking-[0.25em] text-white/70 hover:text-white',
        )}
      >
        Skip <ChevronsRight className="size-4" aria-hidden />
      </button>
    </div>
  )
}
