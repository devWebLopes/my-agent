import { google } from "@ai-sdk/google";
import { defineAgent } from "eve";

import { dossierSchema } from "./lib/schema";

/**
 * Subagente `client-dossier` (PRD §8.1).
 *
 * `description` é obrigatória: é o que o agente raiz lê para decidir delegar.
 * `outputSchema` fixa o contrato do dossiê, garantindo que o agente de site
 * receba sempre a mesma forma (RNF-06).
 */
export default defineAgent({
  description:
    "Coleta a presença online de um cliente (site, Google Maps e redes sociais) e devolve um dossiê estruturado com " +
    "dados de negócio, contato, identidade visual (cores, tipografia, logo, favicon), assets baixados localmente e " +
    "provenance por campo. Use quando o objetivo for montar/atualizar o dossiê de um cliente a partir de links.",
  // Mesmo modelo do agente raiz do projeto (provider direto do Google).
  model: google("gemini-3.8-flash"),
  outputSchema: dossierSchema,
});
