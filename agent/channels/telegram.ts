import { defineState } from "eve/context";
import {
  defaultTelegramAuth,
  resolveTelegramBotToken,
  telegramChannel,
} from "eve/channels/telegram";

import { createTelegramGatekeeper, loadAllowedContacts } from "../lib/telegram/auth.ts";
import {
  sendTelegramDocument,
  toMarkdownDocument,
} from "../lib/telegram/dossier-document.ts";
import {
  DOSSIER_DOWNLOAD_EVENTS,
  dossierDownloadEvent,
  logDossierDownload,
  resolveDossierDownload,
  shouldAutoDownload,
} from "../lib/dossier/download.ts";

/**
 * RF05 — idempotência: chaves das gerações já baixadas automaticamente nesta
 * sessão, persistidas de forma durável para não duplicar o download após
 * reinícios/steer de turno (PRD-Download-automatico-dossie §10.8).
 */
const sentDownloadKeys = defineState("my-agent.dossier.sent-download-keys", () => [] as string[]);

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
 *   com nome padronizado `dossie-<slug>.md` (RF07). A entrega respeita
 *   idempotência por geração (RF05), valida disponibilidade (RF02) e emite
 *   eventos de observabilidade (RNF04).
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
      const resolved = resolveDossierDownload(text);

      // Sem dossiê no relatório: comportamento padrão (texto plano).
      if (resolved === null) {
        await channel.telegram.post(text);
        return;
      }

      const sent = new Set(sentDownloadKeys.get());

      // RF05: não dispara um segundo download automático para a mesma geração.
      if (!shouldAutoDownload(sent, resolved.key)) {
        logDossierDownload(
          dossierDownloadEvent(DOSSIER_DOWNLOAD_EVENTS.skipped, {
            key: resolved.key,
            filename: resolved.filename,
            reason: "duplicate",
          }),
        );
        await channel.telegram.post(text);
        return;
      }

      logDossierDownload(
        dossierDownloadEvent(DOSSIER_DOWNLOAD_EVENTS.started, {
          key: resolved.key,
          filename: resolved.filename,
        }),
      );

      try {
        // RF02: só inicia o download se o arquivo estiver disponível.
        const sandbox = await ctx.getSandbox();
        const markdown = await sandbox.readTextFile({ path: resolved.path });
        if (markdown === null) {
          logDossierDownload(
            dossierDownloadEvent(DOSSIER_DOWNLOAD_EVENTS.failed, {
              key: resolved.key,
              filename: resolved.filename,
              reason: "file-not-found",
            }),
          );
          await channel.telegram.post(text);
          return;
        }

        const result = await sendTelegramDocument({
          botToken: await resolveTelegramBotToken(),
          chatId: channel.telegram.chatId,
          document: toMarkdownDocument(markdown, resolved.filename),
          caption: `📄 ${resolved.filename}`,
        });

        if (!result.ok) {
          // RF06: dossiê gerado, mas o download automático falhou.
          logDossierDownload(
            dossierDownloadEvent(DOSSIER_DOWNLOAD_EVENTS.failed, {
              key: resolved.key,
              filename: resolved.filename,
              reason: `http-${result.status}`,
            }),
          );
          console.error(`[telegram] sendDocument falhou (HTTP ${result.status}).`);
          await channel.telegram.post(
            `${text}\n\n⚠️ O dossiê foi gerado, mas não foi possível enviar o download automaticamente.`,
          );
          return;
        }

        // RF05: marca a geração como baixada antes de concluir a entrega.
        sentDownloadKeys.update(() => [...sent, resolved.key]);
        logDossierDownload(
          dossierDownloadEvent(DOSSIER_DOWNLOAD_EVENTS.succeeded, {
            key: resolved.key,
            filename: resolved.filename,
          }),
        );

        // O relatório curto (status, missing[], caminhos) vai como texto.
        await channel.telegram.post(text);
      } catch (error) {
        logDossierDownload(
          dossierDownloadEvent(DOSSIER_DOWNLOAD_EVENTS.failed, {
            key: resolved.key,
            filename: resolved.filename,
            reason: "exception",
          }),
        );
        console.error("[telegram] falha ao despachar dossiê como documento; enviando apenas texto.", error);
        await channel.telegram.post(text);
      }
    },
  },
});
