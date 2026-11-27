import type { TelegramConfig } from '../../types';

export interface TelegramSendResult {
  ok: boolean;
  message: string;
}

export interface TelegramDetectChatResult {
  ok: boolean;
  chatId?: string;
  chatLabel?: string;
  message: string;
}

interface TelegramChatInfo {
  id: number;
  type?: string;
  username?: string;
  first_name?: string;
  title?: string;
}

interface TelegramUpdateItem {
  message?: { chat?: TelegramChatInfo };
  channel_post?: { chat?: TelegramChatInfo };
  my_chat_member?: { chat?: TelegramChatInfo };
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

  if (/^@.+bot$/i.test(chatId)) {
    return {
      ok: false,
      message:
        'Chat ID tidak boleh berupa username bot (@...bot). Isi Chat ID angka akun Anda (atau klik "Deteksi Chat ID" setelah mengirim /start ke bot).',
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

export async function detectTelegramChatId(botToken: string): Promise<TelegramDetectChatResult> {
  const token = botToken.trim();
  if (!token) {
    return { ok: false, message: 'Isi Telegram Bot Token dari @BotFather terlebih dahulu.' };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);

  try {
    const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/getUpdates?limit=20`;
    const res = await fetch(url, { signal: controller.signal });
    const data = (await res.json()) as {
      ok?: boolean;
      description?: string;
      result?: TelegramUpdateItem[];
    };

    if (!res.ok || !data.ok) {
      return {
        ok: false,
        message: data.description || `Gagal membaca getUpdates (HTTP ${res.status})`,
      };
    }

    const updates = data.result ?? [];
    for (let i = updates.length - 1; i >= 0; i--) {
      const chat =
        updates[i].message?.chat ??
        updates[i].channel_post?.chat ??
        updates[i].my_chat_member?.chat;
      if (chat && typeof chat.id === 'number') {
        const label =
          chat.title ||
          (chat.username ? `@${chat.username}` : chat.first_name) ||
          chat.type ||
          'Telegram Chat';
        return {
          ok: true,
          chatId: String(chat.id),
          chatLabel: label,
          message: `Chat ID ditemukan: ${chat.id} (${label})`,
        };
      }
    }

    return {
      ok: false,
      message:
        'Belum ada pesan masuk ke bot. Buka bot Anda di Telegram, klik START (atau kirim pesan "halo"), lalu klik Deteksi lagi.',
    };
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
