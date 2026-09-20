/**
 * Fontes e helpers compartilhados pelos evals de `client-dossier` (PRD §11).
 * Sobrescreva as URLs por variáveis de ambiente para apontar a casos conhecidos.
 */

import type { EveEvalContext, EveEvalSession, EveEvalTurn } from "eve/evals";

export type EvalSource = { type: string; url: string };

export const FIXTURES = {
  /** Site completo: favicon, meta tags e CSS. */
  website: process.env["DOSSIER_EVAL_WEBSITE"] ?? "https://www.wikipedia.org",
  /** Site com meta tags ricas e identidade visual forte. */
  websiteRich: process.env["DOSSIER_EVAL_WEBSITE_RICH"] ?? "https://github.com",
  /** Site SPA / JS-driven. */
  websiteJsDriven: process.env["DOSSIER_EVAL_WEBSITE_JS"] ?? "https://app.slack.com",
  /** Site mínimo, sem logo/favicon declarado (§11 "Site sem logo"). */
  websiteWithoutLogo: process.env["DOSSIER_EVAL_WEBSITE_NO_LOGO"] ?? "https://example.com",
  /** Ficha no Google Maps (exige GOOGLE_MAPS_API_KEY para dados completos). */
  maps: process.env["DOSSIER_EVAL_MAPS"] ?? "https://www.google.com/maps/place/Torre+Eiffel",
  /** Perfil público de rede social (frequentemente bloqueia coleta anônima). */
  instagram: process.env["DOSSIER_EVAL_INSTAGRAM"] ?? "https://www.instagram.com/nasa",
  /** Perfil de Facebook para validação de fallback/degradação. */
  facebook: process.env["DOSSIER_EVAL_FACEBOOK"] ?? "https://www.facebook.com/zuck",
  /** CNPJ válido de consulta pública (Banco do Brasil). */
  cnpj: process.env["DOSSIER_EVAL_CNPJ"] ?? "00.000.000/0001-91",
  /** CNPJ com dígitos verificadores inválidos. */
  cnpjInvalid: process.env["DOSSIER_EVAL_CNPJ_INVALID"] ?? "00.000.000/0000-00",
  /** URL que redireciona para outra origem (§11 "Redirect"). */
  redirect: process.env["DOSSIER_EVAL_REDIRECT"] ?? "http://wikipedia.org",
  /** URL que responde 404 (§11 "Fonte quebrada"). */
  broken: process.env["DOSSIER_EVAL_BROKEN"] ?? "https://example.com/pagina-que-nao-existe-404",
} as const;

/** Prompt em linguagem natural que deve fazer o agente raiz delegar ao subagente. */
export function dossierPrompt(sources: readonly EvalSource[]): string {
  const lines = sources.map((source) => `- ${source.type}: ${source.url}`).join("\n");
  return [
    "Monte o dossiê do cliente a partir das fontes abaixo e me diga onde o dossiê foi salvo,",
    "se ficou completo ou parcial e quais campos ficaram faltando.",
    lines,
  ].join("\n");
}

/** Compara o texto do dossiê (JSON) sem depender de um matcher tipado. */
export function includesInOutput(token: string): (value: unknown) => boolean {
  return (value) => JSON.stringify(value ?? "").includes(token);
}

/* ---------------------- execução de ponta a ponta (§11) ---------------------- */

export type DossierRun = {
  /** Turno do pai que só confirma que a delegação foi aceita. */
  readonly accepted: EveEvalTurn;
  /** Turno em que eve entrega o resultado da tarefa de background ao pai. */
  readonly delivered: EveEvalTurn;
  /** Sessão filha (`client-dossier`): onde as tools de coleta realmente rodam. */
  readonly child: EveEvalSession;
};

/**
 * Executa um caso do §11 de ponta a ponta.
 *
 * Um subagente declarado roda como tarefa de **background**: o turno do pai
 * termina assim que a delegação é aceita (`{ status: "working" }`) e o
 * resultado chega em um turno posterior (`message.received` com o dossiê). O
 * `subagent.called` que carrega o `childSessionId` chega nesse mesmo turno de
 * entrega — é por ele que o eval anexa a sessão filha e observa as tools de
 * coleta (`fetch_url`, `extract_visual_identity`, `build_dossier`, ...).
 *
 * Devolve `undefined` — registrando a gate que falhou — quando a entrega não
 * traz a delegação: sem `childSessionId` não há coleta para observar.
 */
export async function runDossier(
  t: EveEvalContext,
  sources: readonly EvalSource[],
): Promise<DossierRun | undefined> {
  const live = await t.start(dossierPrompt(sources));
  const accepted = await live.result();

  // watchTurn retoma a sessão do pai depois dos eventos já consumidos: o
  // próximo limite é o turno de entrega da tarefa de background.
  const delivery = t.target.watchTurn(live.sessionId, { startIndex: t.events.length });

  let delivered: EveEvalTurn;
  try {
    delivered = await delivery.result();
  } catch (error) {
    // A entrega só chega quando o filho sai de `working`. Se o stream do pai
    // fechar antes disso (fonte lenta demais para a janela do stream), registra
    // a gate em vez de estourar o eval — o motivo fica no artefato.
    t.log(`turno de entrega não observado: ${String(error)}`);
    t.eventsSatisfy("turno de entrega observado", () => false);
    return undefined;
  }

  let childSessionId: string | undefined;
  for (const event of delivered.events) {
    if (event.type === "subagent.called") childSessionId = event.data.childSessionId;
  }

  if (childSessionId === undefined) {
    t.event("subagent.called").label("delegação observável").gate();
    return undefined;
  }

  return { accepted, delivered, child: await t.target.attachSession(childSessionId) };
}

/** Texto do turno: mensagem do assistente + payloads (notificações de tarefa). */
export function turnText(turn: EveEvalTurn): string {
  return JSON.stringify(turn.events);
}

/**
 * Dossiê entregue na notificação de conclusão da tarefa de background
 * (`Background task … is completed.` + `Result:` + JSON do subagente).
 */
export function deliveredDossier(turn: EveEvalTurn): unknown {
  for (const event of turn.events) {
    if (event.type !== "message.received") continue;
    const marker = event.data.message?.indexOf("Result:");
    if (marker === undefined || marker < 0) continue;
    const start = event.data.message.indexOf("{", marker);
    const end = event.data.message.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      return JSON.parse(event.data.message.slice(start, end + 1)) as unknown;
    } catch {
      continue;
    }
  }
  return undefined;
}

/** Campo do dossiê entregue (ex.: `meta`, `missing`, `social`, `maps`, `sources`). */
export function deliveredField(turn: EveEvalTurn, key: string): unknown {
  const dossier = deliveredDossier(turn);
  if (dossier === null || typeof dossier !== "object") return undefined;
  return (dossier as Record<string, unknown>)[key];
}

/** `meta.status` do dossiê entregue (`complete`/`partial`), quando legível. */
export function deliveredStatus(turn: EveEvalTurn): unknown {
  const meta = deliveredField(turn, "meta");
  if (meta === null || typeof meta !== "object") return undefined;
  return (meta as Record<string, unknown>)["status"];
}

/** O `missing[]` do dossiê entregue cita um campo com este prefixo? */
export function deliveredMissingIncludes(turn: EveEvalTurn, prefix: string): boolean {
  const missing = deliveredField(turn, "missing");
  if (!Array.isArray(missing)) return false;
  return missing.some(
    (entry) =>
      entry !== null &&
      typeof entry === "object" &&
      String((entry as Record<string, unknown>)["field"] ?? "").startsWith(prefix),
  );
}

/** Alguma fonte do dossiê ficou registrada como `partial`/`failed`? */
export function hasUnhealthySource(turn: EveEvalTurn): boolean {
  const sources = deliveredField(turn, "sources");
  if (!Array.isArray(sources)) return false;
  return sources.some(
    (entry) =>
      entry !== null &&
      typeof entry === "object" &&
      ["partial", "failed"].includes(String((entry as Record<string, unknown>)["status"])),
  );
}

/** `sources[].finalUrl` do dossiê entregue (a URL depois dos redirects, RF-05). */
export function deliveredFinalUrl(turn: EveEvalTurn): unknown {
  const sources = deliveredField(turn, "sources");
  if (!Array.isArray(sources)) return undefined;
  for (const entry of sources) {
    if (entry === null || typeof entry !== "object") continue;
    const finalUrl = (entry as Record<string, unknown>)["finalUrl"];
    if (typeof finalUrl === "string" && finalUrl !== "") return finalUrl;
  }
  return undefined;
}

/** Predicado para `satisfies`: lista com pelo menos um elemento. */
export function nonEmptyList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/** Retorna um campo do objeto `business` do dossiê entregue. */
export function deliveredBusinessField(turn: EveEvalTurn, key: string): unknown {
  const business = deliveredField(turn, "business");
  if (business === null || typeof business !== "object") return undefined;
  return (business as Record<string, unknown>)[key];
}

/** Retorna os assets baixados no dossiê entregue. */
export function deliveredAssets(turn: EveEvalTurn): unknown[] {
  const assets = deliveredField(turn, "assets");
  return Array.isArray(assets) ? assets : [];
}

/** Retorna a lista de confiança/proveniência do dossiê entregue. */
export function deliveredConfidence(turn: EveEvalTurn): unknown[] {
  const conf = deliveredField(turn, "confidence");
  return Array.isArray(conf) ? conf : [];
}

/**
 * Calcula uma pontuação de qualidade (0-100) baseada nos campos preenchidos no dossiê.
 */
export function qualityScore(turn: EveEvalTurn): number {
  const dossier = deliveredDossier(turn);
  if (dossier === null || typeof dossier !== "object") return 0;
  const d = dossier as Record<string, unknown>;

  let score = 0;
  // Presença de business (até 30 pontos)
  if (d["business"] && typeof d["business"] === "object") {
    const b = d["business"] as Record<string, unknown>;
    if (b["name"]) score += 10;
    if (b["legalName"]) score += 5;
    if (b["description"]) score += 10;
    if (b["cnpj"]) score += 5;
  }
  // Identidade visual (até 20 pontos)
  if (d["visualIdentity"] && typeof d["visualIdentity"] === "object") {
    const v = d["visualIdentity"] as Record<string, unknown>;
    if (v["logoUrl"]) score += 10;
    if (Array.isArray(v["colors"]) && v["colors"].length > 0) score += 5;
    if (v["typography"]) score += 5;
  }
  // Contato / localidade (até 20 pontos)
  if (d["contact"] && typeof d["contact"] === "object") {
    const c = d["contact"] as Record<string, unknown>;
    if (Array.isArray(c["phones"]) && c["phones"].length > 0) score += 5;
    if (Array.isArray(c["emails"]) && c["emails"].length > 0) score += 5;
    if (c["address"]) score += 10;
  }
  // Assets locais persistidos (até 15 pontos)
  if (Array.isArray(d["assets"]) && d["assets"].length > 0) {
    score += 15;
  }
  // Fontes saudáveis (até 15 pontos)
  if (Array.isArray(d["sources"]) && d["sources"].length > 0) {
    const ok = (d["sources"] as Record<string, unknown>[]).filter((s) => s["status"] === "ok").length;
    score += Math.min(15, ok * 5);
  }

  return Math.min(100, score);
}
