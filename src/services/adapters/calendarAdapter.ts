import type { MacroEvent } from '../../types/market';

interface ScheduledMacroEntry {
  isoUtc: string;
  refLabel: string;
  note?: string;
}

/**
 * Official FOMC rate decision dates (2:00 PM ET on Day 2) from federalreserve.gov
 * Includes revised 2027 FOMC schedule released Nov 12, 2026
 * (Oct 26-27, 2027 is a Monetary Policy Strategy Meeting with no rate decision).
 */
const FOMC_SCHEDULE: ScheduledMacroEntry[] = [
  {
    isoUtc: '2026-12-09T19:00:00Z',
    refLabel: 'Des 2026 · Dot Plot',
    note: 'Rapat FOMC 8-9 Des disertai Summary of Economic Projections (SEP/Dot Plot) & konferensi pers The Fed.',
  },
  {
    isoUtc: '2027-01-27T19:00:00Z',
    refLabel: 'Jan 2027',
    note: 'Keputusan suku bunga FOMC pertama 2027 (rapat 26-27 Jan) & konferensi pers Ketua The Fed.',
  },
  {
    isoUtc: '2027-03-17T18:00:00Z',
    refLabel: 'Mar 2027',
    note: 'Keputusan suku bunga FOMC (16-17 Mar) dan pembaruan proyeksi kebijakan moneter AS.',
  },
  {
    isoUtc: '2027-04-28T18:00:00Z',
    refLabel: 'Apr 2027',
    note: 'Keputusan suku bunga FOMC (27-28 Apr) & konferensi pers proyeksi likuiditas.',
  },
  {
    isoUtc: '2027-06-09T18:00:00Z',
    refLabel: 'Jun 2027',
    note: 'Keputusan suku bunga FOMC (8-9 Jun) & konferensi pers Ketua The Fed.',
  },
  {
    isoUtc: '2027-07-28T18:00:00Z',
    refLabel: 'Jul 2027',
    note: 'Keputusan suku bunga FOMC (27-28 Jul) & arah kebijakan suku bunga semester II.',
  },
  {
    isoUtc: '2027-09-15T18:00:00Z',
    refLabel: 'Sep 2027',
    note: 'Keputusan suku bunga FOMC (14-15 Sep) sebelum rapat strategi Oktober.',
  },
  {
    isoUtc: '2027-11-17T19:00:00Z',
    refLabel: 'Nov 2027',
    note: 'Keputusan suku bunga FOMC terakhir tahun 2027 (rapat 16-17 Nov, revisi jadwal The Fed).',
  },
  {
    isoUtc: '2028-01-26T19:00:00Z',
    refLabel: 'Jan 2028',
    note: 'Keputusan suku bunga FOMC pembuka 2028 (rapat 25-26 Jan).',
  },
];

/**
 * Official US CPI release schedule (8:30 AM ET) from bls.gov/schedule/news_release/cpi.htm
 */
const CPI_SCHEDULE: ScheduledMacroEntry[] = [
  { isoUtc: '2026-12-10T13:30:00Z', refLabel: 'Data Nov 2026' },
  { isoUtc: '2027-01-13T13:30:00Z', refLabel: 'Data Des 2026' },
  { isoUtc: '2027-02-11T13:30:00Z', refLabel: 'Data Jan 2027' },
  { isoUtc: '2027-03-10T13:30:00Z', refLabel: 'Data Feb 2027' },
  { isoUtc: '2027-04-13T12:30:00Z', refLabel: 'Data Mar 2027' },
  { isoUtc: '2027-05-12T12:30:00Z', refLabel: 'Data Apr 2027' },
  { isoUtc: '2027-06-10T12:30:00Z', refLabel: 'Data Mei 2027' },
  { isoUtc: '2027-07-14T12:30:00Z', refLabel: 'Data Jun 2027' },
  { isoUtc: '2027-08-11T12:30:00Z', refLabel: 'Data Jul 2027' },
  { isoUtc: '2027-09-14T12:30:00Z', refLabel: 'Data Agu 2027' },
  { isoUtc: '2027-10-14T12:30:00Z', refLabel: 'Data Sep 2027' },
  { isoUtc: '2027-11-10T13:30:00Z', refLabel: 'Data Okt 2027' },
  { isoUtc: '2027-12-10T13:30:00Z', refLabel: 'Data Nov 2027' },
];

/**
 * Official US Personal Income & Outlays / Core PCE schedule (8:30 AM ET)
 * from bea.gov/news/schedule & bea.gov/news/schedule/next-year
 */
const PCE_SCHEDULE: ScheduledMacroEntry[] = [
  { isoUtc: '2026-12-23T13:30:00Z', refLabel: 'Data Nov 2026' },
  { isoUtc: '2027-01-28T13:30:00Z', refLabel: 'Data Des 2026' },
  { isoUtc: '2027-02-25T13:30:00Z', refLabel: 'Data Jan 2027' },
  { isoUtc: '2027-03-31T12:30:00Z', refLabel: 'Data Feb 2027' },
  { isoUtc: '2027-04-29T12:30:00Z', refLabel: 'Data Mar 2027' },
  { isoUtc: '2027-05-27T12:30:00Z', refLabel: 'Data Apr 2027' },
  { isoUtc: '2027-06-25T12:30:00Z', refLabel: 'Data Mei 2027' },
  { isoUtc: '2027-07-29T12:30:00Z', refLabel: 'Data Jun 2027' },
  { isoUtc: '2027-08-25T12:30:00Z', refLabel: 'Data Jul 2027' },
  { isoUtc: '2027-09-30T12:30:00Z', refLabel: 'Data Agu 2027' },
  { isoUtc: '2027-10-28T12:30:00Z', refLabel: 'Data Sep 2027' },
  { isoUtc: '2027-11-24T13:30:00Z', refLabel: 'Data Okt 2027' },
  { isoUtc: '2027-12-22T13:30:00Z', refLabel: 'Data Nov 2027' },
];

function getNextScheduledEntry(
  schedule: ScheduledMacroEntry[],
  nowMs: number,
  fallbackDayOfMonth: number,
  fallbackHourUtc: number,
): { timestamp: number; refLabel: string; note?: string } {
  for (const item of schedule) {
    const ts = Date.parse(item.isoUtc);
    if (ts > nowMs) {
      return { timestamp: ts, refLabel: item.refLabel, note: item.note };
    }
  }
  // Safe rollover beyond 2027 if schedule table has not yet been extended
  const fallbackTs = getNextMonthlyUtc(fallbackDayOfMonth, fallbackHourUtc, nowMs);
  return { timestamp: fallbackTs, refLabel: 'Jadwal Rutin' };
}

/**
 * Computes the next upcoming monthly occurrence for a given UTC day-of-month and hour.
 */
function getNextMonthlyUtc(dayOfMonth: number, hourUtc: number, nowMs: number): number {
  const d = new Date(nowMs);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();

  const candidate = Date.UTC(year, month, dayOfMonth, hourUtc, 0, 0, 0);
  if (candidate > nowMs) {
    return candidate;
  }
  return Date.UTC(year, month + 1, dayOfMonth, hourUtc, 0, 0, 0);
}

/**
 * Returns upcoming official US Macro economic releases (Fed, BLS, BEA) and
 * recurring major Token Unlock schedules (Tokenomist), sorted chronologically.
 * Token unlock USD values are dynamically multiplied by live Binance prices in UI.
 */
export function getMacroAndUnlockEvents(nowMs = Date.now()): MacroEvent[] {
  const nextFomc = getNextScheduledEntry(FOMC_SCHEDULE, nowMs, 15, 19);
  const nextCpi = getNextScheduledEntry(CPI_SCHEDULE, nowMs, 12, 13);
  const nextPce = getNextScheduledEntry(PCE_SCHEDULE, nowMs, 26, 13);

  // Verified recurring monthly cliff unlocks from Tokenomist.ai (checked Nov 2026)
  const nextSuiUnlock = getNextMonthlyUtc(1, 0, nowMs); // 1st of month, 00:00 UTC
  const nextAptUnlock = getNextMonthlyUtc(11, 0, nowMs); // 11th of month, 00:00 UTC
  const nextArbUnlock = getNextMonthlyUtc(16, 13, nowMs); // 16th of month, 13:00 UTC

  const events: MacroEvent[] = [
    {
      id: 'macro-fomc',
      title: `FOMC Rate Decision (${nextFomc.refLabel})`,
      category: 'FOMC',
      impact: 'High',
      timestamp: nextFomc.timestamp,
      source: 'Federal Reserve',
      description:
        nextFomc.note ??
        'Keputusan suku bunga The Fed (14:00 ET) dan konferensi pers arah kebijakan likuiditas.',
    },
    {
      id: 'macro-cpi',
      title: `US CPI Inflation Release (${nextCpi.refLabel})`,
      category: 'CPI',
      impact: 'High',
      timestamp: nextCpi.timestamp,
      source: 'US BLS',
      description:
        'Rilis resmi inflasi konsumen AS (YoY & Core) pukul 08:30 ET. Volatilitas tinggi pada BTC & DXY.',
    },
    {
      id: 'macro-pce',
      title: `US Core PCE Price Index (${nextPce.refLabel})`,
      category: 'PCE',
      impact: 'High',
      timestamp: nextPce.timestamp,
      source: 'US BEA',
      description:
        'Personal Income & Outlays (08:30 ET) — indikator inflasi utama acuan The Fed untuk sentimen risk-on.',
    },
    {
      id: 'unlock-sui',
      title: 'SUI Monthly Cliff Unlock',
      category: 'Token Unlock',
      impact: 'Medium',
      symbol: 'SUIUSDT',
      unlockTokenAmount: 13_000_000,
      unlockUsdValue: 8_700_000, // fallback if live ticker not loaded
      unlockSupplyPercent: 0.31,
      timestamp: nextSuiUnlock,
      source: 'Tokenomist',
      description:
        '13.00M SUI dibuka tiap tanggal 1 untuk Community Reserve, Early Contributors & Mysten Labs Treasury.',
    },
    {
      id: 'unlock-apt',
      title: 'APT Monthly Supply Unlock',
      category: 'Token Unlock',
      impact: 'Medium',
      symbol: 'APTUSDT',
      unlockTokenAmount: 4_540_000,
      unlockUsdValue: 1_750_000, // fallback if live ticker not loaded
      unlockSupplyPercent: 0.51,
      timestamp: nextAptUnlock,
      source: 'Tokenomist',
      description:
        '4.54M APT dibuka tiap tanggal 11 untuk alokasi Community & Foundation (vesting investor selesai).',
    },
    {
      id: 'unlock-arb',
      title: 'ARB Monthly Cliff Unlock',
      category: 'Token Unlock',
      impact: 'High',
      symbol: 'ARBUSDT',
      unlockTokenAmount: 92_650_000,
      unlockUsdValue: 10_550_000, // fallback if live ticker not loaded
      unlockSupplyPercent: 1.5,
      timestamp: nextArbUnlock,
      source: 'Tokenomist',
      description:
        '92.65M ARB cliff unlock tiap tanggal 16 untuk Team, Future Team, Advisors & Investors.',
    },
  ];

  return events.sort((a, b) => a.timestamp - b.timestamp);
}
