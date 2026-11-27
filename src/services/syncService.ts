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

  // Extract from full URL if user pasted the whole link
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

/**
 * Push seluruh state CryptoPulse ke Private GitHub Gist (`public: false`).
 * Bila `gistId` belum ada, otomatis membuat Secret Gist baru.
 */
export async function pushCloudSyncGist(
  config: CloudSyncConfig,
): Promise<{ ok: true; gistId: string; syncedAt: number; message: string } | { ok: false; error: string }> {
  const token = config.githubToken.trim();
  if (!token) {
    return { ok: false, error: 'GitHub Personal Access Token (scope gist) wajib diisi.' };
  }

  const payload = buildBackupPayload(config.includeSecrets);
  const content = JSON.stringify(payload, null, 2);
  const existingId = config.gistId.trim();

  const url = existingId ? `${GIST_API_BASE}/${encodeURIComponent(existingId)}` : GIST_API_BASE;
  const method = existingId ? 'PATCH' : 'POST';

  try {
    const res = await fetch(url, {
      method,
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
      message: existingId
        ? 'Data berhasil di-push ke Cloud Sync.'
        : `Private Cloud Sync Gist baru berhasil dibuat (${data.id.slice(0, 8)}...).`,
    };
  } catch {
    return { ok: false, error: 'Gagal menghubungi GitHub API. Periksa koneksi internet Anda.' };
  }
}

/**
 * Pull seluruh state CryptoPulse dari Private GitHub Gist dan hidrasi ke store lokal.
 */
export async function pullCloudSyncGist(
  config: CloudSyncConfig,
): Promise<
  | { ok: true; summary: BackupSummary; syncedAt: number; message: string }
  | { ok: false; error: string }
> {
  const token = config.githubToken.trim();
  const gistId = config.gistId.trim();
  if (!token || !gistId) {
    return { ok: false, error: 'GitHub Token dan Gist ID wajib diisi untuk Pull dari Cloud.' };
  }

  try {
    const res = await fetch(`${GIST_API_BASE}/${encodeURIComponent(gistId)}`, {
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
      return { ok: false, error: data.message || `Gagal Pull Cloud Sync (HTTP ${res.status}).` };
    }

    const file = data.files?.[GIST_FILENAME];
    if (!file) {
      return { ok: false, error: `File ${GIST_FILENAME} tidak ditemukan di Gist tersebut.` };
    }

    let rawContent = file.content ?? '';
    if (file.truncated && file.raw_url) {
      const rawRes = await fetch(file.raw_url, { cache: 'no-store' });
      if (rawRes.ok) {
        rawContent = await rawRes.text();
      }
    }

    const validated = validateBackupJson(rawContent);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }

    restoreBackupPayload(validated.payload);
    const syncedAt = data.updated_at ? Date.parse(data.updated_at) || Date.now() : Date.now();
    return {
      ok: true,
      summary: validated.summary,
      syncedAt,
      message: `Cloud Sync berhasil ditarik (${validated.summary.holdingsCount} aset spot, ${validated.summary.futuresSetupsCount + validated.summary.spotSetupsCount} setup jurnal).`,
    };
  } catch {
    return { ok: false, error: 'Gagal menghubungi GitHub API. Periksa koneksi internet Anda.' };
  }
}

/**
 * Cek timestamp update terakhir di Cloud Gist untuk menentukan apakah perangkat ini perlu auto-pull.
 */
export async function fetchCloudGistUpdatedAt(config: CloudSyncConfig): Promise<number | null> {
  const token = config.githubToken.trim();
  const gistId = config.gistId.trim();
  if (!token || !gistId) return null;

  try {
    const res = await fetch(`${GIST_API_BASE}/${encodeURIComponent(gistId)}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GitHubGistResponse;
    return data.updated_at ? Date.parse(data.updated_at) || null : null;
  } catch {
    return null;
  }
}
