import { imageTags, inlineCss, jsonLdBlocks, jsonLdNodes, linkTags, metaTags, parseAttributes } from "./html";
import type {
  ColorEntry,
  ColorRole,
  FaviconRef,
  ImageRef,
  MissingField,
  TypographyEntry,
  TypographyRole,
} from "./schema";
import { resolveUrl } from "./url";

/** Identidade visual (RF-07): cores com papel, tipografia, logo e favicon. */

export type VisualIdentityResult = {
  colors: ColorEntry[];
  typography: TypographyEntry[];
  logo?: ImageRef;
  favicon?: FaviconRef;
  missing: MissingField[];
};

const HEX_RE = /#([0-9a-f]{3}|[0-9a-f]{6})\b/gi;
const RGBA_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)/gi;
const GENERIC_FAMILIES = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "inherit",
  "initial",
  "unset",
  "revert",
  "math",
]);

/** Normaliza `#abc`, `#aabbcc` ou `rgb()` para `#aabbcc` minúsculo. */
export function normalizeHex(value: string): string | undefined {
  const trimmed = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (hex?.[1] !== undefined) {
    const raw = hex[1].toLowerCase();
    return raw.length === 3 ? `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}` : `#${raw}`;
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
    trimmed,
  );
  if (rgb === null) return undefined;
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
  if (!(alpha > 0)) return undefined;
  const channel = (index: number): string =>
    Math.min(255, Math.max(0, Number(rgb[index] ?? "0")))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(1)}${channel(2)}${channel(3)}`;
}

/** Luminância relativa aproximada (0 = preto, 1 = branco). */
export function luminance(hex: string): number {
  const normalized = normalizeHex(hex) ?? "#000000";
  const r = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const g = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const b = Number.parseInt(normalized.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturation(hex: string): number {
  const normalized = normalizeHex(hex) ?? "#000000";
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255,
  );
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  return max === 0 ? 0 : (max - min) / max;
}

/** Frequência das cores declaradas no CSS, da mais usada para a menos usada. */
export function colorFrequency(css: string): { hex: string; count: number }[] {
  const counts = new Map<string, number>();
  const bump = (candidate: string | undefined): void => {
    if (candidate === undefined) return;
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  };
  for (const match of css.matchAll(HEX_RE)) bump(normalizeHex(match[0]));
  for (const match of css.matchAll(RGBA_RE)) bump(normalizeHex(match[0]));
  return [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count);
}

const CSS_VAR_RE = /(--[\w-]+)\s*:\s*([^;}]+)/g;
const RULE_RE = /([^{}]+)\{([^{}]*)\}/g;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}]+)/gi;

/** Mapa das variáveis CSS declaradas (`--primary: #0a0a0a`). */
export function cssVariables(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const match of css.matchAll(CSS_VAR_RE)) {
    const name = match[1] ?? "";
    const value = (match[2] ?? "").trim();
    if (name !== "" && value !== "" && !vars.has(name)) vars.set(name, value);
  }
  return vars;
}

/** Resolve `var(--x, fallback)` até um valor concreto, com profundidade limitada. */
export function resolveValue(value: string, vars: Map<string, string>, depth = 0): string {
  if (depth > 4) return value;
  const varMatch = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/.exec(value);
  if (varMatch === null) return value;
  const resolved = vars.get(varMatch[1] ?? "") ?? varMatch[2] ?? "";
  return resolveValue(value.replace(varMatch[0], resolved), vars, depth + 1);
}

/** Primeira família "real" de uma declaração `font-family`, ignorando genéricos. */
export function primaryFamily(value: string, vars: Map<string, string>): string | undefined {
  for (const part of resolveValue(value, vars).split(",")) {
    const family = part.trim().replace(/^["']|["']$/g, "").trim();
    if (family === "" || GENERIC_FAMILIES.has(family.toLowerCase())) continue;
    if (family.startsWith("var(") || family.startsWith("--")) continue;
    return family;
  }
  return undefined;
}

const HEADING_SELECTOR_RE = /\bh[1-6]\b|\.(heading|title|headline|display)\b|class=["'][^"']*(heading|title|display)/i;
const BODY_SELECTOR_RE = /^(html|body)\b|\.(body|text|paragraph|copy)\b/i;

function topKey(counts: Map<string, number>): string | undefined {
  let best: string | undefined;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function roleFromFontName(name: string): TypographyRole | undefined {
  const normalized = name.replace(/^--/, "").toLowerCase();
  if (/heading|display|title|headline/.test(normalized)) return "heading";
  if (/body|text|sans|base|copy/.test(normalized)) return "body";
  return undefined;
}

/** Tipografia: variáveis explícitas primeiro, depois seletores de título/corpo. */
export function typographyFor(css: string, vars: Map<string, string>): TypographyEntry[] {
  const entries: TypographyEntry[] = [];
  const push = (role: TypographyRole, family: string, source: string): void => {
    if (entries.some((entry) => entry.role === role)) return;
    entries.push({ role, family, source });
  };

  for (const [name, value] of vars) {
    const role = roleFromFontName(name);
    if (role === undefined) continue;
    const family = primaryFamily(value, vars);
    if (family !== undefined) push(role, family, `website:css-var(${name})`);
  }

  const heading = new Map<string, number>();
  const body = new Map<string, number>();
  const all = new Map<string, number>();
  for (const match of css.matchAll(RULE_RE)) {
    const selector = (match[1] ?? "").trim();
    for (const declaration of (match[2] ?? "").matchAll(FONT_FAMILY_RE)) {
      const family = primaryFamily(declaration[1] ?? "", vars);
      if (family === undefined) continue;
      all.set(family, (all.get(family) ?? 0) + 1);
      if (HEADING_SELECTOR_RE.test(selector)) heading.set(family, (heading.get(family) ?? 0) + 1);
      else if (BODY_SELECTOR_RE.test(selector)) body.set(family, (body.get(family) ?? 0) + 1);
    }
  }

  const headingFamily = topKey(heading);
  if (headingFamily !== undefined) push("heading", headingFamily, "website:css(h1-h6)");
  const bodyFamily = topKey(body) ?? topKey(all);
  if (bodyFamily !== undefined) push("body", bodyFamily, "website:css(body/frequência)");
  return entries;
}

/* --------------------------------- logo / favicon -------------------------------- */

const LOGO_HINT_RE = /logo|marca|brand/i;

/** Extrai `logo` de dados estruturados (JSON-LD). */
export function logoFromJsonLd(nodes: readonly Record<string, unknown>[]): string | undefined {
  for (const node of nodes) {
    const logo = node["logo"];
    if (typeof logo === "string" && logo.trim() !== "") return logo.trim();
    if (logo !== null && typeof logo === "object") {
      const url = (logo as Record<string, unknown>)["url"];
      if (typeof url === "string" && url.trim() !== "") return url.trim();
    }
  }
  return undefined;
}

/** Melhor `<img>` candidato a logo (src/alt/class/id com "logo"). */
export function logoFromImages(html: string): { src: string; alt?: string } | undefined {
  let best: { src: string; alt?: string; score: number } | undefined;
  for (const attrs of imageTags(html)) {
    const src = attrs["src"] ?? attrs["data-src"] ?? "";
    if (src === "") continue;
    let score = 0;
    if (LOGO_HINT_RE.test(src)) score = 3;
    else if (LOGO_HINT_RE.test(attrs["alt"] ?? "")) score = 2;
    else if (LOGO_HINT_RE.test(`${attrs["class"] ?? ""} ${attrs["id"] ?? ""}`)) score = 1;
    if (score === 0) continue;
    if (best === undefined || score > best.score) {
      const alt = attrs["alt"];
      best = { src, score, ...(alt === undefined || alt === "" ? {} : { alt }) };
    }
  }
  return best === undefined ? undefined : { src: best.src, ...(best.alt === undefined ? {} : { alt: best.alt }) };
}

/** Formato de imagem derivado da extensão da URL. */
export function formatFromUrl(url: string): string | undefined {
  const match = /\.([a-z0-9]{2,5})(?:$|\?)/i.exec(url);
  const extension = match?.[1]?.toLowerCase();
  if (extension === undefined) return undefined;
  return ["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico", "bmp"].includes(extension)
    ? extension
    : undefined;
}

/** Link de ícone declarado (`rel=icon` tem prioridade sobre `apple-touch-icon`). */
export function iconLink(html: string): { href: string; source: string } | undefined {
  const links = linkTags(html);
  const relTokens = (attrs: Record<string, string>): string[] =>
    (attrs["rel"] ?? "").toLowerCase().split(/\s+/);
  const icon = links.find((attrs) =>
    relTokens(attrs).some((token) => token === "icon" || token === "shortcut"),
  );
  const chosen = icon ?? links.find((attrs) => relTokens(attrs).includes("apple-touch-icon"));
  if (chosen === undefined) return undefined;
  const href = chosen["href"] ?? "";
  if (href === "") return undefined;
  return { href, source: icon === undefined ? "website:link[apple-touch-icon]" : "website:link[rel=icon]" };
}

/* ----------------------------------- extração ----------------------------------- */

/**
 * Identidade visual a partir do HTML + CSS coletados (RF-07).
 * Ordem de evidência: variáveis CSS > meta theme-color > frequência no CSS.
 */
export function extractVisualIdentity(input: {
  html: string;
  css?: string;
  baseUrl: string;
}): VisualIdentityResult {
  const { html, baseUrl } = input;
  const css = `${inlineCss(html)}\n${input.css ?? ""}`;
  const vars = cssVariables(css);
  const meta = metaTags(html);

  const colors: ColorEntry[] = [];
  const pushColor = (role: ColorRole, candidate: string, source: string): void => {
    if (colors.some((entry) => entry.role === role)) return;
    const hex = normalizeHex(candidate);
    if (hex === undefined) return;
    colors.push({ role, hex, source });
  };

  for (const [name, value] of vars) {
    const role = roleFromName(name);
    if (role === undefined) continue;
    pushColor(role, resolveValue(value, vars).trim(), `website:css-var(${name})`);
  }

  const themeColor = meta["theme-color"];
  if (themeColor !== undefined) {
    const hex = normalizeHex(themeColor);
    if (hex !== undefined) {
      pushColor(luminance(hex) > 0.9 ? "background" : "primary", hex, "website:meta[theme-color]");
    }
  }

  const frequency = colorFrequency(css);
  const light = frequency.find((entry) => luminance(entry.hex) > 0.9);
  if (light !== undefined) pushColor("background", light.hex, "website:css(frequência)");
  const dark = frequency.find((entry) => luminance(entry.hex) < 0.25);
  if (dark !== undefined) pushColor("text", dark.hex, "website:css(frequência)");
  const chroma = frequency.filter((entry) => {
    const level = luminance(entry.hex);
    return saturation(entry.hex) > 0.12 && level > 0.05 && level < 0.95;
  });
  (["primary", "secondary", "accent"] as const).forEach((role, index) => {
    const entry = chroma[index];
    if (entry !== undefined) pushColor(role, entry.hex, "website:css(frequência)");
  });

  const typography = typographyFor(css, vars);

  const nodes = jsonLdNodes(jsonLdBlocks(html));
  let logo: ImageRef | undefined;
  const jsonLdLogo = logoFromJsonLd(nodes);
  if (jsonLdLogo !== undefined) {
    const url = resolveUrl(baseUrl, jsonLdLogo);
    const format = url === undefined ? undefined : formatFromUrl(url);
    if (url !== undefined) {
      logo = { url, source: "website:json-ld(logo)", ...(format === undefined ? {} : { format }) };
    }
  }
  const imageLogo = logoFromImages(html);
  if (logo === undefined && imageLogo !== undefined) {
    const url = resolveUrl(baseUrl, imageLogo.src);
    if (url !== undefined) {
      const format = formatFromUrl(url);
      logo = { url, source: "website:img[logo]", ...(format === undefined ? {} : { format }) };
    }
  }
  if (logo === undefined) {
    const apple = linkTags(html).find((attrs) =>
      (attrs["rel"] ?? "").toLowerCase().split(/\s+/).includes("apple-touch-icon"),
    );
    const href = apple?.["href"] ?? "";
    if (href !== "") {
      const url = resolveUrl(baseUrl, href);
      if (url !== undefined) logo = { url, source: "website:link[apple-touch-icon]", format: "png" };
    }
  }

  let favicon: FaviconRef | undefined;
  const icon = iconLink(html);
  if (icon !== undefined) {
    const url = resolveUrl(baseUrl, icon.href);
    if (url !== undefined) favicon = { url, source: icon.source };
  }

  const missing: MissingField[] = [];
  if (colors.length === 0) {
    missing.push({
      field: "visualIdentity.colors",
      reason: "nenhuma cor declarada em CSS ou meta theme-color",
    });
  }
  if (typography.length === 0) {
    missing.push({
      field: "visualIdentity.typography",
      reason: "nenhuma declaração font-family encontrada no HTML/CSS",
    });
  }
  if (logo === undefined) {
    missing.push({
      field: "visualIdentity.logo",
      reason: "sem logo: nenhum img com 'logo', JSON-LD logo ou apple-touch-icon",
    });
  }
  if (favicon === undefined) {
    missing.push({
      field: "visualIdentity.favicon",
      reason: 'nenhum <link rel="icon"> declarado (sem fallback especulativo para /favicon.ico)',
    });
  }

  return {
    colors,
    typography,
    ...(logo === undefined ? {} : { logo }),
    ...(favicon === undefined ? {} : { favicon }),
    missing,
  };
}

/** Ordem importa: o primeiro papel encontrado no nome da variável vence. */
const ROLE_KEYWORDS: { role: ColorRole; keywords: string[] }[] = [
  { role: "background", keywords: ["background", "bg", "surface", "base"] },
  { role: "text", keywords: ["text", "foreground", "fg", "ink"] },
  { role: "primary", keywords: ["primary", "brand", "main"] },
  { role: "secondary", keywords: ["secondary", "support"] },
  { role: "accent", keywords: ["accent", "cta", "highlight"] },
];

/** Descobre o papel de uma variável CSS a partir do próprio nome (`--color-primary`). */
export function roleFromName(name: string): ColorRole | undefined {
  const normalized = name
    .replace(/^--/, "")
    .toLowerCase()
    .replace(/(^|-|_)color(-|_|$)/g, "-");
  for (const { role, keywords } of ROLE_KEYWORDS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return role;
  }
  return undefined;
}
