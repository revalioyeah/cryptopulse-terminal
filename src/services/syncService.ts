import type { CloudSyncConfig } from '../types';
import {
  buildBackupPayload,
  restoreBackupPayload,
  validateBackupJson,
  type BackupSummary,
  type CryptoPulseBackupPayload,
} from './backupService';

const GIST_FILENAME = 'cryptopulse-sync.json';
const GIST_API_BASE = 'https://api.github.com/gists';

// Shared lock so remote hydration (auto-pull or manual pull) never triggers a bounce-back auto-push
let remoteSyncLockDepth = 0;

export function isApplyingRemoteSync(): boolean {
  return remoteSyncLockDepth > 0;
}

export function withRemoteSyncLock<T>(fn: () => T): T {
  remoteSyncLockDepth += 1;
  try {
    return fn();
  } finally {
    window.setTimeout(() => {
      remoteSyncLockDepth = Math.max(0, remoteSyncLockDepth - 1);
    }, 350);
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function gzipCompress(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([new Uint8Array(bytes)])
      .stream()
      .pipeThrough(new CompressionStream('gzip'));
    const out = await new Response(stream).arrayBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

async function gzipDecompress(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([new Uint8Array(bytes)])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    const out = await new Response(stream).arrayBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

/**
 * Mengkodekan seluruh state CryptoPulse ke Sync Code ringkas (`CP1Z:...` gzipped atau `CP1:...`)
 * untuk transfer instan Web <-> Mobile tanpa perlu akun cloud.
 */
export async function encodeSyncCode(includeSecrets = true): Promise<string> {
  const payload = buildBackupPayload(includeSecrets);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  const compressed = await gzipCompress(jsonBytes);
  if (compressed && compressed.length < jsonBytes.length) {
    return `CP1Z:${bytesToBase64Url(compressed)}`;
  }
  return `CP1:${bytesToBase64Url(jsonBytes)}`;
}

/**
 * Mendekode Sync Code (`CP1Z:...` / `CP1:...`) atau Transfer Link (`...#cp-sync=...`)
 * dan memvalidasi strukturnya dengan validator resmi backupService.
 */
export async function decodeSyncCode(
  rawInput: string,
): Promise<
  { ok: true; payload: CryptoPulseBackupPayload; summary: BackupSummary } | { ok: false; error: string }
> {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { ok: false, error: 'Kode Sync kosong.' };
  }

  let token = trimmed;
  const hashIdx = trimmed.indexOf('#cp-sync=');
  if (hashIdx >= 0) {
    token = decodeURIComponent(trimmed.slice(hashIdx + '#cp-sync='.length).split('&')[0]);
  }

  try {
    let jsonText = '';
    if (token.startsWith('CP1Z:')) {
      const bytes = base64UrlToBytes(token.slice(5));
      const decompressed = await gzipDecompress(bytes);
      if (!decompressed) {
        return { ok: false, error: 'Browser tidak mendukung dekompresi gzip untuk kode sync ini.' };
      }
      jsonText = new TextDecoder().decode(decompressed);
    } else if (token.startsWith('CP1:')) {
      const bytes = base64UrlToBytes(token.slice(4));
      jsonText = new TextDecoder().decode(bytes);
    } else {
      return {
        ok: false,
        error: 'Format Kode Sync tidak dikenali (harus diawali CP1Z:, CP1:, atau Link #cp-sync=).',
      };
    }

    return validateBackupJson(jsonText);
  } catch {
    return { ok: false, error: 'Kode Sync rusak atau terpotong. Pastikan menyalin seluruh kode.' };
  }
}

export async function buildSyncShareUrl(
  includeSecrets = true,
): Promise<{ code: string; url: string; chars: number }> {
  const code = await encodeSyncCode(includeSecrets);
  const baseUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://revalioyeah.github.io/cryptopulse-terminal/';
  const url = `${baseUrl}#cp-sync=${encodeURIComponent(code)}`;
  return { code, url, chars: url.length };
}

/**
 * Pairing Code 1-klik untuk menghubungkan Cloud Sync (GitHub Gist) dari Desktop Web ke HP Mobile
 * tanpa perlu mengetik ulang Token & Gist ID secara manual.
 */
export function encodeCloudPairCode(githubToken: string, gistId: string): { code: string; url: string } {
  const json = JSON.stringify({ v: 1, t: githubToken.trim(), g: gistId.trim() });
  const code = `CPPAIR:${bytesToBase64Url(new TextEncoder().encode(json))}`;
  const baseUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://revalioyeah.github.io/cryptopulse-terminal/';
  return {
    code,
    url: `${baseUrl}#cp-pair=${encodeURIComponent(code)}`,
  };
}

export function decodeCloudPairCode(
  rawInput: string,
): { ok: true; githubToken: string; gistId: string } | { ok: false; error: string } {
  const trimmed = rawInput.trim();
  let token = trimmed;
  const hashIdx = trimmed.indexOf('#cp-pair=');
  if (hashIdx >= 0) {
    token = decodeURIComponent(trimmed.slice(hashIdx + '#cp-pair='.length).split('&')[0]);
  }
  if (!token.startsWith('CPPAIR:')) {
    return { ok: false, error: 'Format Pairing Code tidak valid (harus diawali CPPAIR:).' };
  }
  try {
    const decoded = new TextDecoder().decode(base64UrlToBytes(token.slice(7)));
    const parsed = JSON.parse(decoded) as { v?: number; t?: string; g?: string };
    if (!parsed.t || !parsed.g) {
      return { ok: false, error: 'Pairing Code tidak lengkap (Token atau Gist ID kosong).' };
    }
    return { ok: true, githubToken: parsed.t.trim(), gistId: parsed.g.trim() };
  } catch {
    return { ok: false, error: 'Pairing Code rusak atau terpotong.' };
  }
}

interface GitHubGistResponse {
  id?: string;
  updated_at?: string;
  message?: string;
  files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>;
}

export interface RemoteGistSnapshot {
  payload: CryptoPulseBackupPayload;
  summary: BackupSummary;
  remoteUpdatedAt: number;
}

function mergeByIdWithTimestamp<T extends { id: string; updatedAt?: number; createdAt?: number }>(
  localList: T[],
  remoteList: T[],
): T[] {
  const map = new Map<string, T>();
  for (const item of remoteList) {
    map.set(item.id, item);
  }
  for (const item of localList) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else {
      const localTs = item.updatedAt ?? item.createdAt ?? 0;
      const remoteTs = existing.updatedAt ?? existing.createdAt ?? 0;
      map.set(item.id, localTs >= remoteTs ? item : existing);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0),
  );
}

/**
 * Menggabungkan perubahan konflik antara perangkat lokal dan Cloud Gist agar setup, alert,
 * dan watchlist dari Mobile tidak pernah tertimpa secara tidak sengaja oleh tab Web yang lama.
 */
export function mergeCloudPayloads(
  local: CryptoPulseBackupPayload,
  remote: CryptoPulseBackupPayload,
): CryptoPulseBackupPayload {
  const mergedWatchlist = Array.from(
    new Set([...(local.trading.watchlist ?? []), ...(remote.trading.watchlist ?? [])]),
  );

  const mergedFutures = mergeByIdWithTimestamp(
    local.trading.futuresSetups ?? [],
    remote.trading.futuresSetups ?? [],
  );

  const mergedSpots = mergeByIdWithTimestamp(
    local.trading.spotSetups ?? [],
    remote.trading.spotSetups ?? [],
  );

  const mergedScannerLogs = mergeByIdWithTimestamp(
    local.trading.scannerLogs ?? [],
    remote.trading.scannerLogs ?? [],
  ).slice(0, 60);

  const mergedAlerts = mergeByIdWithTimestamp(
    local.settings.priceAlerts ?? [],
    remote.settings.priceAlerts ?? [],
  );

  // Portfolio: pick whichever side has the latest real user activity timestamp (or non-empty portfolio)
  const localLastAct = local.portfolio.activityLogs?.[0]?.timestamp ?? 0;
  const remoteLastAct = remote.portfolio.activityLogs?.[0]?.timestamp ?? 0;
  const localHasPortfolio =
    (local.portfolio.holdings?.length ?? 0) > 0 || (local.portfolio.usdtBalance ?? 0) > 0;
  const remoteHasPortfolio =
    (remote.portfolio.holdings?.length ?? 0) > 0 || (remote.portfolio.usdtBalance ?? 0) > 0;

  const chooseRemotePortfolio =
    (remoteHasPortfolio && !localHasPortfolio) ||
    (remoteLastAct > localLastAct);

  return {
    app: 'CryptoPulse Terminal',
    schemaVersion: 1,
    exportedAt: Date.now(),
    trading: {
      ...remote.trading,
      ...local.trading,
      watchlist: mergedWatchlist,
      futuresSetups: mergedFutures,
      spotSetups: mergedSpots,
      scannerLogs: mergedScannerLogs,
    },
    portfolio: chooseRemotePortfolio ? remote.portfolio : local.portfolio,
    settings: {
      ...remote.settings,
      ...local.settings,
      priceAlerts: mergedAlerts,
      telegramConfig:
        local.settings.telegramConfig?.botToken
          ? local.settings.telegramConfig
          : remote.settings.telegramConfig,
    },
  };
}

/**
 * Mengambil snapshot terbaru dari Private GitHub Gist dalam 1 request (dengan cache-busting).
 */
export async function fetchRemoteGistSnapshot(
  config: CloudSyncConfig,
): Promise<{ ok: true; snapshot: RemoteGistSnapshot } | { ok: false; error: string }> {
  const token = config.githubToken.trim();
  const gistId = config.gistId.trim();
  if (!token || !gistId) {
    return { ok: false, error: 'GitHub Token dan Gist ID wajib diisi untuk sinkronisasi Cloud.' };
  }

  try {
    const res = await fetch(`${GIST_API_BASE}/${encodeURIComponent(gistId)}?_t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
      },
    });

    const data = (await res.json().catch(() => ({}))) as GitHubGistResponse;
    if (!res.ok) {
      if (res.status === 401) return { ok: false, error: 'Token GitHub tidak valid (HTTP 401).' };
      if (res.status === 404) return { ok: false, error: 'Gist ID tidak ditemukan di akun GitHub ini.' };
      return { ok: false, error: data.message || `Gagal membaca Cloud Sync (HTTP ${res.status}).` };
    }

    const file = data.files?.[GIST_FILENAME];
    if (!file) {
      return { ok: false, error: `File ${GIST_FILENAME} tidak ditemukan di Gist tersebut.` };
    }

    let rawContent = file.content ?? '';
    if (file.truncated && file.raw_url) {
      const rawRes = await fetch(`${file.raw_url}?_t=${Date.now()}`, { cache: 'no-store' });
      if (rawRes.ok) {
        rawContent = await rawRes.text();
      }
    }

    const validated = validateBackupJson(rawContent);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }

    const remoteUpdatedAt = data.updated_at
      ? Date.parse(data.updated_at) || validated.payload.exportedAt
      : validated.payload.exportedAt;

    return {
      ok: true,
      snapshot: {
        payload: validated.payload,
        summary: validated.summary,
        remoteUpdatedAt,
      },
    };
  } catch {
    return { ok: false, error: 'Gagal menghubungi GitHub API. Periksa koneksi internet Anda.' };
  }
}

/**
 * Mencari otomatis Secret Gist milik pengguna yang berisi `cryptopulse-sync.json`
 * cukup dari GitHub Token (tanpa perlu salin-tempel Gist ID manual).
 * Memilih Gist yang paling baru diperbarui bila ada lebih dari satu.
 */
export async function discoverCryptoPulseGistId(
  githubToken: string,
): Promise<{ ok: true; gistId: string; updatedAt: number } | { ok: false; error: string }> {
  const token = githubToken.trim();
  if (!token) {
    return { ok: false, error: 'GitHub Token (scope: gist) belum diisi.' };
  }

  try {
    const res = await fetch(`${GIST_API_BASE}?per_page=100&_t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        return { ok: false, error: 'Token GitHub tidak valid atau sudah kedaluwarsa (HTTP 401).' };
      }
      if (res.status === 403) {
        return {
          ok: false,
          error: 'Token tidak memiliki izin scope `gist` (HTTP 403). Centang scope gist saat buat token.',
        };
      }
      return { ok: false, error: `Gagal mendeteksi Gist (HTTP ${res.status}).` };
    }

    const list = (await res.json()) as GitHubGistResponse[];
    if (!Array.isArray(list)) {
      return { ok: false, error: 'Respons daftar Gist GitHub tidak valid.' };
    }

    const matches = list
      .filter((g) => Boolean(g.id && g.files && g.files[GIST_FILENAME]))
      .sort((a, b) => (Date.parse(b.updated_at ?? '') || 0) - (Date.parse(a.updated_at ?? '') || 0));

    if (matches.length === 0 || !matches[0].id) {
      return {
        ok: false,
        error: `Belum ditemukan Gist ${GIST_FILENAME} di akun GitHub ini. Klik "Push ke Cloud" di perangkat yang memiliki data terlebih dahulu.`,
      };
    }

    return {
      ok: true,
      gistId: matches[0].id,
      updatedAt: Date.parse(matches[0].updated_at ?? '') || Date.now(),
    };
  } catch {
    return { ok: false, error: 'Gagal menghubungi GitHub API. Periksa koneksi internet Anda.' };
  }
}

/**
 * Push state CryptoPulse ke Private GitHub Gist (`public: false`).
 * Bila `gistId` masih kosong, otomatis mencari Gist `cryptopulse-sync.json` yang sudah ada terlebih dahulu
 * agar Web dan Mobile selalu memakai 1 Gist yang sama dan tidak membuat Gist ganda.
 * Bila remote lebih baru dari `lastSyncedAt`, otomatis melakukan Smart Merge terlebih dahulu.
 */
export async function pushCloudSyncGist(
  config: CloudSyncConfig,
  options?: { keepalive?: boolean; forceOverwrite?: boolean },
): Promise<
  | { ok: true; gistId: string; syncedAt: number; mergedRemote: boolean; message: string }
  | { ok: false; error: string }
> {
  const token = config.githubToken.trim();
  if (!token) {
    return { ok: false, error: 'GitHub Personal Access Token (scope gist) wajib diisi.' };
  }

  let payload = buildBackupPayload(config.includeSecrets);
  let existingId = config.gistId.trim();
  let mergedRemote = false;

  // Auto-discover existing CryptoPulse Gist if gistId is blank so devices never split into 2 Gists
  if (!existingId && !options?.keepalive) {
    const discovered = await discoverCryptoPulseGistId(token);
    if (discovered.ok) {
      existingId = discovered.gistId;
    }
  }

  // Smart pre-push conflict check: if remote Gist was updated by another device since our last sync, merge first!
  if (existingId && !options?.forceOverwrite && !options?.keepalive) {
    const remoteRes = await fetchRemoteGistSnapshot({ ...config, gistId: existingId });
    if (remoteRes.ok) {
      const localSyncedAt = config.lastSyncedAt ?? 0;
      if (remoteRes.snapshot.remoteUpdatedAt > localSyncedAt) {
        payload = mergeCloudPayloads(payload, remoteRes.snapshot.payload);
        mergedRemote = true;
        withRemoteSyncLock(() => {
          restoreBackupPayload(payload);
        });
      }
    }
  }

  const content = JSON.stringify(payload, null, 2);
  const url = existingId ? `${GIST_API_BASE}/${encodeURIComponent(existingId)}` : GIST_API_BASE;
  const method = existingId ? 'PATCH' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      cache: 'no-store',
      keepalive: Boolean(options?.keepalive && content.length < 55_000),
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: 'CryptoPulse Terminal — Private Web & Mobile Cloud Sync',
        ...(existingId ? {} : { public: false }),
        files: {
          [GIST_FILENAME]: { content },
        },
      }),
    });

    const data = (await res.json().catch(() => ({}))) as GitHubGistResponse;
    if (!res.ok || !data.id) {
      if (res.status === 401) {
        return { ok: false, error: 'Token GitHub tidak valid atau sudah kedaluwarsa (HTTP 401).' };
      }
      if (res.status === 403) {
        return {
          ok: false,
          error: 'Token tidak memiliki izin scope `gist` (HTTP 403). Centang scope gist saat buat token.',
        };
      }
      if (res.status === 404 && existingId) {
        return {
          ok: false,
          error: 'Gist ID tidak ditemukan. Kosongkan Gist ID untuk membuat Gist privat baru.',
        };
      }
      return { ok: false, error: data.message || `Gagal Push Cloud Sync (HTTP ${res.status}).` };
    }

    const syncedAt = data.updated_at ? Date.parse(data.updated_at) || Date.now() : Date.now();
    return {
      ok: true,
      gistId: data.id,
      syncedAt,
      mergedRemote,
      message: mergedRemote
        ? 'Data digabungkan dengan perubahan perangkat lain & berhasil di-push ke Cloud.'
        : existingId
          ? 'Data berhasil di-push ke Cloud Sync.'
          : `Private Cloud Sync Gist baru berhasil dibuat (${data.id.slice(0, 8)}...).`,
    };
  } catch {
    return { ok: false, error: 'Gagal menghubungi GitHub API. Periksa koneksi internet Anda.' };
  }
}

/**
 * Pull seluruh state CryptoPulse dari Private GitHub Gist dan hidrasi ke store lokal.
 * Bila `gistId` belum diisi, otomatis mendeteksi Gist `cryptopulse-sync.json` milik token tersebut!
 */
export async function pullCloudSyncGist(
  config: CloudSyncConfig,
): Promise<
  | { ok: true; gistId: string; summary: BackupSummary; syncedAt: number; message: string }
  | { ok: false; error: string }
> {
  const token = config.githubToken.trim();
  if (!token) {
    return { ok: false, error: 'GitHub Token (scope: gist) wajib diisi untuk Pull dari Cloud.' };
  }

  let resolvedGistId = config.gistId.trim();
  if (!resolvedGistId) {
    const discovered = await discoverCryptoPulseGistId(token);
    if (!discovered.ok) return discovered;
    resolvedGistId = discovered.gistId;
  }

  const remoteRes = await fetchRemoteGistSnapshot({ ...config, gistId: resolvedGistId });
  if (!remoteRes.ok) return remoteRes;

  withRemoteSyncLock(() => {
    restoreBackupPayload(remoteRes.snapshot.payload);
  });

  const { summary, remoteUpdatedAt } = remoteRes.snapshot;
  return {
    ok: true,
    gistId: resolvedGistId,
    summary,
    syncedAt: remoteUpdatedAt,
    message: `Cloud Sync berhasil ditarik (${summary.holdingsCount} aset spot, ${summary.futuresSetupsCount + summary.spotSetupsCount} setup jurnal).`,
  };
}
