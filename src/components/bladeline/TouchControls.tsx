import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { Camera, ListOrdered, MessageSquare, Pause } from 'lucide-react'
import type { Game } from '@/game/Game'
import type { HudState } from '@/game/types'
import { cn } from '@/lib/utils'

const STICK_R = 56

/**
 * Mobile controls: floating move stick on the left, drag-to-look on the right,
 * and action buttons. Dragging a thumb on Jump/Slash/Hook also turns the camera,
 * so you can hold jump and steer with one thumb (that's how you bhop on a phone).
 */
export function TouchControls({
  game,
  hud,
  onChat,
  onScores,
  onPause,
}: {
  game: Game | null
  hud: HudState
  onChat: () => void
  onScores: () => void
  onPause: () => void
}) {
  const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null)
  const track = useRef({ stickId: null as number | null, looks: new Map<number, { x: number; y: number }>() })

  const stickDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (track.current.stickId !== null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    track.current.stickId = e.pointerId
    setStick({ ox: e.clientX, oy: e.clientY, x: 0, y: 0 })
  }
  const stickMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== track.current.stickId || !stick) return
    let dx = e.clientX - stick.ox
    let dy = e.clientY - stick.oy
    const len = Math.hypot(dx, dy)
    if (len > STICK_R) {
      dx = (dx / len) * STICK_R
      dy = (dy / len) * STICK_R
    }
    setStick({ ...stick, x: dx, y: dy })
    // small dead zone, then full deflection past ~70% so running is easy
    const nx = Math.abs(dx) < 6 ? 0 : Math.max(-1, Math.min(1, dx / (STICK_R * 0.7)))
    const ny = Math.abs(dy) < 6 ? 0 : Math.max(-1, Math.min(1, -dy / (STICK_R * 0.7)))
    game?.touchMove(nx, ny)
  }
  const stickUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== track.current.stickId) return
    track.current.stickId = null
    setStick(null)
    game?.touchMove(0, 0)
  }

  const lookDown = (e: RPointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    track.current.looks.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  const lookMove = (e: RPointerEvent<HTMLElement>) => {
    const last = track.current.looks.get(e.pointerId)
    if (!last) return
    game?.touchLook(e.clientX - last.x, e.clientY - last.y)
    track.current.looks.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  const lookUp = (e: RPointerEvent<HTMLElement>) => {
    track.current.looks.delete(e.pointerId)
  }

  const look = { game, onLookDown: lookDown, onLookMove: lookMove, onLookUp: lookUp }

  return (
    <div className="absolute inset-0 z-20 touch-none select-none [-webkit-touch-callout:none]">
      {/* move zone */}
      <div
        className="absolute bottom-0 left-0 top-16 w-[45%]"
        onPointerDown={stickDown}
        onPointerMove={stickMove}
        onPointerUp={stickUp}
        onPointerCancel={stickUp}
      >
        {stick ? (
          <div
            className="pointer-events-none absolute size-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30 bg-black/20"
            style={{ left: stick.ox, top: stick.oy - 64 }}
          >
            <div
              className="absolute left-1/2 top-1/2 size-12 rounded-full bg-white/70 shadow-lg"
              style={{ transform: `translate(calc(-50% + ${stick.x}px), calc(-50% + ${stick.y}px))` }}
            />
          </div>
        ) : (
          <div className="pointer-events-none absolute bottom-[max(2.5rem,env(safe-area-inset-bottom))] left-[max(2.5rem,env(safe-area-inset-left))] grid size-28 place-items-center rounded-full border-2 border-dashed border-white/20">
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">Move</span>
          </div>
        )}
      </div>

      {/* look zone */}
      <div
        className="absolute bottom-0 right-0 top-16 w-[55%]"
        onPointerDown={lookDown}
        onPointerMove={lookMove}
        onPointerUp={lookUp}
        onPointerCancel={lookUp}
      />

      {/* top-right utility buttons */}
      <div className="absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(3.5rem,env(safe-area-inset-top))] flex gap-2">
        <SmallBtn label="Scoreboard" onClick={onScores}>
          <ListOrdered />
        </SmallBtn>
        <SmallBtn label="Chat" onClick={onChat}>
          <MessageSquare />
        </SmallBtn>
        <SmallBtn label="Toggle camera" onClick={() => game?.toggleCamera()} active={hud.thirdPerson}>
          <Camera />
        </SmallBtn>
        <SmallBtn label="Pause" onClick={onPause}>
          <Pause />
        </SmallBtn>
      </div>

      {/* action cluster */}
      <div className="pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] h-48 w-56">
        <HoldBtn
          btn="slash"
          {...look}
          className="bottom-16 right-0 size-20 border-primary bg-[oklch(0.65_0.22_20/0.45)]"
          ready={hud.slashReady}
          label="Slash"
        />
        <HoldBtn btn="jump" {...look} className="bottom-0 right-20 size-[4.5rem]" ready={1} label="Jump" />
        <ActionBtn
          onPointerDown={(e) => {
            e.stopPropagation()
            game?.touchDash()
          }}
          className="bottom-[8.5rem] right-[5.25rem] size-14"
          ready={hud.dashReady}
          label="Dash"
        />
        <HoldBtn
          btn="grapple"
          {...look}
          className={cn('bottom-[4.5rem] right-[6.25rem] size-14', hud.grappling && 'border-accent')}
          ready={hud.grappleReady}
          label="Hook"
        />
      </div>
    </div>
  )
}

type PointerFn = (e: RPointerEvent<HTMLElement>) => void

/** A hold button that also steers the camera while the thumb drags across it. */
function HoldBtn({
  btn,
  game,
  onLookDown,
  onLookMove,
  onLookUp,
  ...rest
}: {
  btn: 'jump' | 'slash' | 'grapple'
  game: Game | null
  onLookDown: PointerFn
  onLookMove: PointerFn
  onLookUp: PointerFn
  className?: string
  ready: number
  label: string
}) {
  const release = (e: RPointerEvent<HTMLButtonElement>) => {
    onLookUp(e)
    game?.touchButton(btn, false)
  }
  return (
    <ActionBtn
      {...rest}
      onPointerDown={(e) => {
        e.stopPropagation()
        onLookDown(e)
        game?.touchButton(btn, true)
      }}
      onPointerMove={onLookMove}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}

function SmallBtn({
  label,
  onClick,
  children,
  active,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  active?: boolean
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={cn(
        'grid size-10 place-items-center rounded-md border border-white/20 bg-black/45 text-white/85 active:bg-white/20 [&_svg]:size-5',
        active && 'border-accent text-accent',
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  )
}

function ActionBtn({
  className,
  ready,
  label,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { ready: number; label: string }) {
  const r = Math.max(0, Math.min(1, ready))
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'pointer-events-auto absolute grid touch-none place-items-center overflow-hidden rounded-full border-2 border-white/35 bg-black/40 font-display text-lg uppercase tracking-wider text-white active:scale-95 active:bg-white/25',
        className,
      )}
    >
      {r < 1 && <span className="absolute inset-x-0 bottom-0 bg-black/50" style={{ height: `${(1 - r) * 100}%` }} />}
      <span className="relative pt-0.5">{label}</span>
    </button>
  )
}
