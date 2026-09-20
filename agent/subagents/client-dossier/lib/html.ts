/**
 * Parsing de HTML com expressões regulares: sem dependências extras e suficiente
 * para meta tags, links, imagens, JSON-LD e texto visível (RF-03, RF-07, RF-08).
 */

const ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/** Lê os atributos de uma tag já capturada como texto. */
export function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let match = ATTR_RE.exec(tag);
  while (match !== null) {
    const name = (match[1] ?? "").toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (name !== "" && !(name in attrs)) attrs[name] = value;
    match = ATTR_RE.exec(tag);
  }
  return attrs;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function codePoint(value: number): string {
  return Number.isFinite(value) && value >= 0 && value <= 0x10ffff
    ? String.fromCodePoint(value)
    : "";
}

/** Decodifica as entidades mais comuns (`&amp;`, `&#233;`, `&#xE9;`). */
export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_all, hex: string) => codePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_all, dec: string) => codePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all);
}

/** Todas as tags de abertura de um nome (`meta`, `link`, `img`, ...). */
export function tags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
}

/** Texto visível aproximado: remove script/style/comentários, tags e normaliza espaços. */
export function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Extração de conteúdo com remoção de ruídos (SKILL-EXT-03): remove navegação, rodapés, banners e modais. */
export function cleanContent(html: string): string {
  const stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, " ")
    .replace(/<dialog\b[^>]*>[\s\S]*?<\/dialog>/gi, " ")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(div|section)[^>]*(cookie|consent|banner|popup|modal)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ");

  return decodeEntities(stripped)
    .replace(/\r\n|\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** Título da página: `<title>`, com fallback para `og:title`/`twitter:title`. */
export function titleOf(html: string): string | undefined {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = match?.[1] === undefined ? "" : decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  if (title !== "") return title;
  const meta = metaTags(html);
  return meta["og:title"] ?? meta["twitter:title"] ?? undefined;
}

/** Idioma declarado em `<html lang="...">`. */
export function langOf(html: string): string | undefined {
  const match = /<html\b[^>]*>/i.exec(html);
  if (match === null) return undefined;
  const lang = parseAttributes(match[0])["lang"];
  return lang === undefined || lang === "" ? undefined : lang;
}

/** Mapa `name|property|itemprop` → `content` (primeira ocorrência vence). */
export function metaTags(html: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const tag of tags(html, "meta")) {
    const attrs = parseAttributes(tag);
    const key = (attrs["name"] ?? attrs["property"] ?? attrs["itemprop"] ?? "").toLowerCase();
    const content = attrs["content"] ?? "";
    if (key === "" || content === "" || key in result) continue;
    result[key] = decodeEntities(content).replace(/\s+/g, " ").trim();
  }
  return result;
}

/** Tags `<link>` já parseadas em atributos. */
export function linkTags(html: string): Record<string, string>[] {
  return tags(html, "link").map(parseAttributes);
}

/** Tags `<img>` já parseadas em atributos. */
export function imageTags(html: string): Record<string, string>[] {
  return tags(html, "img").map(parseAttributes);
}

/** Âncoras da página (`href` + texto) na ordem de aparição. */
export function anchors(html: string): { href: string; text: string }[] {
  const result: { href: string; text: string }[] = [];
  const re = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let match = re.exec(html);
  while (match !== null) {
    const attrs = parseAttributes(match[0]);
    const href = attrs["href"] ?? "";
    if (href !== "") {
      result.push({ href, text: visibleText(match[1] ?? "").slice(0, 200) });
    }
    match = re.exec(html);
  }
  return result;
}

/** Blocos `application/ld+json` válidos (dados estruturados, RF-04/RF-06). */
export function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let match = re.exec(html);
  while (match !== null) {
    const text = (match[1] ?? "").trim();
    if (text !== "") {
      try {
        blocks.push(JSON.parse(text) as unknown);
      } catch {
        // Bloco inválido é ignorado: a extração continua pelas outras fontes.
      }
    }
    match = re.exec(html);
  }
  return blocks;
}

/** Achata `@graph`/arrays de JSON-LD em uma lista de nós. */
export function jsonLdNodes(blocks: readonly unknown[]): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    nodes.push(record);
    if (record["@graph"] !== undefined) visit(record["@graph"]);
  };
  for (const block of blocks) visit(block);
  return nodes;
}

/** CSS inline: conteúdo de `<style>` + `style="..."`, usado na identidade visual. */
export function inlineCss(html: string): string {
  const parts: string[] = [];
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match = styleRe.exec(html);
  while (match !== null) {
    if (match[1] !== undefined) parts.push(match[1]);
    match = styleRe.exec(html);
  }
  const attrRe = /style\s*=\s*"([^"]*)"/gi;
  match = attrRe.exec(html);
  while (match !== null) {
    if (match[1] !== undefined) parts.push(match[1]);
    match = attrRe.exec(html);
  }
  return parts.join("\n");
}

/** URLs de folhas de estilo declaradas no documento. */
export function stylesheetHrefs(html: string): string[] {
  return linkTags(html)
    .filter((attrs) => (attrs["rel"] ?? "").toLowerCase().split(/\s+/).includes("stylesheet"))
    .map((attrs) => attrs["href"] ?? "")
    .filter((href) => href !== "");
}

/** Cabeçalhos (`<h1>`…`<h6>`) com nível e texto. */
export function headings(html: string): { level: number; text: string }[] {
  const result: { level: number; text: string }[] = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match = re.exec(html);
  while (match !== null) {
    const text = visibleText(match[2] ?? "");
    if (text !== "") result.push({ level: Number(match[1] ?? "1"), text: text.slice(0, 300) });
    match = re.exec(html);
  }
  return result;
}

/** Seções aproximadas: cada cabeçalho com o texto que o segue até o próximo. */
export function sectionsOf(html: string): { heading?: string; text: string }[] {
  const matches = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  if (matches.length === 0) {
    const text = visibleText(html);
    return text === "" ? [] : [{ text }];
  }
  const sections: { heading?: string; text: string }[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index]!;
    const next = matches[index + 1];
    const start = (current.index ?? 0) + current[0].length;
    const end = next?.index ?? html.length;
    const heading = visibleText(current[2] ?? "");
    const text = visibleText(html.slice(start, end));
    sections.push({
      ...(heading === "" ? {} : { heading: heading.slice(0, 300) }),
      text: text.slice(0, 1200),
    });
  }
  return sections;
}

/** E-mails e telefones publicados em `mailto:`/`tel:`. */
export function contactLinks(html: string): { emails: string[]; phones: string[] } {
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const match of html.matchAll(/mailto:([^"'?#\s]+)/gi)) {
    if (match[1] !== undefined) emails.add(decodeEntities(match[1]).trim());
  }
  for (const match of html.matchAll(/tel:([^"'?#\s]+)/gi)) {
    if (match[1] !== undefined) phones.add(decodeEntities(match[1]).trim());
  }
  return { emails: [...emails], phones: [...phones] };
}

/** URLs absolutas das folhas de estilo declaradas no documento. */
export function resolveStylesheets(hrefs: readonly string[], baseUrl: string): string[] {
  const resolved: string[] = [];
  for (const href of hrefs) {
    try {
      resolved.push(new URL(href, baseUrl).toString());
    } catch {
      // href inválido é ignorado
    }
  }
  return resolved;
}

/** Sinaliza páginas que dependem de JS (pouco texto e muitos scripts). */
export function looksJsDriven(html: string): boolean {
  const textLength = visibleText(html).length;
  const scriptCount = tags(html, "script").length;
  const hasAppMount = /<div[^>]+id=["'](root|app)["']/i.test(html);
  return textLength < 600 && (scriptCount > 8 || hasAppMount);
}

