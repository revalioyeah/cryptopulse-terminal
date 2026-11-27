import type {
  Candle,
  Coin,
  FearGreedData,
  GlobalMarketData,
  SectorName,
  Timeframe,
} from '../../types';

export interface CoinMetadata {
  symbol: string;
  baseAsset: string;
  name: string;
  sector: SectorName;
  basePrice: number;
  baseChange24h: number;
  baseQuoteVol: number;
  marketCapRank: number;
}

export const CURATED_COINS: CoinMetadata[] = [
  // Layer 1
  { symbol: 'BTCUSDT', baseAsset: 'BTC', name: 'Bitcoin', sector: 'Layer 1', basePrice: 94850, baseChange24h: 2.84, baseQuoteVol: 2_840_000_000, marketCapRank: 1 },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', name: 'Ethereum', sector: 'Layer 1', basePrice: 3412.5, baseChange24h: 3.62, baseQuoteVol: 1_920_000_000, marketCapRank: 2 },
  { symbol: 'SOLUSDT', baseAsset: 'SOL', name: 'Solana', sector: 'Layer 1', basePrice: 218.4, baseChange24h: 6.18, baseQuoteVol: 1_180_000_000, marketCapRank: 4 },
  { symbol: 'BNBUSDT', baseAsset: 'BNB', name: 'BNB', sector: 'Layer 1', basePrice: 668.2, baseChange24h: 1.45, baseQuoteVol: 480_000_000, marketCapRank: 5 },
  { symbol: 'XRPUSDT', baseAsset: 'XRP', name: 'XRP', sector: 'Layer 1', basePrice: 2.34, baseChange24h: -1.82, baseQuoteVol: 790_000_000, marketCapRank: 3 },
  { symbol: 'SUIUSDT', baseAsset: 'SUI', name: 'Sui', sector: 'Layer 1', basePrice: 3.88, baseChange24h: 8.42, baseQuoteVol: 615_000_000, marketCapRank: 14 },
  { symbol: 'AVAXUSDT', baseAsset: 'AVAX', name: 'Avalanche', sector: 'Layer 1', basePrice: 41.25, baseChange24h: 4.15, baseQuoteVol: 340_000_000, marketCapRank: 12 },
  { symbol: 'ADAUSDT', baseAsset: 'ADA', name: 'Cardano', sector: 'Layer 1', basePrice: 0.945, baseChange24h: -2.41, baseQuoteVol: 410_000_000, marketCapRank: 9 },
  { symbol: 'APTUSDT', baseAsset: 'APT', name: 'Aptos', sector: 'Layer 1', basePrice: 11.72, baseChange24h: 3.12, baseQuoteVol: 210_000_000, marketCapRank: 24 },
  { symbol: 'NEARUSDT', baseAsset: 'NEAR', name: 'NEAR Protocol', sector: 'Layer 1', basePrice: 6.38, baseChange24h: 5.04, baseQuoteVol: 285_000_000, marketCapRank: 19 },
  { symbol: 'TONUSDT', baseAsset: 'TON', name: 'Toncoin', sector: 'Layer 1', basePrice: 5.84, baseChange24h: -0.95, baseQuoteVol: 195_000_000, marketCapRank: 11 },
  { symbol: 'SEIUSDT', baseAsset: 'SEI', name: 'Sei', sector: 'Layer 1', basePrice: 0.562, baseChange24h: 7.21, baseQuoteVol: 185_000_000, marketCapRank: 46 },

  // AI
  { symbol: 'TAOUSDT', baseAsset: 'TAO', name: 'Bittensor', sector: 'AI', basePrice: 548.6, baseChange24h: 9.74, baseQuoteVol: 295_000_000, marketCapRank: 23 },
  { symbol: 'RENDERUSDT', baseAsset: 'RENDER', name: 'Render', sector: 'AI', basePrice: 8.42, baseChange24h: 7.65, baseQuoteVol: 268_000_000, marketCapRank: 27 },
  { symbol: 'FETUSDT', baseAsset: 'FET', name: 'Artificial Superintelligence', sector: 'AI', basePrice: 1.64, baseChange24h: 6.22, baseQuoteVol: 245_000_000, marketCapRank: 30 },
  { symbol: 'WLDUSDT', baseAsset: 'WLD', name: 'Worldcoin', sector: 'AI', basePrice: 2.58, baseChange24h: -3.65, baseQuoteVol: 215_000_000, marketCapRank: 42 },
  { symbol: 'ARKMUSDT', baseAsset: 'ARKM', name: 'Arkham', sector: 'AI', basePrice: 2.14, baseChange24h: 5.48, baseQuoteVol: 142_000_000, marketCapRank: 68 },
  { symbol: 'VIRTUALUSDT', baseAsset: 'VIRTUAL', name: 'Virtuals Protocol', sector: 'AI', basePrice: 3.12, baseChange24h: 11.4, baseQuoteVol: 188_000_000, marketCapRank: 49 },
  { symbol: 'GRTUSDT', baseAsset: 'GRT', name: 'The Graph', sector: 'AI', basePrice: 0.246, baseChange24h: 2.91, baseQuoteVol: 112_000_000, marketCapRank: 51 },

  // DeFi
  { symbol: 'LINKUSDT', baseAsset: 'LINK', name: 'Chainlink', sector: 'DeFi', basePrice: 23.85, baseChange24h: 5.32, baseQuoteVol: 540_000_000, marketCapRank: 13 },
  { symbol: 'AAVEUSDT', baseAsset: 'AAVE', name: 'Aave', sector: 'DeFi', basePrice: 292.4, baseChange24h: 6.85, baseQuoteVol: 325_000_000, marketCapRank: 28 },
  { symbol: 'UNIUSDT', baseAsset: 'UNI', name: 'Uniswap', sector: 'DeFi', basePrice: 13.48, baseChange24h: 2.18, baseQuoteVol: 264_000_000, marketCapRank: 21 },
  { symbol: 'ENAUSDT', baseAsset: 'ENA', name: 'Ethena', sector: 'DeFi', basePrice: 0.982, baseChange24h: 8.95, baseQuoteVol: 378_000_000, marketCapRank: 38 },
  { symbol: 'PENDLEUSDT', baseAsset: 'PENDLE', name: 'Pendle', sector: 'DeFi', basePrice: 5.42, baseChange24h: 4.74, baseQuoteVol: 145_000_000, marketCapRank: 66 },
  { symbol: 'JUPUSDT', baseAsset: 'JUP', name: 'Jupiter', sector: 'DeFi', basePrice: 1.08, baseChange24h: -2.15, baseQuoteVol: 162_000_000, marketCapRank: 58 },
  { symbol: 'LDOUSDT', baseAsset: 'LDO', name: 'Lido DAO', sector: 'DeFi', basePrice: 1.86, baseChange24h: -4.12, baseQuoteVol: 128_000_000, marketCapRank: 59 },
  { symbol: 'INJUSDT', baseAsset: 'INJ', name: 'Injective', sector: 'DeFi', basePrice: 24.6, baseChange24h: 3.41, baseQuoteVol: 175_000_000, marketCapRank: 45 },

  // Meme
  { symbol: 'DOGEUSDT', baseAsset: 'DOGE', name: 'Dogecoin', sector: 'Meme', basePrice: 0.362, baseChange24h: 4.88, baseQuoteVol: 1_120_000_000, marketCapRank: 7 },
  { symbol: 'PEPEUSDT', baseAsset: 'PEPE', name: 'Pepe', sector: 'Meme', basePrice: 0.00001942, baseChange24h: 12.64, baseQuoteVol: 960_000_000, marketCapRank: 18 },
  { symbol: 'WIFUSDT', baseAsset: 'WIF', name: 'dogwifhat', sector: 'Meme', basePrice: 2.86, baseChange24h: -5.42, baseQuoteVol: 485_000_000, marketCapRank: 34 },
  { symbol: 'BONKUSDT', baseAsset: 'BONK', name: 'Bonk', sector: 'Meme', basePrice: 0.0000382, baseChange24h: 7.82, baseQuoteVol: 412_000_000, marketCapRank: 36 },
  { symbol: 'SHIBUSDT', baseAsset: 'SHIB', name: 'Shiba Inu', sector: 'Meme', basePrice: 0.0000248, baseChange24h: 1.92, baseQuoteVol: 395_000_000, marketCapRank: 15 },
  { symbol: 'FLOKIUSDT', baseAsset: 'FLOKI', name: 'Floki', sector: 'Meme', basePrice: 0.000218, baseChange24h: -6.18, baseQuoteVol: 235_000_000, marketCapRank: 48 },

  // Layer 2 & RWA
  { symbol: 'ARBUSDT', baseAsset: 'ARB', name: 'Arbitrum', sector: 'Layer 2', basePrice: 0.892, baseChange24h: -3.28, baseQuoteVol: 310_000_000, marketCapRank: 37 },
  { symbol: 'OPUSDT', baseAsset: 'OP', name: 'Optimism', sector: 'Layer 2', basePrice: 2.16, baseChange24h: 1.78, baseQuoteVol: 215_000_000, marketCapRank: 41 },
  { symbol: 'ONDOUSDT', baseAsset: 'ONDO', name: 'Ondo Finance', sector: 'RWA', basePrice: 1.48, baseChange24h: 9.15, baseQuoteVol: 290_000_000, marketCapRank: 44 },
];

export const COIN_META_MAP: Record<string, CoinMetadata> = Object.fromEntries(
  CURATED_COINS.map((c) => [c.symbol, c]),
);

const EXTRA_SECTOR_MAP: Record<string, SectorName> = {
  // Layer 1
  TRX: 'Layer 1', LTC: 'Layer 1', BCH: 'Layer 1', DOT: 'Layer 1', XLM: 'Layer 1',
  HBAR: 'Layer 1', ATOM: 'Layer 1', ALGO: 'Layer 1', ICP: 'Layer 1', FIL: 'Layer 1',
  VET: 'Layer 1', ETC: 'Layer 1', ZEC: 'Layer 1', EGLD: 'Layer 1', FTM: 'Layer 1',
  S: 'Layer 1', KAVA: 'Layer 1', NEO: 'Layer 1', EOS: 'Layer 1', XTZ: 'Layer 1',
  THETA: 'Layer 1', MINA: 'Layer 1', FLOW: 'Layer 1', IOTA: 'Layer 1', QTUM: 'Layer 1',
  TIA: 'Layer 1', DYM: 'Layer 1', SAGA: 'Layer 1', BERA: 'Layer 1', MOVE: 'Layer 1',
  KAIA: 'Layer 1', XEC: 'Layer 1', DASH: 'Layer 1', ZEN: 'Layer 1', ROSE: 'Layer 1',
  // AI
  IO: 'AI', AI: 'AI', NFP: 'AI', PHB: 'AI', NMR: 'AI', RLC: 'AI', IQ: 'AI',
  COOKIE: 'AI', AIXBT: 'AI', CGPT: 'AI', KAITO: 'AI', SHELL: 'AI', SAHARA: 'AI',
  // DeFi
  CRV: 'DeFi', MKR: 'DeFi', SNX: 'DeFi', CAKE: 'DeFi', SUSHI: 'DeFi', COMP: 'DeFi',
  RUNE: 'DeFi', DYDX: 'DeFi', GMX: 'DeFi', '1INCH': 'DeFi', PYTH: 'DeFi', WOO: 'DeFi',
  RAY: 'DeFi', ORCA: 'DeFi', AERO: 'DeFi', MORPHO: 'DeFi', EIGEN: 'DeFi', ETHFI: 'DeFi',
  CVX: 'DeFi', BAL: 'DeFi', YFI: 'DeFi', UMA: 'DeFi', API3: 'DeFi', BAND: 'DeFi',
  JTO: 'DeFi', KMNO: 'DeFi', DRIFT: 'DeFi', SYRUP: 'DeFi', SKY: 'DeFi',
  // Meme
  PENGU: 'Meme', PNUT: 'Meme', NEIRO: 'Meme', BOME: 'Meme', TURBO: 'Meme',
  MEME: 'Meme', TRUMP: 'Meme', DOGS: 'Meme', NOT: 'Meme', '1000SATS': 'Meme',
  ORDI: 'Meme', PEOPLE: 'Meme', ACT: 'Meme', TST: 'Meme', '1000CHEEMS': 'Meme',
  '1MBABYDOGE': 'Meme', BROCCOLI714: 'Meme', MUBARAK: 'Meme', BANANAS31: 'Meme',
  // Layer 2
  POL: 'Layer 2', MATIC: 'Layer 2', STRK: 'Layer 2', ZK: 'Layer 2', IMX: 'Layer 2',
  STX: 'Layer 2', MANTA: 'Layer 2', METIS: 'Layer 2', SCR: 'Layer 2', ZRO: 'Layer 2',
  LRC: 'Layer 2', CELO: 'Layer 2', SKL: 'Layer 2', CTSI: 'Layer 2', LINEA: 'Layer 2',
  // RWA
  OM: 'RWA', TRU: 'RWA', POLYX: 'RWA', RSR: 'RWA', PAXG: 'RWA', PLUME: 'RWA',
  USUAL: 'RWA', CFG: 'RWA',
};

export const EXCLUDED_STABLE_BASES = new Set([
  'USDC', 'FDUSD', 'TUSD', 'USDP', 'BUSD', 'DAI', 'USD1', 'RLUSD', 'USDE',
  'BFUSD', 'EURI', 'EUR', 'AEUR', 'XUSD', 'USDJ', 'SUSD', 'USTC', 'PYUSD', 'U',
]);

export function isExcludedBinanceBase(baseAsset: string): boolean {
  if (EXCLUDED_STABLE_BASES.has(baseAsset)) return true;
  if (/(UP|DOWN|BULL|BEAR)$/.test(baseAsset) && baseAsset.length > 4) return true;
  return false;
}

export function resolveSectorForBase(baseAsset: string): SectorName {
  const curated = COIN_META_MAP[`${baseAsset}USDT`];
  if (curated) return curated.sector;
  return EXTRA_SECTOR_MAP[baseAsset] ?? 'Altcoin';
}

function deterministicHash(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function deriveTechnicalHints(
  symbol: string,
  price: number,
  high24h: number,
  low24h: number,
  changePercent24h: number,
  quoteVolume24h: number,
): Pick<Coin, 'rsi14' | 'volumeSpikeRatio' | 'oiChange24h' | 'nearBreakout' | 'fundingRate'> {
  const h = deterministicHash(symbol);
  const range = Math.max(high24h - low24h, price * 0.005);
  const posInRange = Math.min(1, Math.max(0, (price - low24h) / range));

  // Derive realistic RSI correlated with 24h momentum and range position
  const rawRsi = 48 + changePercent24h * 2.15 + (posInRange - 0.5) * 18 + (h - 0.5) * 8;
  const rsi14 = Number(Math.min(89, Math.max(14, rawRsi)).toFixed(1));

  // Derive volume spike ratio against baseline volume
  const meta = COIN_META_MAP[symbol];
  const baseVol = meta ? meta.baseQuoteVol : 120_000_000;
  const volBoost = Math.abs(changePercent24h) > 6 ? 1.45 + h * 1.35 : 0.75 + h * 1.1;
  const ratioFromLive = quoteVolume24h > 0 ? quoteVolume24h / Math.max(baseVol * 0.75, 1) : volBoost;
  const volumeSpikeRatio = Number(
    Math.min(4.8, Math.max(0.55, ratioFromLive * 0.65 + volBoost * 0.35)).toFixed(2),
  );

  // Open interest delta correlated with directional trend & volume
  const oiChange24h = Number(
    (changePercent24h * 0.85 + (volumeSpikeRatio - 1) * 6.5 + (h - 0.45) * 8).toFixed(2),
  );

  const nearBreakout = posInRange >= 0.86 && changePercent24h > 1.5;
  const fundingRate = Number((0.008 + changePercent24h * 0.0018 + (h - 0.5) * 0.008).toFixed(4));

  return {
    rsi14,
    volumeSpikeRatio,
    oiChange24h,
    nearBreakout,
    fundingRate,
  };
}

export function buildFallbackCoins(): Coin[] {
  const now = Date.now();
  return CURATED_COINS.map((meta) => {
    const changeAmt = (meta.basePrice * meta.baseChange24h) / 100;
    const high24h = meta.basePrice * (1 + Math.max(0.018, Math.abs(meta.baseChange24h) / 100 + 0.014));
    const low24h = meta.basePrice * (1 - Math.max(0.016, Math.abs(meta.baseChange24h) / 100 * 0.65 + 0.012));
    const hints = deriveTechnicalHints(
      meta.symbol,
      meta.basePrice,
      high24h,
      low24h,
      meta.baseChange24h,
      meta.baseQuoteVol,
    );

    return {
      symbol: meta.symbol,
      baseAsset: meta.baseAsset,
      name: meta.name,
      sector: meta.sector,
      price: meta.basePrice,
      priceChange24h: changeAmt,
      priceChangePercent24h: meta.baseChange24h,
      high24h,
      low24h,
      volume24h: meta.baseQuoteVol / meta.basePrice,
      quoteVolume24h: meta.baseQuoteVol,
      marketCapRank: meta.marketCapRank,
      hasFutures: true,
      futuresSymbol: meta.symbol,
      lastUpdated: now,
      ...hints,
    };
  });
}

export function buildFallbackGlobalMarket(): GlobalMarketData {
  return {
    totalMarketCapUsd: 3_240_000_000_000,
    marketCapChangePercent24h: 2.64,
    totalVolume24hUsd: 148_500_000_000,
    btcDominance: 57.42,
    usdtDominance: 4.18,
    ethDominance: 12.85,
    activeCryptocurrencies: 14_820,
    updatedAt: Date.now(),
    isFallback: true,
  };
}

export function buildFallbackFearGreed(): FearGreedData {
  return {
    value: 68,
    classification: 'Greed',
    timestamp: Date.now(),
    previousValue: 64,
    isFallback: true,
  };
}

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '1w': 604800,
};

export function generateFallbackCandles(
  symbol: string,
  timeframe: Timeframe,
  limit = 300,
  anchorPrice?: number,
): Candle[] {
  const meta = COIN_META_MAP[symbol];
  const targetClose = anchorPrice && anchorPrice > 0 ? anchorPrice : (meta?.basePrice ?? 100);
  const stepSec = TIMEFRAME_SECONDS[timeframe];
  const nowSec = Math.floor(Date.now() / 1000);
  const endAligned = nowSec - (nowSec % stepSec);

  const seedBase = deterministicHash(`${symbol}-${timeframe}`);
  let s = Math.floor(seedBase * 1_000_000) + 17;
  const nextRand = (): number => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  // Volatility scales with timeframe
  const volMap: Record<Timeframe, number> = {
    '5m': 0.0032,
    '15m': 0.0055,
    '1h': 0.011,
    '4h': 0.021,
    '1d': 0.036,
    '1w': 0.075,
  };
  const sigma = volMap[timeframe];

  // Generate raw series then rescale smoothly so the latest close equals targetClose
  const raw: { open: number; high: number; low: number; close: number; volume: number }[] = [];
  let cursor = 100;
  let trendPhase = (seedBase - 0.45) * 0.004;

  for (let i = 0; i < limit; i++) {
    if (i % 35 === 0) {
      trendPhase = (nextRand() - 0.48) * sigma * 0.55;
    }
    const wave = Math.sin(i / 14 + seedBase * 6) * sigma * 0.35;
    const shock = (nextRand() - 0.5) * 2 * sigma;
    const open = cursor;
    const close = Math.max(1, open * (1 + trendPhase + wave + shock));
    const upperWick = (0.15 + nextRand() * 0.85) * sigma * Math.max(open, close);
    const lowerWick = (0.15 + nextRand() * 0.85) * sigma * Math.min(open, close);
    const high = Math.max(open, close) + upperWick;
    const low = Math.max(0.5, Math.min(open, close) - lowerWick);
    const volSpike = nextRand() > 0.88 ? 2.4 + nextRand() * 1.5 : 0.7 + nextRand() * 0.9;
    const volume = (meta?.baseQuoteVol ?? 150_000_000) / (24 * 60) * (stepSec / 60) * volSpike / Math.max(targetClose, 0.00001);

    raw.push({ open, high, low, close, volume });
    cursor = close;
  }

  const scale = targetClose / raw[raw.length - 1].close;
  return raw.map((bar, idx) => ({
    time: endAligned - (limit - 1 - idx) * stepSec,
    open: Number((bar.open * scale).toPrecision(7)),
    high: Number((bar.high * scale).toPrecision(7)),
    low: Number((bar.low * scale).toPrecision(7)),
    close: Number((bar.close * scale).toPrecision(7)),
    volume: Number(bar.volume.toFixed(2)),
  }));
}
