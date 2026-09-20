import { z } from "zod";

/**
 * Contratos do dossiê de cliente: entrada (`DossierRequest`), fragmentos
 * coletados por fonte (`DossierFragment`) e saída final (`Dossier`, PRD §7.2).
 *
 * Este é o único módulo do subagente que usa zod em runtime. Os demais módulos
 * importam apenas os tipos (`import type`), o que mantém a lógica de extração
 * pura e verificável fora do runtime do eve.
 */

/* ------------------------------------- enums ------------------------------------- */

export const sourceTypeSchema = z.enum([
  "website",
  "google_maps",
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "youtube",
  "cnpj",
  "company_registry",
  "other",
]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const sourceStatusSchema = z.enum(["ok", "partial", "failed"]);
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const confidenceLevelSchema = z.enum(["high", "medium", "low"]);
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;

export const assetKindSchema = z.enum(["logo", "photo", "cover", "favicon", "other"]);
export type AssetKind = z.infer<typeof assetKindSchema>;

export const colorRoleSchema = z.enum(["primary", "secondary", "accent", "background", "text"]);
export type ColorRole = z.infer<typeof colorRoleSchema>;

export const typographyRoleSchema = z.enum(["heading", "body"]);
export type TypographyRole = z.infer<typeof typographyRoleSchema>;

/** Política de conflito do PRD §12: dados cadastrais/PJ > site > Google Maps > rede social > outro. */
export const sourcePriority: Record<SourceType, number> = {
  cnpj: 5,
  company_registry: 5,
  website: 4,
  google_maps: 3,
  instagram: 2,
  facebook: 2,
  linkedin: 2,
  tiktok: 2,
  youtube: 2,
  other: 1,
};

export const confidenceRank: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };

/* ------------------------------------ entrada ------------------------------------ */

export const dossierSourceSchema = z.object({
  type: sourceTypeSchema,
  url: z.string().min(1),
  hint: z.string().optional(),
});
export type DossierSource = z.infer<typeof dossierSourceSchema>;

export const dossierRequestSchema = z.object({
  clientId: z.string().optional(),
  name: z.string().optional(),
  query: z.string().optional(),
  sources: z.array(dossierSourceSchema).min(1).max(10),
});
export type DossierRequest = z.infer<typeof dossierRequestSchema>;

/* --------------------------- valores com provenance ----------------------------- */

/** Um valor e a sua origem (RF-10): toda informação do dossiê carrega a fonte. */
export function field<S extends z.ZodType<unknown>>(value: S) {
  return z.object({
    value,
    source: z.string(),
    confidence: confidenceLevelSchema,
    note: z.string().optional(),
  });
}

export type Field<T> = {
  value: T;
  source: string;
  confidence: ConfidenceLevel;
  note?: string;
};

export const sourceRecordSchema = z.object({
  type: sourceTypeSchema,
  url: z.string(),
  fetchedAt: z.string(),
  status: sourceStatusSchema,
  title: z.string().optional(),
  finalUrl: z.string().optional(),
  reason: z.string().optional(),
});
export type SourceRecord = z.infer<typeof sourceRecordSchema>;

export const businessFieldsSchema = z.object({
  name: field(z.string().min(1)),
  legalName: field(z.string().min(1)),
  cnpj: field(z.string().min(1)),
  category: field(z.string().min(1)),
  description: field(z.string().min(1)),
  tagline: field(z.string().min(1)),
  services: field(z.array(z.string().min(1)).min(1)),
  serviceAreas: field(z.array(z.string().min(1)).min(1)),
  phone: field(z.string().min(1)),
  email: field(z.string().min(1)),
  website: field(z.string().min(1)),
  address: field(z.string().min(1)),
  hours: field(z.array(z.string().min(1)).min(1)),
  foundedDate: field(z.string().min(1)),
  status: field(z.string().min(1)),
  cnae: field(z.string().min(1)),
  qsa: field(z.array(z.string().min(1)).min(1)),
  capitalSocial: field(z.string().min(1)),
});
export type BusinessFields = z.infer<typeof businessFieldsSchema>;
export const businessFieldsPatchSchema = businessFieldsSchema.partial();
export type BusinessFieldsPatch = z.infer<typeof businessFieldsPatchSchema>;

export const mapsFieldsSchema = z.object({
  placeId: field(z.string().min(1)),
  category: field(z.string().min(1)),
  rating: field(z.number().min(0).max(5)),
  reviewCount: field(z.number().int().min(0)),
  hours: field(z.array(z.string().min(1)).min(1)),
  phone: field(z.string().min(1)),
  website: field(z.string().min(1)),
  address: field(z.string().min(1)),
  photosCount: field(z.number().int().min(0)),
});
export type MapsFields = z.infer<typeof mapsFieldsSchema>;
export const mapsFieldsPatchSchema = mapsFieldsSchema.partial();
export type MapsFieldsPatch = z.infer<typeof mapsFieldsPatchSchema>;

export const colorSchema = z.object({
  role: colorRoleSchema,
  hex: z.string().regex(/^#[0-9a-f]{6}$/),
  source: z.string(),
});
export type ColorEntry = z.infer<typeof colorSchema>;

export const typographySchema = z.object({
  role: typographyRoleSchema,
  family: z.string().min(1),
  source: z.string(),
});
export type TypographyEntry = z.infer<typeof typographySchema>;

export const imageRefSchema = z.object({
  url: z.string(),
  localPath: z.string().optional(),
  format: z.string().optional(),
  source: z.string(),
});
export type ImageRef = z.infer<typeof imageRefSchema>;

export const faviconRefSchema = z.object({
  url: z.string(),
  localPath: z.string().optional(),
  source: z.string(),
});
export type FaviconRef = z.infer<typeof faviconRefSchema>;

export const assetSchema = z.object({
  id: z.string().min(1),
  kind: assetKindSchema,
  url: z.string(),
  localPath: z.string().optional(),
  alt: z.string().optional(),
  source: z.string(),
  format: z.string().optional(),
  sha256: z.string().optional(),
  bytes: z.number().int().min(0).optional(),
});
export type Asset = z.infer<typeof assetSchema>;

export const visualIdentityPatchSchema = z.object({
  colors: z.array(colorSchema).optional(),
  typography: z.array(typographySchema).optional(),
  logo: imageRefSchema.optional(),
  favicon: faviconRefSchema.optional(),
});
export type VisualIdentityPatch = z.infer<typeof visualIdentityPatchSchema>;

export const missingSchema = z.object({
  field: z.string(),
  reason: z.string(),
});
export type MissingField = z.infer<typeof missingSchema>;



/* ------------------------------ fragmento por fonte ------------------------------ */

/**
 * Fonte dentro de um fragmento. `fetchedAt` e `status` aceitam ausência porque o
 * fragmento do site é remontado pelo agente a partir de `fetch_url`/`scrape_page`
 * (que não devolvem fragmento pronto): o `build_dossier` carimba o horário e
 * assume `ok` quando a tool não informou (RF-10).
 */
export const fragmentSourceSchema = sourceRecordSchema.extend({
  fetchedAt: z.string().default(() => new Date().toISOString()),
  status: sourceStatusSchema.default("ok"),
});
export type FragmentSource = z.infer<typeof fragmentSourceSchema>;

/** O que cada tool de fonte devolve para o `build_dossier` consolidar. */
export const dossierFragmentSchema = z.object({
  source: fragmentSourceSchema,
  business: businessFieldsPatchSchema.optional(),
  maps: mapsFieldsPatchSchema.optional(),
  social: z
    .array(
      z.object({
        platform: z.string().min(1),
        url: z.string().min(1),
        handle: z.string().optional(),
        bio: z.string().optional(),
        followers: z.number().min(0).optional(),
        links: z.array(z.string()).optional(),
        source: z.string(),
        confidence: confidenceLevelSchema,
      }),
    )
    .optional(),
  visualIdentity: visualIdentityPatchSchema.optional(),
  assets: z.array(assetSchema).optional(),
  notes: z.array(z.string()).optional(),
  /** Campos que esta fonte não conseguiu preencher (RF-11). */
  missing: z.array(missingSchema).optional(),
});
export type DossierFragment = z.infer<typeof dossierFragmentSchema>;
export type SocialFragment = NonNullable<DossierFragment["social"]>[number];

/* -------------------------------- saída (dossiê) -------------------------------- */

export const businessSchema = z.object({
  name: z.string().optional(),
  legalName: z.string().optional(),
  cnpj: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  tagline: z.string().optional(),
  services: z.array(z.string()).optional(),
  serviceAreas: z.array(z.string()).optional(),
  foundedDate: z.string().optional(),
  status: z.string().optional(),
  cnae: z.string().optional(),
  qsa: z.array(z.string()).optional(),
  capitalSocial: z.string().optional(),
  contact: z.object({
    phone: z.string().optional(),
    email: z.string().optional(),
    website: z.string().optional(),
    address: z.string().optional(),
    hours: z.array(z.string()).optional(),
  }),
});
export type Business = z.infer<typeof businessSchema>;

export const socialSchema = z.object({
  platform: z.string(),
  handle: z.string().optional(),
  url: z.string(),
  bio: z.string().optional(),
  followers: z.number().optional(),
  links: z.array(z.string()).optional(),
});
export type SocialProfile = z.infer<typeof socialSchema>;

export const mapsSchema = z.object({
  placeId: z.string().optional(),
  rating: z.number().optional(),
  reviewCount: z.number().optional(),
  category: z.string().optional(),
  hours: z.array(z.string()).optional(),
  photosCount: z.number().optional(),
  address: z.string().optional(),
});
export type Maps = z.infer<typeof mapsSchema>;

export const visualIdentitySchema = z.object({
  colors: z.array(
    z.object({
      role: colorRoleSchema,
      hex: z.string(),
      source: z.string(),
    }),
  ),
  typography: z.array(
    z.object({
      role: typographyRoleSchema,
      family: z.string(),
      source: z.string(),
    }),
  ),
  logo: imageRefSchema.optional(),
  favicon: faviconRefSchema.optional(),
});
export type VisualIdentity = z.infer<typeof visualIdentitySchema>;

export const confidenceRecordSchema = z.object({
  field: z.string(),
  level: confidenceLevelSchema,
  source: z.string(),
  note: z.string().optional(),
});
export type ConfidenceRecord = z.infer<typeof confidenceRecordSchema>;

export const dossierSchema = z.object({
  meta: z.object({
    id: z.string().min(1),
    clientId: z.string().optional(),
    name: z.string().optional(),
    query: z.string().optional(),
    entitySlug: z.string().optional(),
    runId: z.string().optional(),
    createdAt: z.string().min(1),
    version: z.number().int().min(1),
    status: z.enum(["complete", "partial"]),
    sourcesCount: z.number().int().min(0),
    dossierPath: z.string().optional(),
    markdownPath: z.string().optional(),
    manifestPath: z.string().optional(),
  }),
  business: businessSchema,
  social: z.array(socialSchema),
  maps: mapsSchema.optional(),
  visualIdentity: visualIdentitySchema,
  assets: z.array(assetSchema),
  confidence: z.array(confidenceRecordSchema),
  missing: z.array(missingSchema),
  sources: z.array(sourceRecordSchema),
});
export type Dossier = z.infer<typeof dossierSchema>;

/* ----------------------------------- parsing ------------------------------------ */

/** Mensagem de erro legível para qualquer falha (inclui `ZodError`). */
export function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

function asJson(input: unknown): unknown {
  if (typeof input !== "string") return input;
  const trimmed = input.trim();
  if (trimmed === "") return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return input;
  }
}

/** Aceita o request como objeto ou como JSON serializado (o pai envia por `message`). */
export function parseDossierRequest(input: unknown): DossierRequest {
  return dossierRequestSchema.parse(asJson(input));
}

/** Aceita o fragmento como objeto ou como JSON serializado. */
export function parseDossierFragment(input: unknown): DossierFragment {
  return dossierFragmentSchema.parse(asJson(input));
}

