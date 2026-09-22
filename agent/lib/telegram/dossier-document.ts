/**
 * Dispatcher do canal Telegram (PRD §2 e §4): transforma o Markdown final do
 * client-dossier em um arquivo `.md` e o envia como Document via Bot API
 * (`sendDocument`), nunca como texto longo no chat.
 *
 * A lógica pura (extração de caminho, nome de arquivo, chave de idempotência e
 * empacotamento) vive em `../dossier/download.ts` e é reexportada aqui para
 * compatibilidade com os imports existentes.
 */

import { toDossierDocument, type DossierDocument } from "../dossier/download.ts";

export {
  DOSSIER_PATH_PATTERN,
  dossierDocumentFilename,
  extractDossierMarkdownPath,
  markdownToBuffer,
} from "../dossier/download.ts";

export type MarkdownDocument = DossierDocument;

/** Empacota o Markdown como documento `.md` pronto para upload. */
export function toMarkdownDocument(markdown: string, filename: string): MarkdownDocument {
  return toDossierDocument(markdown, filename);
}

export interface SendTelegramDocumentInput {
  readonly botToken: string;
  readonly chatId: string | number;
  readonly document: MarkdownDocument;
  readonly caption?: string;
  readonly apiBaseUrl?: string;
  /** Fetch injetável para testes e runtimes não-padrão. */
  readonly fetch?: typeof fetch;
}

export interface SendTelegramDocumentResult {
  readonly ok: boolean;
  readonly status: number;
  readonly body: unknown;
}

/**
 * Envia o dossiê via `sendDocument` (multipart/form-data), anexando o buffer
 * `.md` ao `chat_id` do remetente autorizado.
 */
export async function sendTelegramDocument(
  input: SendTelegramDocumentInput,
): Promise<SendTelegramDocumentResult> {
  const fetchImpl = input.fetch ?? fetch;
  const apiBaseUrl = input.apiBaseUrl ?? "https://api.telegram.org";

  const form = new FormData();
  form.append("chat_id", String(input.chatId));
  if (input.caption !== undefined) {
    form.append("caption", input.caption);
  }
  form.append(
    "document",
    new Blob([new Uint8Array(input.document.buffer)], { type: input.document.mimeType }),
    input.document.filename,
  );

  const response = await fetchImpl(`${apiBaseUrl}/bot${input.botToken}/sendDocument`, {
    method: "POST",
    body: form,
  });
  const body: unknown = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}
