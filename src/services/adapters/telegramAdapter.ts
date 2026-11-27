import type { TelegramConfig } from '../../types';

export interface TelegramSendResult {
  ok: boolean;
  message: string;
}

export async function sendTelegramHtmlMessage(
  config: Pick<TelegramConfig, 'botToken' | 'chatId'>,
  htmlText: string,
): Promise<TelegramSendResult> {
  const token = config.botToken.trim();
  const chatId = config.chatId.trim();

  if (!token || !chatId) {
    return {
      ok: false,
      message: 'Bot Token atau Chat ID Telegram belum diisi di Settings.',
    };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);

  try {
    const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        message: data.description || `Telegram API error (HTTP ${res.status})`,
      };
    }

    return { ok: true, message: 'Pesan berhasil dikirim ke Telegram.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal menghubungi Telegram API';
    return { ok: false, message: msg };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function testTelegramConnection(
  config: Pick<TelegramConfig, 'botToken' | 'chatId'>,
): Promise<TelegramSendResult> {
  const html = [
    '<b>⚡ CryptoPulse Terminal — Test Koneksi Berhasil</b>',
    '────────────────────',
    'Status: <code>ONLINE &amp; READY</code>',
    `Waktu: <code>${new Date().toLocaleString('id-ID')}</code>`,
    'Notifikasi Futures, Spot DCA, Auto-Scanner, dan Price Alerts siap dikirim.',
  ].join('\n');
  return sendTelegramHtmlMessage(config, html);
}
