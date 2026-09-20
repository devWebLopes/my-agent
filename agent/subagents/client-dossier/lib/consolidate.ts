import { confidenceRank, sourcePriority } from "./schema";
import type {
  Asset,
  Business,
  ColorEntry,
  ColorRole,
  ConfidenceLevel,
  ConfidenceRecord,
  Dossier,
  DossierFragment,
  DossierRequest,
  FaviconRef,
  Field,
  ImageRef,
  Maps,
  SocialProfile,
  SourceRecord,
  TypographyEntry,
  TypographyRole,
} from "./schema";
import { hostOf, slugify } from "./url";

/**
 * Consolidação (RF-09, RF-10, RF-11, RF-13): deduplica, resolve conflitos por
 * prioridade de fonte (site > Google Maps > rede social), mantém provenance e
 * sinaliza campos ausentes.
 */

const BUSINESS_KEYS = [
  "name",
  "legalName",
  "cnpj",
  "category",
  "description",
  "tagline",
  "services",
  "serviceAreas",
  "phone",
  "email",
  "website",
  "address",
  "hours",
  "foundedDate",
  "status",
  "cnae",
  "qsa",
  "capitalSocial",
] as const;

const MAPS_KEYS = [
  "placeId",
  "category",
  "rating",
  "reviewCount",
  "hours",
  "phone",
  "website",
  "address",
  "photosCount",
] as const;

const CONTACT_KEYS = new Set(["phone", "email", "website", "address", "hours"]);

/** Campos cuja ausência rebaixa o dossiê para `partial`. */
const CRITICAL_FIELDS = ["business.name", "business.description", "visualIdentity.colors"];

type BusinessKey = (typeof BUSINESS_KEYS)[number];
type MapsKey = (typeof MAPS_KEYS)[number];

type Candidate = {
  value: unknown;
  source: string;
  confidence: ConfidenceLevel;
  note?: string;
  priority: number;
  order: number;
};

/** Hash FNV-1a curto, usado para ids estáveis de dossiê. */
export function hashOf(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 6);
}

/** Id do dossiê: `clientId`/nome + hash curto das fontes (estável entre execuções). */
export function dossierIdOf(request: DossierRequest): string {
  const base =
    request.clientId ??
    request.name ??
    hostOf(request.sources[0]?.url ?? "") ??
    "cliente";
  const slug = slugify(base) === "" ? "cliente" : slugify(base);
  const fingerprint = hashOf(request.sources.map((source) => source.url).sort().join("|"));
  return `${slug}-${fingerprint}`;
}

function label(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

/** Escolhe o vencedor (fonte > confiança > ordem) e registra conflitos. */
function pick(candidates: readonly Candidate[]): { winner?: Candidate; conflicts: string[] } {
  if (candidates.length === 0) return { conflicts: [] };
  const sorted = [...candidates].sort(
    (a, b) =>
      b.priority - a.priority ||
      confidenceRank[b.confidence] - confidenceRank[a.confidence] ||
      a.order - b.order,
  );
  const winner = sorted[0];
  const conflicts: string[] = [];
  for (const other of sorted.slice(1)) {
    if (JSON.stringify(other.value) === JSON.stringify(winner?.value)) continue;
    conflicts.push(
      `conflito: ${label(winner?.value)} (${winner?.source}) prevaleceu sobre ${label(other.value)} (${other.source})`,
    );
  }
  return { winner, conflicts };
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function addCandidate(
  bucket: Map<string, Candidate[]>,
  key: string,
  entry: Field<unknown> | undefined,
  fragment: DossierFragment,
  order: number,
): void {
  if (entry === undefined || !isPresent(entry.value)) return;
  const list = bucket.get(key) ?? [];
  list.push({
    value: entry.value,
    source: entry.source,
    confidence: entry.confidence,
    ...(entry.note === undefined ? {} : { note: entry.note }),
    priority: sourcePriority[fragment.source.type],
    order,
  });
  bucket.set(key, list);
}

type Resolution = {
  value: unknown;
  source: string;
  confidence: ConfidenceLevel;
  note?: string;
};

function resolve(
  bucket: Map<string, Candidate[]>,
  key: string,
  confidence: ConfidenceRecord[],
  fieldName: string,
): Resolution | undefined {
  const { winner, conflicts } = pick(bucket.get(key) ?? []);
  if (winner === undefined) return undefined;
  const notes = [winner.note, ...conflicts].filter((note): note is string => note !== undefined);
  confidence.push({
    field: fieldName,
    level: winner.confidence,
    source: winner.source,
    ...(notes.length === 0 ? {} : { note: notes.join(" | ") }),
  });
  return {
    value: winner.value,
    source: winner.source,
    confidence: winner.confidence,
    ...(notes.length === 0 ? {} : { note: notes.join(" | ") }),
  };
}

/** Confiança inferida da evidência: marcação explícita é mais forte que heurística. */
export function confidenceFromSource(source: string): ConfidenceLevel {
  if (/css-var|json-ld|meta\[|link\[/.test(source)) return "high";
  if (/frequência|frequencia/.test(source)) return "low";
  return "medium";
}

function mergeSocial(base: SocialProfile, incoming: SocialProfile): SocialProfile {
  const handle = base.handle ?? incoming.handle;
  const bio = base.bio ?? incoming.bio;
  const followers = base.followers ?? incoming.followers;
  const links = base.links ?? incoming.links;
  return {
    platform: base.platform,
    url: base.url,
    ...(handle === undefined ? {} : { handle }),
    ...(bio === undefined ? {} : { bio }),
    ...(followers === undefined ? {} : { followers }),
    ...(links === undefined ? {} : { links }),
  };
}

export type ConsolidateInput = {
  request: DossierRequest;
  fragments: readonly DossierFragment[];
  createdAt?: string;
  version?: number;
};

/** Consolida os fragmentos no dossiê final validável (RF-09 a RF-13). */
export function consolidate(input: ConsolidateInput): Dossier {
  const fragments = input.fragments;
  const business = new Map<string, Candidate[]>();
  const maps = new Map<string, Candidate[]>();
  const colors = new Map<string, Candidate[]>();
  const typography = new Map<string, Candidate[]>();
  const logos: Candidate[] = [];
  const favicons: Candidate[] = [];
  const socialMap = new Map<string, { profile: SocialProfile; priority: number; rank: number }>();
  const assetMap = new Map<string, Asset>();
  const confidence: ConfidenceRecord[] = [];

  fragments.forEach((fragment, order) => {
    const priority = sourcePriority[fragment.source.type];
    for (const key of BUSINESS_KEYS) {
      addCandidate(business, key, fragment.business?.[key], fragment, order);
    }
    for (const key of MAPS_KEYS) {
      addCandidate(maps, key, fragment.maps?.[key], fragment, order);
    }

    for (const social of fragment.social ?? []) {
      const key = `${social.platform}:${(social.handle ?? social.url).toLowerCase()}`;
      const profile: SocialProfile = {
        platform: social.platform,
        url: social.url,
        ...(social.handle === undefined ? {} : { handle: social.handle }),
        ...(social.bio === undefined ? {} : { bio: social.bio }),
        ...(social.followers === undefined ? {} : { followers: social.followers }),
        ...(social.links === undefined ? {} : { links: social.links }),
      };
      const rank = confidenceRank[social.confidence];
      const existing = socialMap.get(key);
      if (existing === undefined) {
        socialMap.set(key, { profile, priority, rank });
        continue;
      }
      const superior =
        priority > existing.priority || (priority === existing.priority && rank > existing.rank);
      if (superior) {
        socialMap.set(key, { profile: mergeSocial(profile, existing.profile), priority, rank });
      } else {
        existing.profile = mergeSocial(existing.profile, profile);
      }
    }

    for (const color of fragment.visualIdentity?.colors ?? []) {
      const list = colors.get(color.role) ?? [];
      list.push({
        value: color.hex,
        source: color.source,
        confidence: confidenceFromSource(color.source),
        priority,
        order,
      });
      colors.set(color.role, list);
    }

    for (const entry of fragment.visualIdentity?.typography ?? []) {
      const list = typography.get(entry.role) ?? [];
      list.push({
        value: entry.family,
        source: entry.source,
        confidence: confidenceFromSource(entry.source),
        priority,
        order,
      });
      typography.set(entry.role, list);
    }

    const logo = fragment.visualIdentity?.logo;
    if (logo !== undefined) {
      logos.push({
        value: logo,
        source: logo.source,
        confidence: confidenceFromSource(logo.source),
        priority,
        order,
      });
    }
    const favicon = fragment.visualIdentity?.favicon;
    if (favicon !== undefined) {
      favicons.push({
        value: favicon,
        source: favicon.source,
        confidence: confidenceFromSource(favicon.source),
        priority,
        order,
      });
    }

    for (const asset of fragment.assets ?? []) {
      const existing = assetMap.get(asset.url);
      if (existing === undefined) {
        assetMap.set(asset.url, asset);
        continue;
      }
      const localPath = existing.localPath ?? asset.localPath;
      const sha256 = existing.sha256 ?? asset.sha256;
      const bytes = existing.bytes ?? asset.bytes;
      const alt = existing.alt ?? asset.alt;
      assetMap.set(asset.url, {
        ...existing,
        ...(localPath === undefined ? {} : { localPath }),
        ...(sha256 === undefined ? {} : { sha256 }),
        ...(bytes === undefined ? {} : { bytes }),
        ...(alt === undefined ? {} : { alt }),
      });
    }
  });

  const resolved = new Map<string, Resolution>();
  for (const key of BUSINESS_KEYS) {
    const entry = resolve(business, key, confidence, `business.${key}`);
    if (entry !== undefined) resolved.set(`business.${key}`, entry);
  }
  for (const key of MAPS_KEYS) {
    const entry = resolve(maps, key, confidence, `maps.${key}`);
    if (entry !== undefined) resolved.set(`maps.${key}`, entry);
  }

  const businessValue = (key: BusinessKey): string | undefined => {
    const value = resolved.get(`business.${key}`)?.value;
    return typeof value === "string" ? value : undefined;
  };
  const businessList = (key: BusinessKey): string[] | undefined => {
    const value = resolved.get(`business.${key}`)?.value;
    return Array.isArray(value) ? (value as string[]) : undefined;
  };
  const mapsValue = <T>(key: MapsKey): T | undefined => resolved.get(`maps.${key}`)?.value as T | undefined;

  const colorEntries: ColorEntry[] = [];
  for (const [role, candidates] of colors) {
    const { winner, conflicts } = pick(candidates);
    if (winner === undefined) continue;
    const hex = String(winner.value);
    colorEntries.push({ role: role as ColorRole, hex, source: winner.source });
    confidence.push({
      field: `visualIdentity.colors.${role}`,
      level: winner.confidence,
      source: winner.source,
      ...(conflicts.length === 0 ? {} : { note: conflicts.join(" | ") }),
    });
  }

  const typographyEntries: TypographyEntry[] = [];
  for (const [role, candidates] of typography) {
    const { winner, conflicts } = pick(candidates);
    if (winner === undefined) continue;
    typographyEntries.push({
      role: role as TypographyRole,
      family: String(winner.value),
      source: winner.source,
    });
    confidence.push({
      field: `visualIdentity.typography.${role}`,
      level: winner.confidence,
      source: winner.source,
      ...(conflicts.length === 0 ? {} : { note: conflicts.join(" | ") }),
    });
  }

  const logoPick = pick(logos);
  const logoRef = logoPick.winner?.value as ImageRef | undefined;
  if (logoPick.winner !== undefined) {
    confidence.push({
      field: "visualIdentity.logo",
      level: logoPick.winner.confidence,
      source: logoPick.winner.source,
      ...(logoPick.conflicts.length === 0 ? {} : { note: logoPick.conflicts.join(" | ") }),
    });
  }

  const faviconPick = pick(favicons);
  const faviconRef = faviconPick.winner?.value as FaviconRef | undefined;
  if (faviconPick.winner !== undefined) {
    confidence.push({
      field: "visualIdentity.favicon",
      level: faviconPick.winner.confidence,
      source: faviconPick.winner.source,
    });
  }

  const missing = new Map<string, string>();
  for (const fragment of fragments) {
    for (const item of fragment.missing ?? []) {
      if (!missing.has(item.field)) missing.set(item.field, item.reason);
    }
  }
  const requireBusiness = (key: BusinessKey, field: string, reason: string): void => {
    if (!resolved.has(`business.${key}`) && !missing.has(field)) missing.set(field, reason);
  };
  requireBusiness("name", "business.name", "nome do negócio não encontrado nas fontes");
  requireBusiness("description", "business.description", "descrição não encontrada nas fontes");
  requireBusiness("category", "business.category", "categoria/nicho não identificado");
  requireBusiness("phone", "business.contact.phone", "telefone não publicado nas fontes");
  requireBusiness("email", "business.contact.email", "e-mail não publicado nas fontes");
  requireBusiness("address", "business.contact.address", "endereço não publicado nas fontes");
  requireBusiness("hours", "business.contact.hours", "horário de funcionamento não publicado");
  if (socialMap.size === 0 && !missing.has("social")) {
    missing.set("social", "nenhum perfil social coletado");
  }
  if (maps.size === 0 && !missing.has("maps")) {
    missing.set("maps", "ficha de Google Maps não coletada (ou GOOGLE_MAPS_API_KEY ausente)");
  }
  if (colorEntries.length === 0 && !missing.has("visualIdentity.colors")) {
    missing.set("visualIdentity.colors", "cores não identificadas");
  }
  if (typographyEntries.length === 0 && !missing.has("visualIdentity.typography")) {
    missing.set("visualIdentity.typography", "tipografia não identificada");
  }
  if (logoRef === undefined && !missing.has("visualIdentity.logo")) {
    missing.set("visualIdentity.logo", "logo não identificado");
  }
  if (faviconRef === undefined && !missing.has("visualIdentity.favicon")) {
    missing.set("visualIdentity.favicon", 'sem <link rel="icon"> declarado');
  }

  const phone = businessValue("phone");
  const email = businessValue("email");
  const website = businessValue("website");
  const address = businessValue("address");
  const hours = businessList("hours");
  const name = businessValue("name");
  const legalName = businessValue("legalName");
  const cnpj = businessValue("cnpj");
  const category = businessValue("category");
  const description = businessValue("description");
  const tagline = businessValue("tagline");
  const services = businessList("services");
  const serviceAreas = businessList("serviceAreas");
  const foundedDate = businessValue("foundedDate");
  const registrationStatus = businessValue("status");
  const cnae = businessValue("cnae");
  const qsa = businessList("qsa");
  const capitalSocial = businessValue("capitalSocial");

  const businessOut: Business = {
    ...(name === undefined ? {} : { name }),
    ...(legalName === undefined ? {} : { legalName }),
    ...(cnpj === undefined ? {} : { cnpj }),
    ...(category === undefined ? {} : { category }),
    ...(description === undefined ? {} : { description }),
    ...(tagline === undefined ? {} : { tagline }),
    ...(services === undefined ? {} : { services }),
    ...(serviceAreas === undefined ? {} : { serviceAreas }),
    ...(foundedDate === undefined ? {} : { foundedDate }),
    ...(registrationStatus === undefined ? {} : { status: registrationStatus }),
    ...(cnae === undefined ? {} : { cnae }),
    ...(qsa === undefined ? {} : { qsa }),
    ...(capitalSocial === undefined ? {} : { capitalSocial }),
    contact: {
      ...(phone === undefined ? {} : { phone }),
      ...(email === undefined ? {} : { email }),
      ...(website === undefined ? {} : { website }),
      ...(address === undefined ? {} : { address }),
      ...(hours === undefined ? {} : { hours }),
    },
  };

  const socialOut: SocialProfile[] = [...socialMap.values()]
    .map((entry) => entry.profile)
    .sort((a, b) => a.platform.localeCompare(b.platform));

  const placeId = mapsValue<string>("placeId");
  const mapsCategory = mapsValue<string>("category");
  const rating = mapsValue<number>("rating");
  const reviewCount = mapsValue<number>("reviewCount");
  const mapsHours = mapsValue<string[]>("hours");
  const photosCount = mapsValue<number>("photosCount");
  const mapsAddress = mapsValue<string>("address");
  const mapsOut: Maps | undefined =
    maps.size === 0
      ? undefined
      : {
          ...(placeId === undefined ? {} : { placeId }),
          ...(mapsCategory === undefined ? {} : { category: mapsCategory }),
          ...(rating === undefined ? {} : { rating }),
          ...(reviewCount === undefined ? {} : { reviewCount }),
          ...(mapsHours === undefined ? {} : { hours: mapsHours }),
          ...(photosCount === undefined ? {} : { photosCount }),
          ...(mapsAddress === undefined ? {} : { address: mapsAddress }),
        };

  // `partial` quando alguma fonte falhou, um campo crítico está ausente ou não
  // houve nenhuma evidência externa (nem Maps, nem rede social) — RF-13.
  const failedSources = fragments.filter((fragment) => fragment.source.status !== "ok");
  const criticalMissing = CRITICAL_FIELDS.filter((field) => missing.has(field));
  const status: "complete" | "partial" =
    failedSources.length > 0 || criticalMissing.length > 0 || (socialOut.length === 0 && mapsOut === undefined)
      ? "partial"
      : "complete";

  return {
    meta: {
      id: dossierIdOf(input.request),
      ...(input.request.clientId === undefined ? {} : { clientId: input.request.clientId }),
      createdAt: input.createdAt ?? new Date().toISOString(),
      version: input.version ?? 1,
      status,
      sourcesCount: fragments.length,
    },
    business: businessOut,
    social: socialOut,
    ...(mapsOut === undefined ? {} : { maps: mapsOut }),
    visualIdentity: {
      colors: colorEntries,
      typography: typographyEntries,
      ...(logoRef === undefined ? {} : { logo: logoRef }),
      ...(faviconRef === undefined ? {} : { favicon: faviconRef }),
    },
    assets: [...assetMap.values()],
    confidence,
    missing: [...missing.entries()].map(([field, reason]) => ({ field, reason })),
    sources: fragments.map((fragment) => fragment.source),
  };
}

/**
 * Realiza merge incremental com uma versão anterior do dossiê (RF-12).
 * Herda campos faltantes no dossiê atual que estavam presentes no anterior,
 * registrando na lista de confiança (provenance) com nota explicativa.
 */
export function mergeWithPrevious(current: Dossier, previous: Dossier): Dossier {
  const inheritedConfidence: ConfidenceRecord[] = [];
  const prevVer = previous.meta.version;

  // 1. Business & Contact
  const mergedBusiness: Business = { ...current.business };
  const currentContact = { ...(current.business.contact ?? {}) };
  const prevContact = previous.business.contact ?? {};

  for (const key of BUSINESS_KEYS) {
    const currVal = (current.business as Record<string, unknown>)[key];
    const prevVal = (previous.business as Record<string, unknown>)[key];
    if (!isPresent(currVal) && isPresent(prevVal)) {
      (mergedBusiness as Record<string, unknown>)[key] = prevVal;
      inheritedConfidence.push({
        field: `business.${key}`,
        level: "medium",
        source: `versão anterior (v${prevVer})`,
        note: `herdado de v${prevVer}`,
      });
    }
  }

  // Contact fields
  const contactKeys: (keyof typeof prevContact)[] = ["phone", "email", "website", "address", "hours"];
  for (const cKey of contactKeys) {
    const currVal = currentContact[cKey];
    const prevVal = prevContact[cKey];
    if (!isPresent(currVal) && isPresent(prevVal)) {
      (currentContact as Record<string, unknown>)[cKey] = prevVal;
      inheritedConfidence.push({
        field: `business.contact.${cKey}`,
        level: "medium",
        source: `versão anterior (v${prevVer})`,
        note: `herdado de v${prevVer}`,
      });
    }
  }
  mergedBusiness.contact = currentContact;

  // 2. Social profiles
  const socialMap = new Map<string, SocialProfile>();
  for (const s of current.social) {
    socialMap.set(s.platform, { ...s });
  }
  for (const s of previous.social) {
    if (!socialMap.has(s.platform)) {
      socialMap.set(s.platform, { ...s });
      inheritedConfidence.push({
        field: `social.${s.platform}`,
        level: "medium",
        source: `versão anterior (v${prevVer})`,
        note: `perfil herdado de v${prevVer}`,
      });
    } else {
      const existing = socialMap.get(s.platform)!;
      const merged = mergeSocial(existing, s);
      socialMap.set(s.platform, merged);
    }
  }
  const mergedSocial = [...socialMap.values()].sort((a, b) => a.platform.localeCompare(b.platform));

  // 3. Maps
  let mergedMaps = current.maps;
  if (mergedMaps === undefined && previous.maps !== undefined) {
    mergedMaps = { ...previous.maps };
    inheritedConfidence.push({
      field: "maps",
      level: "medium",
      source: `versão anterior (v${prevVer})`,
      note: `ficha do Maps herdada de v${prevVer}`,
    });
  } else if (mergedMaps !== undefined && previous.maps !== undefined) {
    mergedMaps = {
      placeId: mergedMaps.placeId ?? previous.maps.placeId,
      category: mergedMaps.category ?? previous.maps.category,
      rating: mergedMaps.rating ?? previous.maps.rating,
      reviewCount: mergedMaps.reviewCount ?? previous.maps.reviewCount,
      hours: mergedMaps.hours ?? previous.maps.hours,
      photosCount: mergedMaps.photosCount ?? previous.maps.photosCount,
      address: mergedMaps.address ?? previous.maps.address,
    };
  }

  // 4. Visual Identity
  const mergedVI = { ...current.visualIdentity };
  if (mergedVI.logo === undefined && previous.visualIdentity.logo !== undefined) {
    mergedVI.logo = previous.visualIdentity.logo;
    inheritedConfidence.push({
      field: "visualIdentity.logo",
      level: "medium",
      source: `versão anterior (v${prevVer})`,
      note: `logo herdado de v${prevVer}`,
    });
  }
  if (mergedVI.favicon === undefined && previous.visualIdentity.favicon !== undefined) {
    mergedVI.favicon = previous.visualIdentity.favicon;
    inheritedConfidence.push({
      field: "visualIdentity.favicon",
      level: "medium",
      source: `versão anterior (v${prevVer})`,
      note: `favicon herdado de v${prevVer}`,
    });
  }
  const existingColorRoles = new Set(mergedVI.colors.map((c) => c.role));
  for (const c of previous.visualIdentity.colors) {
    if (!existingColorRoles.has(c.role)) {
      mergedVI.colors.push(c);
      existingColorRoles.add(c.role);
      inheritedConfidence.push({
        field: `visualIdentity.colors.${c.role}`,
        level: "medium",
        source: `versão anterior (v${prevVer})`,
        note: `cor ${c.role} herdada de v${prevVer}`,
      });
    }
  }
  const existingTypoRoles = new Set(mergedVI.typography.map((t) => t.role));
  for (const t of previous.visualIdentity.typography) {
    if (!existingTypoRoles.has(t.role)) {
      mergedVI.typography.push(t);
      existingTypoRoles.add(t.role);
      inheritedConfidence.push({
        field: `visualIdentity.typography.${t.role}`,
        level: "medium",
        source: `versão anterior (v${prevVer})`,
        note: `tipografia ${t.role} herdada de v${prevVer}`,
      });
    }
  }

  // 5. Assets
  const assetMap = new Map<string, Asset>();
  for (const a of current.assets) assetMap.set(a.url, { ...a });
  for (const a of previous.assets) {
    if (!assetMap.has(a.url)) {
      assetMap.set(a.url, { ...a });
    } else {
      const existing = assetMap.get(a.url)!;
      assetMap.set(a.url, {
        ...existing,
        localPath: existing.localPath ?? a.localPath,
        sha256: existing.sha256 ?? a.sha256,
        bytes: existing.bytes ?? a.bytes,
        alt: existing.alt ?? a.alt,
      });
    }
  }

  // 6. Atualizar missing: remover campos que agora foram satisfeitos por herança
  const fulfilledFields = new Set(inheritedConfidence.map((c) => c.field));
  const updatedMissing = current.missing.filter((item) => {
    if (fulfilledFields.has(item.field)) return false;
    if (
      item.field.startsWith("business.") &&
      isPresent((mergedBusiness as Record<string, unknown>)[item.field.replace("business.", "")])
    ) {
      return false;
    }
    if (
      item.field.startsWith("business.contact.") &&
      isPresent((mergedBusiness.contact as Record<string, unknown>)[item.field.replace("business.contact.", "")])
    ) {
      return false;
    }
    if (item.field === "visualIdentity.logo" && mergedVI.logo !== undefined) return false;
    if (item.field === "visualIdentity.favicon" && mergedVI.favicon !== undefined) return false;
    if (item.field === "visualIdentity.colors" && mergedVI.colors.length > 0) return false;
    if (item.field === "visualIdentity.typography" && mergedVI.typography.length > 0) return false;
    if (item.field === "social" && mergedSocial.length > 0) return false;
    if (item.field === "maps" && mergedMaps !== undefined) return false;
    return true;
  });

  const failedSources = current.sources.filter((s) => s.status !== "ok");
  const criticalMissing = CRITICAL_FIELDS.filter((f) => updatedMissing.some((m) => m.field === f));
  const status: "complete" | "partial" =
    failedSources.length > 0 || criticalMissing.length > 0 || (mergedSocial.length === 0 && mergedMaps === undefined)
      ? "partial"
      : "complete";

  return {
    ...current,
    meta: {
      ...current.meta,
      status,
    },
    business: mergedBusiness,
    social: mergedSocial,
    ...(mergedMaps === undefined ? {} : { maps: mergedMaps }),
    visualIdentity: mergedVI,
    assets: [...assetMap.values()],
    confidence: [...current.confidence, ...inheritedConfidence],
    missing: updatedMissing,
  };
}

