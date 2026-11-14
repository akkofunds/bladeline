import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { detectQuality, type ControlScheme, type QualitySetting, type Settings } from './settings'
import { AngledButton, SectionLabel } from './ui'

export function SettingsPanel({
  settings,
  update,
  onClose,
}: {
  settings: Settings
  update: (p: Partial<Settings>) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const auto = detectQuality()
  return (
    <div
      className="safe-pad absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="clip-panel animate-rise max-h-full w-full max-w-lg overflow-y-auto border border-white/15 bg-[oklch(0.14_0.025_255)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="settings-title" className="font-display text-4xl leading-none tracking-wide">
            SETTINGS
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-10 place-items-center border border-white/15 hover:bg-white/10"
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Close settings</span>
          </button>
        </div>

        <div className="flex flex-col gap-5">
          <Group label="Graphics quality">
            <Segmented<QualitySetting>
              value={settings.quality}
              onChange={(quality) => update({ quality })}
              options={[
                ['auto', `Auto (${auto})`],
                ['low', 'Low'],
                ['medium', 'Medium'],
                ['high', 'High'],
              ]}
            />
            <p className="text-xs text-muted-foreground">
              Low turns off real-time shadows and renders at a lower resolution. Best for Chromebooks and phones.
              Resolution also drops automatically if the frame rate dips.
            </p>
          </Group>

          <Toggle label="Show FPS counter" checked={settings.showFps} onChange={(showFps) => update({ showFps })} />

          <Group label="Controls">
            <Segmented<ControlScheme>
              value={settings.controls}
              onChange={(controls) => update({ controls })}
              options={[
                ['auto', 'Auto'],
                ['touch', 'Touch'],
                ['mouse', 'Mouse + keys'],
              ]}
            />
          </Group>

          <Slider
            id="set-sens"
            label="Mouse sensitivity"
            min={0.5}
            max={6}
            step={0.1}
            value={settings.sens}
            onChange={(sens) => update({ sens })}
          />
          <Slider
            id="set-touch"
            label="Touch look sensitivity"
            min={0.5}
            max={4}
            step={0.1}
            value={settings.touchSens}
            onChange={(touchSens) => update({ touchSens })}
          />
          <Slider
            id="set-vol"
            label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(volume) => update({ volume })}
          />
          <Toggle
            label="Skip the map intro on startup"
            checked={settings.skipIntro}
            onChange={(skipIntro) => update({ skipIntro })}
          />
        </div>

        <AngledButton className="mt-6 w-full" onClick={onClose}>
          Done
        </AngledButton>
      </div>
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: [T, string][]
}) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-1" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'min-h-10 border px-2 text-sm font-semibold capitalize',
            value === v ? 'border-primary bg-[oklch(0.65_0.22_20/0.22)]' : 'border-white/10 bg-black/30 hover:bg-white/10',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Slider(props: {
  id: string
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between">
        <label htmlFor={props.id} className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          {props.label}
        </label>
        <span className="text-sm tabular-nums">{props.format ? props.format(props.value) : props.value.toFixed(1)}</span>
      </div>
      <input
        id={props.id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="h-6 w-full accent-[var(--primary)]"
      />
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-[var(--primary)]"
      />
    </label>
  )
}
