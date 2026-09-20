import { defineEval } from "eve/evals";
import { equals, matches, satisfies } from "eve/evals/expect";

import { dossierSchema } from "../../agent/subagents/client-dossier/lib/schema";
import {
  FIXTURES,
  deliveredBusinessField,
  deliveredDossier,
  deliveredStatus,
  runDossier,
} from "./sources";

/** §11 — Consulta CNPJ: dados cadastrais completos da Receita Federal. */
export default defineEval({
  description: "Consulta de CNPJ: o subagente consulta a base pública e extrai razão social, CNPJ e situação cadastral.",
  tags: ["client-dossier", "cnpj"],
  async test(t) {
    const run = await runDossier(t, [{ type: "cnpj", url: FIXTURES.cnpj }]);

    t.succeeded();
    t.calledSubagent("client-dossier");
    if (run === undefined) return;

    run.child.succeeded();
    run.child.calledTool("cnpj_lookup");
    run.child.calledTool("build_dossier");

    t.check(deliveredDossier(run.delivered), matches(dossierSchema));
    t.check(
      deliveredBusinessField(run.delivered, "legalName"),
      satisfies((v) => typeof v === "string" && v.length > 0, "razão social preenchida"),
    );
    t.check(
      deliveredBusinessField(run.delivered, "cnpj"),
      satisfies((v) => typeof v === "string" && v.replace(/\D/g, "").length === 14, "CNPJ com 14 dígitos"),
    );
    t.check(deliveredStatus(run.delivered), satisfies((s) => s === "complete" || s === "partial", "status do dossiê válido"));
  },
});
