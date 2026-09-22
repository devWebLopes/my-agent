import { defineState } from "eve/context";
import { eveChannel } from "eve/channels/eve";
import { localDev, none, vercelOidc } from "eve/channels/auth";

import {
  DOSSIER_DOWNLOAD_EVENTS,
  dossierDownloadEvent,
  logDossierDownload,
  resolveDossierDownload,
  shouldAutoDownload,
} from "../lib/dossier/download.ts";

/**
 * RF05 — idempotência por geração no canal web (HTTP): evita confirmar duas
 * vezes o mesmo download automático para uma mesma run do dossiê.
 */
const sentDownloadKeys = defineState("my-agent.dossier.sent-download-keys", () => [] as string[]);

/**
 * Canal HTTP/eve (web).
 *
 * Além do contrato padrão `/eve/v1`, o handler `message.completed` implementa o
 * lado "web" do download automático (PRD-Download-automatico-dossie): quando o
 * relatório final referencia um `dossiers/…/dossie.md`, o arquivo é validado
 * quanto à disponibilidade (RF02), deduplicado por geração (RF05) e o evento de
 * conclusão é registrado (RNF04) com o caminho resolvido para o cliente baixar.
 *
 * A entrega do arquivo em si é responsabilidade da aplicação cliente (frontend),
 * que consome os caminhos devolvidos no relatório; o formato permanece `.md`
 * (RF08). Um navegador só consegue um "download automático" real se o frontend
 * orquestrar o disparo — fora do escopo deste backend (PRD §4).
 */
export default eveChannel({
  auth: [
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
    // Allow requests in production (use none() for public demo / testing)
    none(),
  ],
  events: {
    async "message.completed"(data, _channel, ctx) {
      if (data.finishReason === "tool-calls" || data.message === null) return;

      const resolved = resolveDossierDownload(data.message);
      if (resolved === null) return;

      const sent = new Set(sentDownloadKeys.get());
      if (!shouldAutoDownload(sent, resolved.key)) {
        logDossierDownload(
          dossierDownloadEvent(DOSSIER_DOWNLOAD_EVENTS.skipped, {
            key: resolved.key,
            filename: resolved.filename,
            reason: "duplicate",
          }),
        );
        return;
      }

      logDossierDownload(
        dossierDownloadEvent(DOSSIER_DOWNLOAD_EVENTS.started, {
          key: resolved.key,
          filename: resolved.filename,
        }),
      );

      try {
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
          return;
        }

        sentDownloadKeys.update(() => [...sent, resolved.key]);
        logDossierDownload(
          dossierDownloadEvent(DOSSIER_DOWNLOAD_EVENTS.succeeded, {
            key: resolved.key,
            filename: resolved.filename,
          }),
        );
      } catch (error) {
        logDossierDownload(
          dossierDownloadEvent(DOSSIER_DOWNLOAD_EVENTS.failed, {
            key: resolved.key,
            filename: resolved.filename,
            reason: "exception",
          }),
        );
        console.error("[eve] falha ao validar dossiê para download automático.", error);
      }
    },
  },
});
