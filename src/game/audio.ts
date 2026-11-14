/** Tiny WebAudio synth for game sounds — no audio files needed. */
export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private wind: { gain: GainNode } | null = null
  volume = 0.5

  private ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  private noise(duration: number) {
    const ctx = this.ensure()
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    return src
  }

  private env(gain: GainNode, attack: number, decay: number, peak: number) {
    const t = this.ctx!.currentTime
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  }

  slash(volume = 1) {
    const ctx = this.ensure()
    const src = this.noise(0.3)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 2
    bp.frequency.setValueAtTime(900, ctx.currentTime)
    bp.frequency.exponentialRampToValueAtTime(5200, ctx.currentTime + 0.18)
    const g = ctx.createGain()
    this.env(g, 0.02, 0.22, 0.6 * volume)
    src.connect(bp).connect(g).connect(this.master!)
    src.start()
  }

  hit() {
    const ctx = this.ensure()
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(1400, ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(380, ctx.currentTime + 0.12)
    const g = ctx.createGain()
    this.env(g, 0.005, 0.16, 0.5)
    o.connect(g).connect(this.master!)
    o.start()
    o.stop(ctx.currentTime + 0.2)
    const src = this.noise(0.08)
    const g2 = ctx.createGain()
    this.env(g2, 0.002, 0.07, 0.4)
    src.connect(g2).connect(this.master!)
    src.start()
  }

  hurt() {
    const ctx = this.ensure()
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(220, ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.2)
    const g = ctx.createGain()
    this.env(g, 0.005, 0.2, 0.35)
    o.connect(g).connect(this.master!)
    o.start()
    o.stop(ctx.currentTime + 0.25)
  }

  tone(from: number, to: number, dur: number, vol = 0.25, type: OscillatorType = 'sine') {
    const ctx = this.ensure()
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(from, ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + dur)
    const g = ctx.createGain()
    this.env(g, 0.005, dur, vol)
    o.connect(g).connect(this.master!)
    o.start()
    o.stop(ctx.currentTime + dur + 0.05)
  }

  jump() {
    this.tone(180, 320, 0.08, 0.08)
  }
  pad() {
    this.tone(300, 1200, 0.35, 0.25, 'square')
  }
  boost() {
    this.tone(400, 900, 0.25, 0.2, 'sawtooth')
  }
  grapple() {
    this.tone(1800, 600, 0.15, 0.15, 'square')
  }
  kill() {
    this.tone(660, 1320, 0.25, 0.3, 'triangle')
  }

  /** continuous wind that rises with speed */
  setWind(speed: number) {
    const ctx = this.ctx
    if (!ctx) return
    if (!this.wind) {
      const src = this.noise(2)
      src.loop = true
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 700
      const gain = ctx.createGain()
      gain.gain.value = 0
      src.connect(lp).connect(gain).connect(this.master!)
      src.start()
      this.wind = { gain }
    }
    const target = Math.min(0.35, Math.max(0, (speed - 10) / 60))
    this.wind.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.15)
  }

  close() {
    void this.ctx?.close()
  }
}
