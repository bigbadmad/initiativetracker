import { describe, it, expect } from 'vitest';
import { JEWELRY_TIERS, jewelryFromTier, randomJewelry, calculateTreasureXP } from './loot.ts';

function gp(desc: string): number {
  const m = desc.match(/\(([\d,]+) gp\)$/);
  if (!m) throw new Error(`no value in "${desc}"`);
  return parseInt(m[1].replace(/,/g, ''), 10);
}

const CHEAP_METALS = ['Brass', 'Bronze', 'Copper'];

describe('jewelry', () => {
  it('tiers cover the whole d100 range in order', () => {
    const bounds = JEWELRY_TIERS.map((t) => t.upTo);
    expect(bounds).toEqual([...bounds].sort((a, b) => a - b));
    expect(bounds[bounds.length - 1]).toBe(100);
  });

  it('every tier rolls values inside its stated band', () => {
    for (const tier of JEWELRY_TIERS) {
      for (let i = 0; i < 500; i++) {
        const v = gp(jewelryFromTier(tier));
        expect(v).toBeGreaterThanOrEqual(tier.min);
        expect(v).toBeLessThanOrEqual(tier.max);
      }
    }
  });

  it('cheap metals only appear in tiers capped at 100 gp', () => {
    for (const tier of JEWELRY_TIERS) {
      if (tier.materials.some((m) => CHEAP_METALS.includes(m))) expect(tier.max).toBeLessThanOrEqual(100);
    }
  });

  it('gem-set pieces are never cheap', () => {
    for (const tier of JEWELRY_TIERS) {
      if (tier.details.some((d) => d.startsWith('set with'))) expect(tier.min).toBeGreaterThanOrEqual(1000);
    }
  });

  it('a random brass, bronze or copper piece is never worth more than 100 gp', () => {
    for (let i = 0; i < 5000; i++) {
      const j = randomJewelry();
      if (CHEAP_METALS.some((m) => j.startsWith(m + ' '))) expect(gp(j)).toBeLessThanOrEqual(100);
    }
  });

  it('keeps the average piece moderate', () => {
    let total = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) total += gp(randomJewelry());
    const mean = total / n;
    expect(mean).toBeGreaterThan(1000);
    expect(mean).toBeLessThan(1550);
  });

  it('counts jewelry value toward treasure XP, including thousands separators', () => {
    expect(calculateTreasureXP(0, 0, 0, 0, 0, [], ['Platinum ring set with diamonds (12,000 gp)', 'Brass pin (40 gp)'], [])).toBe(12040);
  });
});
