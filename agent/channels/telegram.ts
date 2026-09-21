import {
  defaultTelegramAuth,
  resolveTelegramBotToken,
  telegramChannel,
} from "eve/channels/telegram";

import { createTelegramGatekeeper, loadAllowedContacts } from "../lib/telegram/auth.ts";
import {
  dossierDocumentFilename,
  extractDossierMarkdownPath,
  sendTelegramDocument,
  toMarkdownDocument,
} from "../lib/telegram/dossier-document.ts";

/**
 * Canal Telegram do dossiê de clientes (PRD §1–§4).
 *
 * - Gatekeeper: `onMessage` valida o remetente contra a allowlist
 *   (`agent/lib/telegram/allowed-contacts.ts` + `TELEGRAM_ALLOWED_USER_IDS`).
 *   Não autorizados recebem "Acesso não autorizado." e o update é descartado
 *   (o webhook responde HTTP 200, sem reenvio).
 * - Orquestrador: mensagens autorizadas seguem para o agente raiz, que delega
 *   a coleta ao subagente `client-dossier`. A entrega acontece só no
 *   `message.completed` — nunca em fragmentos (streams) intermediários.
 * - Dispatcher: quando o relatório final referencia um `dossiers/…/dossie.md`,
 *   o arquivo é lido do workspace e enviado como Document (`sendDocument`)
 *   com nome dinâmico `dossie_<slug>.md`.
 *
 * Env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET_TOKEN e, opcionais,
 * TELEGRAM_BOT_USERNAME, TELEGRAM_ALLOWED_USER_IDS, TELEGRAM_ALLOWED_PHONES.
 */
export default telegramChannel({
  botUsername: process.env.TELEGRAM_BOT_USERNAME,
  onMessage: createTelegramGatekeeper({
    contacts: loadAllowedContacts(),
    onAuthorized: async (ctx, message) => {
      await ctx.telegram.startTyping();
      return { auth: defaultTelegramAuth(message) };
    },
  }),
  events: {
    async "message.completed"(data, channel, ctx) {
      if (data.finishReason === "tool-calls" || data.message === null) return;

      const text = data.message;
      const markdownPath = extractDossierMarkdownPath(text);

      // Sem dossiê no relatório: comportamento padrão (texto plano).
      if (markdownPath === null) {
        await channel.telegram.post(text);
        return;
      }

      try {
        const sandbox = await ctx.getSandbox();
        const markdown = await sandbox.readTextFile({ path: markdownPath });
        if (markdown === null) {
          await channel.telegram.post(text);
          return;
        }

        const filename = dossierDocumentFilename(markdownPath);
        const result = await sendTelegramDocument({
          botToken: await resolveTelegramBotToken(),
          chatId: channel.telegram.chatId,
          document: toMarkdownDocument(markdown, filename),
          caption: `📄 ${filename}`,
        });
        if (!result.ok) {
          console.error(`[telegram] sendDocument falhou (HTTP ${result.status}); enviando apenas texto.`);
        }

        // O relatório curto (status, missing[], caminhos) vai como texto.
        await channel.telegram.post(text);
      } catch (error) {
        console.error("[telegram] falha ao despachar dossiê como documento; enviando apenas texto.", error);
        await channel.telegram.post(text);
      }
    },
  },
});
