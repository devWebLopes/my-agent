/**
 * Núcleo determinístico do "download automático do dossiê"
 * (PRD-Download-automatico-dossie): extração do caminho do relatório final,
 * nome padronizado de arquivo (RF07), chave de idempotência (RF05),
 * empacotamento do Markdown para entrega (RF08) e eventos de observabilidade
 * (RNF04). É a fonte única de verdade compartilhada pelos canais Telegram e web.
 */

export interface DossierDocument {
  readonly buffer: Buffer;
  readonly filename: string;
  readonly mimeType: "text/markdown";
}

export const DOSSIER_PATH_PATTERN = /dossiers[\\/][\w.-]+(?:[\\/][\w.-]+)*[\\/]dossie\.md/u;

/** Converte a string Markdown do dossiê em um Buffer UTF-8 legível. */
export function markdownToBuffer(markdown: string): Buffer {
  return Buffer.from(markdown, "utf8");
}

/** Empacota o Markdown como documento `.md` pronto para upload/download. */
export function toDossierDocument(markdown: string, filename: string): DossierDocument {
  return { buffer: markdownToBuffer(markdown), filename, mimeType: "text/markdown" };
}

/**
 * Extrai o caminho relativo (`dossiers/<slug>/.../dossie.md`) do relatório final
 * do agente. Casa tanto o caminho relativo quanto o absoluto (`meta.markdownPath`).
 */
export function extractDossierMarkdownPath(text: string): string | null {
  const match = DOSSIER_PATH_PATTERN.exec(text);
  return match === null ? null : match[0].replace(/\\/g, "/");
}

/**
 * RF07 — nome padronizado do arquivo: `dossie-<slug>.md`.
 * Preserva a extensão Markdown atual (RF08). O identificador é derivado do slug
 * da entidade pesquisada no caminho do dossiê.
 */
export function dossierDocumentFilename(path: string): string {
  const segments = path.replace(/\\/g, "/").split("/").filter((segment) => segment.length > 0);
  const dossiersIndex = segments.indexOf("dossiers");
  const slug =
    dossiersIndex >= 0 && segments.length > dossiersIndex + 1
      ? segments[dossiersIndex + 1]!
      : "cliente";
  return `dossie-${slug}.md`;
}

/**
 * RF05 — chave de idempotência: identifica de forma estável uma geração/run do
 * dossiê. Cada run possui um `runId` único, refletido no caminho do `dossie.md`.
 */
export function dossierDownloadKey(path: string): string {
  return path.replace(/\\/g, "/");
}

/** RF05 — decide se o download automático deve ser disparado nesta geração. */
export function shouldAutoDownload(sentKeys: ReadonlySet<string>, key: string): boolean {
  return !sentKeys.has(key);
}

/** RF05 — registra uma geração como já baixada, devolvendo um novo conjunto imutável. */
export function recordAutoDownload(
  sentKeys: ReadonlySet<string>,
  key: string,
): ReadonlySet<string> {
  const next = new Set(sentKeys);
  next.add(key);
  return next;
}

/** RNF04 — nomes canônicos dos eventos de observabilidade do download. */
export const DOSSIER_DOWNLOAD_EVENTS = {
  started: "dossier_auto_download_started",
  succeeded: "dossier_auto_download_succeeded",
  failed: "dossier_auto_download_failed",
  skipped: "dossier_auto_download_skipped",
} as const;

export type DossierDownloadEventName =
  (typeof DOSSIER_DOWNLOAD_EVENTS)[keyof typeof DOSSIER_DOWNLOAD_EVENTS];

export interface DossierDownloadEvent {
  readonly event: DossierDownloadEventName;
  readonly key: string;
  readonly filename?: string;
  readonly reason?: string;
}

/** RNF04 — monta um evento de observabilidade estruturado (sem dados sensíveis). */
export function dossierDownloadEvent(
  event: DossierDownloadEventName,
  attrs: { readonly key: string; readonly filename?: string; readonly reason?: string },
): DossierDownloadEvent {
  return { event, ...attrs };
}

export interface ResolvedDossierDownload {
  readonly path: string;
  readonly filename: string;
  readonly key: string;
}

/** Resolve tudo o que um canal precisa para despachar o download, ou `null`. */
export function resolveDossierDownload(text: string): ResolvedDossierDownload | null {
  const path = extractDossierMarkdownPath(text);
  if (path === null) return null;
  return { path, filename: dossierDocumentFilename(path), key: dossierDownloadKey(path) };
}

export function logDossierDownload(event: DossierDownloadEvent): void {
  console.log("[dossier-download]", JSON.stringify(event));
}
