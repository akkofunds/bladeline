import { describe, expect, it } from 'vitest'
import { formatClock, MODES, slashDamage } from './rules'

describe('rules', () => {
  it('scales slash damage with speed and caps at a one-shot', () => {
    expect(slashDamage(0)).toBe(26)
    expect(slashDamage(20)).toBe(60)
    expect(slashDamage(500)).toBe(100)
  })

  it('formats the match clock', () => {
    expect(formatClock(300)).toBe('5:00')
    expect(formatClock(59.2)).toBe('1:00')
    expect(formatClock(-3)).toBe('0:00')
  })

  it('fills team modes with full teams', () => {
    for (const m of Object.values(MODES)) {
      if (m.teamSize) expect(m.botMatchSize).toBe(m.teamSize * 2)
      expect(m.maxPlayers).toBeGreaterThanOrEqual(1)
    }
  })
})
