import type { Dossier } from "./schema";

/** Renderiza o dossiê em Markdown para leitura humana (`dossie.md`). */

const DASH = "—";

function value(input: string | number | undefined): string {
  if (input === undefined) return DASH;
  const text = String(input).trim();
  return text === "" ? DASH : text;
}

function list(items: readonly string[] | undefined): string {
  return items === undefined || items.length === 0 ? DASH : items.join("; ");
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return `_${DASH}_\n`;
  const head = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((cells) => `| ${cells.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`);
  return [head, separator, ...body].join("\n") + "\n";
}

function section(title: string, content: string): string {
  return `## ${title}\n\n${content}\n`;
}

/** Markdown completo do dossiê. */
export function renderMarkdown(
  dossier: Dossier,
  options?: { markdownPath?: string; dossierPath?: string; manifestPath?: string },
): string {
  const meta = dossier.meta;
  const business = dossier.business;
  const contact = dossier.business.contact;

  const parts: string[] = [];
  parts.push(`# Dossiê — ${value(business.name ?? meta.clientId ?? meta.id)}\n`);
  parts.push(
    table(
      ["Campo", "Valor"],
      [
        ["id", meta.id],
        ["clientId", value(meta.clientId)],
        ["status", meta.status],
        ["versão", String(meta.version)],
        ["criado em", meta.createdAt],
        ["fontes", String(meta.sourcesCount)],
      ],
    ),
  );

  parts.push(
    section(
      "Negócio",
      table(
        ["Campo", "Valor"],
        [
          ["nome", value(business.name)],
          ["razão social", value(business.legalName)],
          ["CNPJ", value(business.cnpj)],
          ["situação cadastral", value(business.status)],
          ["data de fundação", value(business.foundedDate)],
          ["CNAE principal", value(business.cnae)],
          ["quadro de sócios (QSA)", list(business.qsa)],
          ["capital social", value(business.capitalSocial)],
          ["categoria", value(business.category)],
          ["tagline", value(business.tagline)],
          ["descrição", value(business.description)],
          ["serviços", list(business.services)],
          ["áreas de atuação", list(business.serviceAreas)],
        ],
      ),
    ),
  );

  parts.push(
    section(
      "Contato",
      table(
        ["Campo", "Valor"],
        [
          ["telefone", value(contact.phone)],
          ["e-mail", value(contact.email)],
          ["site", value(contact.website)],
          ["endereço", value(contact.address)],
          ["horários", list(contact.hours)],
        ],
      ),
    ),
  );

  if (dossier.maps !== undefined) {
    const maps = dossier.maps;
    parts.push(
      section(
        "Google Maps",
        table(
          ["Campo", "Valor"],
          [
            ["placeId", value(maps.placeId)],
            ["categoria", value(maps.category)],
            ["avaliação", value(maps.rating)],
            ["nº de avaliações", value(maps.reviewCount)],
            ["endereço", value(maps.address)],
            ["fotos", value(maps.photosCount)],
            ["horários", list(maps.hours)],
          ],
        ),
      ),
    );
  }

  parts.push(
    section(
      "Redes sociais",
      table(
        ["Plataforma", "Handle", "Seguidores", "Bio", "URL"],
        dossier.social.map((profile) => [
          profile.platform,
          value(profile.handle),
          value(profile.followers),
          value(profile.bio),
          profile.url,
        ]),
      ),
    ),
  );

  const identity = dossier.visualIdentity;
  parts.push(
    section(
      "Identidade visual",
      [
        "### Cores\n",
        table(
          ["Papel", "Hex", "Fonte"],
          identity.colors.map((color) => [color.role, color.hex, color.source]),
        ),
        "\n### Tipografia\n",
        table(
          ["Papel", "Família", "Fonte"],
          identity.typography.map((entry) => [entry.role, entry.family, entry.source]),
        ),
        "\n### Marca\n",
        table(
          ["Item", "URL", "Caminho local", "Fonte"],
          [
            ["logo", value(identity.logo?.url), value(identity.logo?.localPath), value(identity.logo?.source)],
            ["favicon", value(identity.favicon?.url), value(identity.favicon?.localPath), value(identity.favicon?.source)],
          ],
        ),
      ].join("\n"),
    ),
  );

  parts.push(
    section(
      "Assets coletados",
      table(
        ["Id", "Tipo", "URL", "Caminho local", "Bytes"],
        dossier.assets.map((asset) => [
          asset.id,
          asset.kind,
          asset.url,
          value(asset.localPath),
          value(asset.bytes),
        ]),
      ),
    ),
  );

  parts.push(
    section(
      "Provenance (confiança por campo)",
      table(
        ["Campo", "Nível", "Fonte", "Observação"],
        dossier.confidence.map((record) => [
          record.field,
          record.level,
          record.source,
          value(record.note),
        ]),
      ),
    ),
  );

  parts.push(
    section(
      "Campos ausentes",
      dossier.missing.length === 0
        ? "_nenhum_\n"
        : dossier.missing.map((item) => `- **${item.field}**: ${item.reason}`).join("\n") + "\n",
    ),
  );

  parts.push(
    section(
      "Fontes coletadas",
      table(
        ["Tipo", "URL", "Status", "Coletado em", "Título", "Motivo"],
        dossier.sources.map((source) => [
          source.type,
          source.finalUrl ?? source.url,
          source.status,
          source.fetchedAt,
          value(source.title),
          value(source.reason),
        ]),
      ),
    ),
  );

  parts.push(
    "> Documento gerado automaticamente pelo subagente `client-dossier`. " +
      "Valores sem fonte declarada em *Provenance* não devem ser usados como fato.\n",
  );

  const mdPath = options?.markdownPath ?? meta.markdownPath;
  const jsonPath = options?.dossierPath ?? meta.dossierPath;
  const manifestPath = options?.manifestPath ?? meta.manifestPath;

  if (mdPath !== undefined || jsonPath !== undefined) {
    const lines: string[] = ["---", "### Local de Armazenamento"];
    if (mdPath !== undefined && mdPath.trim() !== "") {
      lines.push(`- **Caminho completo (Markdown):** \`${mdPath}\``);
    }
    if (jsonPath !== undefined && jsonPath.trim() !== "") {
      lines.push(`- **Caminho completo (JSON):** \`${jsonPath}\``);
    }
    if (manifestPath !== undefined && manifestPath.trim() !== "") {
      lines.push(`- **Manifesto de execução:** \`${manifestPath}\``);
    }
    lines.push("");
    parts.push(lines.join("\n"));
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n");
}
