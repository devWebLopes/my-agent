/**
 * Dispatcher do canal Telegram (PRD §2 e §4): transforma o Markdown final do
 * client-dossier em um arquivo `.md` e o envia como Document via Bot API
 * (`sendDocument`), nunca como texto longo no chat.
 */

export interface MarkdownDocument {
  readonly buffer: Buffer;
  readonly filename: string;
  readonly mimeType: "text/markdown";
}

/** Converte a string Markdown do dossiê em um Buffer UTF-8 legível. */
export function markdownToBuffer(markdown: string): Buffer {
  return Buffer.from(markdown, "utf8");
}

/** Empacota o Markdown como documento `.md` pronto para upload. */
export function toMarkdownDocument(markdown: string, filename: string): MarkdownDocument {
  return { buffer: markdownToBuffer(markdown), filename, mimeType: "text/markdown" };
}

const DOSSIER_PATH_PATTERN = /dossiers[\\/][\w.-]+(?:[\\/][\w.-]+)*[\\/]dossie\.md/u;

/**
 * Extrai o caminho relativo (`dossiers/<slug>/.../dossie.md`) do relatório
 * final do agente. Funciona tanto para o caminho relativo quanto para o
 * absoluto (`dossier.meta.markdownPath`), pois casa apenas o trecho `dossiers/…`.
 */
export function extractDossierMarkdownPath(text: string): string | null {
  const match = DOSSIER_PATH_PATTERN.exec(text);
  return match === null ? null : match[0].replace(/\\/g, "/");
}

/** Nome dinâmico do arquivo a partir do caminho do dossiê: `dossie_<slug-do-cliente>.md`. */
export function dossierDocumentFilename(path: string): string {
  const segments = path.replace(/\\/g, "/").split("/").filter((segment) => segment.length > 0);
  const dossiersIndex = segments.indexOf("dossiers");
  const slug =
    dossiersIndex >= 0 && segments.length > dossiersIndex + 1
      ? segments[dossiersIndex + 1]
      : "cliente";
  return `dossie_${slug}.md`;
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
