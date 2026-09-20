import { defineTool } from "eve/tools";
import { z } from "zod";

import { fetchText } from "../lib/http";
import { normalizeUrl } from "../lib/url";

const API_BASE = "https://maps.googleapis.com/maps/api/place";

/** Google Maps/Places (RF-05) via API oficial — exige `GOOGLE_MAPS_API_KEY`. */

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Extrai consulta/place_id de uma URL de Maps (`/maps/place/...`, `?q=`, `?place_id=`). */
export function parseMapsUrl(rawUrl: string): { query?: string; placeId?: string } {
  const placeId = /[?&]place_id=([\w-]+)/.exec(rawUrl)?.[1];
  const placePath = /\/maps\/place\/([^/@?]+)/.exec(rawUrl)?.[1];
  const query = placePath === undefined ? undefined : decodeURIComponent(placePath.replace(/\+/g, " "));
  if (query !== undefined || placeId !== undefined) {
    return { ...(query === undefined ? {} : { query }), ...(placeId === undefined ? {} : { placeId }) };
  }
  try {
    const fromParam = new URL(rawUrl).searchParams.get("q");
    return fromParam === null || fromParam === "" ? {} : { query: fromParam };
  } catch {
    return {};
  }
}

async function placesRequest(
  path: string,
  params: Record<string, string>,
): Promise<{ ok: true; data: JsonRecord } | { ok: false; reason: string }> {
  const url = `${API_BASE}/${path}?${new URLSearchParams(params).toString()}`;
  const response = await fetchText(url, { timeoutMs: 15_000, retries: 1, maxBytes: 500_000 });
  if (!response.ok) return { ok: false, reason: `falha ao consultar ${path}: ${response.reason}` };
  let data: JsonRecord;
  try {
    data = JSON.parse(response.body) as JsonRecord;
  } catch (error) {
    return { ok: false, reason: `resposta inválida de ${path}: ${String(error)}` };
  }
  const status = asString(data["status"]) ?? "UNKNOWN";
  if (status !== "OK" && status !== "ZERO_RESULTS") {
    const message = asString(data["error_message"]) ?? "";
    return { ok: false, reason: `Places API ${path}: ${status} ${message}`.trim() };
  }
  return { ok: true, data };
}

const DETAILS_FIELDS = [
  "place_id",
  "name",
  "formatted_address",
  "formatted_phone_number",
  "international_phone_number",
  "website",
  "rating",
  "user_ratings_total",
  "opening_hours",
  "photos",
  "types",
].join(",");


/** Dados de Google Maps/Places como fragmento pronto para o `build_dossier`. */
export default defineTool({
  description:
    "Consulta o Google Maps/Places (API oficial) e devolve categoria, avaliação, nº de avaliações, horários, telefone, site, " +
    "endereço, fotos e place_id. Aceita `placeId`, `query` (nome do negócio) ou uma `mapsUrl`. " +
    "Exige a variável de ambiente GOOGLE_MAPS_API_KEY; sem ela retorna ok:false com o motivo (registre em `missing`). " +
    "O campo `fragment` já está no formato aceito pelo `build_dossier`.",
  inputSchema: z.object({
    query: z.string().min(1).optional().describe("Nome/endereço do negócio para busca textual."),
    placeId: z.string().min(1).optional().describe("place_id do Google Places, quando já conhecido."),
    mapsUrl: z.string().min(1).optional().describe("URL do Google Maps do cliente."),
    maxPhotos: z.number().int().min(0).max(20).optional().describe("Máximo de URLs de fotos (padrão 6)."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    status: z.enum(["ok", "failed"]),
    placeId: z.string().optional(),
    name: z.string().optional(),
    address: z.string().optional(),
    category: z.string().optional(),
    rating: z.number().optional(),
    reviewCount: z.number().optional(),
    phone: z.string().optional(),
    website: z.string().optional(),
    hours: z.array(z.string()).optional(),
    photosCount: z.number().int().optional(),
    photoUrls: z.array(z.string()).optional(),
    fragment: z.unknown().optional(),
    reason: z.string().optional(),
    hint: z.string().optional(),
  }),
  label: {
    start: ({ query, placeId, mapsUrl }) =>
      `Consultar Google Maps (${query ?? placeId ?? mapsUrl ?? "?"})`,
  },
  async execute({ query, placeId, mapsUrl, maxPhotos }) {
    const fromUrl = mapsUrl === undefined ? {} : parseMapsUrl(mapsUrl);
    const effectivePlaceId = placeId ?? fromUrl.placeId;
    const effectiveQuery = query ?? fromUrl.query;

    const key = process.env["GOOGLE_MAPS_API_KEY"];
    if (key === undefined || key === "") {
      return {
        ok: false,
        status: "failed" as const,
        ...(effectivePlaceId === undefined ? {} : { placeId: effectivePlaceId }),
        reason: "GOOGLE_MAPS_API_KEY não configurada no ambiente",
        hint:
          "Defina GOOGLE_MAPS_API_KEY para coletar a ficha do Google Maps; enquanto isso, " +
          "registre `maps` em `missing` com o motivo.",
      };
    }

    let resolvedPlaceId = effectivePlaceId;
    if (resolvedPlaceId === undefined) {
      if (effectiveQuery === undefined) {
        return {
          ok: false,
          status: "failed" as const,
          reason: "informe `query`, `placeId` ou `mapsUrl`",
        };
      }
      const search = await placesRequest("textsearch/json", {
        query: effectiveQuery,
        language: "pt-BR",
        key,
      });
      if (!search.ok) return { ok: false, status: "failed" as const, reason: search.reason };
      const results = Array.isArray(search.data["results"]) ? search.data["results"] : [];
      const first = asRecord(results[0]);
      if (first === undefined) {
        return {
          ok: false,
          status: "failed" as const,
          reason: `nenhum lugar encontrado para "${effectiveQuery}"`,
        };
      }
      resolvedPlaceId = asString(first["place_id"]);
    }

    const details =
      resolvedPlaceId === undefined
        ? ({ ok: false, reason: "place_id não resolvido" } as const)
        : await placesRequest("details/json", {
            place_id: resolvedPlaceId,
            language: "pt-BR",
            fields: DETAILS_FIELDS,
            key,
          });
    if (!details.ok) return { ok: false, status: "failed" as const, reason: details.reason };

    const place = asRecord(details.data["result"]) ?? {};
    const photoRefs = (Array.isArray(place["photos"]) ? place["photos"] : [])
      .map((photo) => asString(asRecord(photo)?.["photo_reference"]))
      .filter((reference): reference is string => reference !== undefined)
      .slice(0, maxPhotos ?? 6);
    const photoUrls = photoRefs.map(
      (reference) =>
        `${API_BASE}/photo?maxwidth=1600&photo_reference=${encodeURIComponent(reference)}&key={GOOGLE_MAPS_API_KEY}`,
    );

    const types = Array.isArray(place["types"])
      ? place["types"].filter((type): type is string => typeof type === "string")
      : [];
    const openingHours = asRecord(place["opening_hours"]);
    const rawHours = openingHours?.["weekday_text"];
    const hours = Array.isArray(rawHours)
      ? rawHours.filter((line): line is string => typeof line === "string")
      : [];

    const name = asString(place["name"]);
    const address = asString(place["formatted_address"]);
    const phone =
      asString(place["formatted_phone_number"]) ?? asString(place["international_phone_number"]);
    const website = asString(place["website"]);
    const rating = asNumber(place["rating"]);
    const reviewCount = asNumber(place["user_ratings_total"]);
    const photosCount = Array.isArray(place["photos"]) ? place["photos"].length : 0;
    const category = types[0];
    const sourceUrl = mapsUrl ?? `https://www.google.com/maps/place/?q=place_id:${resolvedPlaceId ?? ""}`;
    const source = `google_places:${resolvedPlaceId ?? effectiveQuery ?? sourceUrl}`;

    const mapsFields = {
      ...(resolvedPlaceId === undefined ? {} : { placeId: field(resolvedPlaceId, source) }),
      ...(category === undefined ? {} : { category: field(category, source) }),
      ...(rating === undefined ? {} : { rating: field(rating, source) }),
      ...(reviewCount === undefined ? {} : { reviewCount: field(reviewCount, source) }),
      ...(hours.length === 0 ? {} : { hours: field(hours, source) }),
      ...(phone === undefined ? {} : { phone: field(phone, source) }),
      ...(website === undefined ? {} : { website: field(website, source) }),
      ...(address === undefined ? {} : { address: field(address, source) }),
      ...(photosCount === 0 ? {} : { photosCount: field(photosCount, source) }),
    };

    const businessFields = {
      ...(name === undefined ? {} : { name: field(name, source) }),
      ...(category === undefined ? {} : { category: field(category, source) }),
      ...(address === undefined ? {} : { address: field(address, source) }),
      ...(phone === undefined ? {} : { phone: field(phone, source) }),
      ...(website === undefined ? {} : { website: field(website, source) }),
      ...(hours.length === 0 ? {} : { hours: field(hours, source) }),
    };

    const notes =
      photoUrls.length === 0
        ? {}
        : {
            notes: [
              `${photoUrls.length} foto(s) disponíveis para download com download_asset (URL contém {GOOGLE_MAPS_API_KEY})`,
            ],
          };

    return {
      ok: true,
      status: "ok" as const,
      ...(resolvedPlaceId === undefined ? {} : { placeId: resolvedPlaceId }),
      ...(name === undefined ? {} : { name }),
      ...(address === undefined ? {} : { address }),
      ...(category === undefined ? {} : { category }),
      ...(rating === undefined ? {} : { rating }),
      ...(reviewCount === undefined ? {} : { reviewCount }),
      ...(phone === undefined ? {} : { phone }),
      ...(website === undefined ? {} : { website }),
      ...(hours.length === 0 ? {} : { hours }),
      photosCount,
      ...(photoUrls.length === 0 ? {} : { photoUrls }),
      fragment: {
        source: {
          type: "google_maps",
          url: normalizeUrl(sourceUrl),
          fetchedAt: new Date().toISOString(),
          status: "ok",
          ...(name === undefined ? {} : { title: name }),
        },
        maps: mapsFields,
        business: businessFields,
        ...notes,
      },
    };
  },
});


function field(value: unknown, source: string): { value: unknown; source: string; confidence: string } {
  return { value, source, confidence: "high" };
}
