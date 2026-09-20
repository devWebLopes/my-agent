import { defineTool } from "eve/tools";
import { z } from "zod";

import { fetchText } from "../lib/http";
import { cleanCnpj, formatCnpj } from "../lib/url";

/**
 * Consulta de dados cadastrais de pessoa jurídica (CNPJ) via APIs públicas
 * (BrasilAPI e Minha Receita).
 *
 * Implementa as capacidades SKILL-EXT-01 e SKILL-EXT-04 do PRD.
 */

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function field<T>(value: T, source: string, note?: string) {
  return { value, source, confidence: "high" as const, ...(note === undefined ? {} : { note }) };
}

export default defineTool({
  description:
    "Consulta dados cadastrais públicos de pessoa jurídica brasileira a partir do CNPJ (Razão Social, Nome Fantasia, " +
    "Situação Cadastral, CNAE, Quadro de Sócios/QSA, Endereço Oficial, Telefone e E-mail). " +
    "O campo `fragment` já vem estruturado com alta confiança para ingestão no `build_dossier`.",
  inputSchema: z.object({
    cnpj: z.string().min(1).describe("Número do CNPJ com ou sem máscara (ex: '00.000.000/0001-91' ou '00000000000191')."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    cnpj: z.string(),
    formattedCnpj: z.string().optional(),
    legalName: z.string().optional(),
    tradeName: z.string().optional(),
    status: z.string().optional(),
    foundedDate: z.string().optional(),
    cnae: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    qsa: z.array(z.string()).optional(),
    capitalSocial: z.string().optional(),
    fragment: z.unknown().optional(),
    reason: z.string().optional(),
  }),
  label: { start: ({ cnpj }) => `Consultar dados cadastrais do CNPJ ${cnpj}` },
  async execute({ cnpj }) {
    const clean = cleanCnpj(cnpj);
    if (clean.length !== 14) {
      const reason = `CNPJ inválido: esperado 14 dígitos numéricos, recebido ${clean.length}`;
      return {
        ok: false,
        cnpj,
        reason,
        fragment: {
          source: {
            type: "cnpj",
            url: `cnpj:${clean || cnpj}`,
            fetchedAt: new Date().toISOString(),
            status: "failed",
            reason,
          },
          missing: [{ field: "business.cnpj", reason }],
        },
      };
    }

    const formatted = formatCnpj(clean);
    let payload: JsonRecord | undefined;
    let provider = "brasilapi";

    // 1. Tentar BrasilAPI
    const brasilApiRes = await fetchText(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
      timeoutMs: 12_000,
      retries: 1,
    });

    if (brasilApiRes.ok) {
      try {
        payload = JSON.parse(brasilApiRes.body) as JsonRecord;
      } catch {
        payload = undefined;
      }
    }

    // 2. Fallback para Minha Receita
    if (payload === undefined) {
      provider = "minhareceita";
      const minhaReceitaRes = await fetchText(`https://minhareceita.org/${clean}`, {
        timeoutMs: 12_000,
        retries: 1,
      });
      if (minhaReceitaRes.ok) {
        try {
          payload = JSON.parse(minhaReceitaRes.body) as JsonRecord;
        } catch {
          payload = undefined;
        }
      }
    }

    if (payload === undefined) {
      const reason = `Não foi possível consultar os dados do CNPJ ${formatted} nas bases públicas`;
      return {
        ok: false,
        cnpj: clean,
        formattedCnpj: formatted,
        reason,
        fragment: {
          source: {
            type: "cnpj",
            url: `cnpj:${clean}`,
            fetchedAt: new Date().toISOString(),
            status: "failed",
            reason,
          },
          missing: [{ field: "business.cnpj", reason }],
        },
      };
    }

    const legalName = asString(payload["razao_social"]);
    const tradeName = asString(payload["nome_fantasia"]);
    const status = asString(payload["descricao_situacao_cadastral"] ?? payload["situacao_cadastral"]);
    const foundedDate = asString(payload["data_inicio_atividade"]);
    const cnae = asString(payload["cnae_fiscal_descricao"]);
    const capitalSocialRaw = payload["capital_social"];
    const capitalSocial =
      typeof capitalSocialRaw === "number"
        ? `R$ ${capitalSocialRaw.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
        : asString(capitalSocialRaw);

    // Telefones
    const ddd1 = asString(payload["ddd_telefone_1"]);
    const ddd2 = asString(payload["ddd_telefone_2"]);
    const phone = ddd1 ?? ddd2;

    // E-mail
    const email = asString(payload["email"]);

    // Endereço
    const logradouro = asString(payload["logradouro"]);
    const numero = asString(payload["numero"]) ?? "S/N";
    const complemento = asString(payload["complemento"]);
    const bairro = asString(payload["bairro"]);
    const municipio = asString(payload["municipio"]);
    const uf = asString(payload["uf"]);
    const cep = asString(payload["cep"]);

    const addressParts: string[] = [];
    if (logradouro !== undefined) {
      addressParts.push(`${logradouro}, ${numero}${complemento ? ` (${complemento})` : ""}`);
    }
    if (bairro !== undefined) addressParts.push(bairro);
    if (municipio !== undefined && uf !== undefined) addressParts.push(`${municipio} - ${uf}`);
    if (cep !== undefined) addressParts.push(`CEP ${cep}`);
    const address = addressParts.length > 0 ? addressParts.join(", ") : undefined;

    // Quadro de Sócios (QSA)
    const rawQsa = Array.isArray(payload["qsa"]) ? payload["qsa"] : [];
    const qsa = rawQsa
      .map((item) => {
        const rec = asRecord(item);
        const name = asString(rec?.["nome_socio"] ?? rec?.["nome_socio_razao_social"] ?? rec?.["nome"]);
        const role = asString(rec?.["qualificacao_socio"] ?? rec?.["qualificacao"]);
        if (name === undefined) return undefined;
        return role === undefined ? name : `${name} (${role})`;
      })
      .filter((line): line is string => line !== undefined);

    const source = `cnpj:${clean} (${provider})`;
    const sourceUrl = `cnpj:${clean}`;

    const businessFields = {
      ...(legalName === undefined ? {} : { legalName: field(legalName, source) }),
      ...(tradeName === undefined ? {} : { name: field(tradeName, source) }),
      cnpj: field(formatted, source),
      ...(status === undefined ? {} : { status: field(status, source) }),
      ...(foundedDate === undefined ? {} : { foundedDate: field(foundedDate, source) }),
      ...(cnae === undefined ? {} : { cnae: field(cnae, source) }),
      ...(qsa.length === 0 ? {} : { qsa: field(qsa, source) }),
      ...(capitalSocial === undefined ? {} : { capitalSocial: field(capitalSocial, source) }),
      ...(phone === undefined ? {} : { phone: field(phone, source) }),
      ...(email === undefined ? {} : { email: field(email, source) }),
      ...(address === undefined ? {} : { address: field(address, source) }),
    };

    const fragment = {
      source: {
        type: "cnpj" as const,
        url: sourceUrl,
        fetchedAt: new Date().toISOString(),
        status: "ok" as const,
        title: `${tradeName ?? legalName ?? "Empresa"} (${formatted})`,
      },
      business: businessFields,
    };

    return {
      ok: true,
      cnpj: clean,
      formattedCnpj: formatted,
      ...(legalName === undefined ? {} : { legalName }),
      ...(tradeName === undefined ? {} : { tradeName }),
      ...(status === undefined ? {} : { status }),
      ...(foundedDate === undefined ? {} : { foundedDate }),
      ...(cnae === undefined ? {} : { cnae }),
      ...(address === undefined ? {} : { address }),
      ...(phone === undefined ? {} : { phone }),
      ...(email === undefined ? {} : { email }),
      ...(qsa.length === 0 ? {} : { qsa }),
      ...(capitalSocial === undefined ? {} : { capitalSocial }),
      fragment,
    };
  },
});
