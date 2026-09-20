import { defineEval } from "eve/evals";
import { matches, satisfies } from "eve/evals/expect";

import { dossierSchema } from "../../agent/subagents/client-dossier/lib/schema";
import {
  FIXTURES,
  deliveredBusinessField,
  deliveredConfidence,
  deliveredDossier,
  runDossier,
} from "./sources";

/** §11 — Fontes combinadas: CNPJ + Website com resolução de conflitos e proveniência. */
export default defineEval({
  description: "Fontes combinadas (CNPJ + Website): consolidação prioriza CNPJ para dados fiscais e Website para identidade visual.",
  tags: ["client-dossier", "cnpj", "website", "consolidation"],
  async test(t) {
    const run = await runDossier(t, [
      { type: "cnpj", url: FIXTURES.cnpj },
      { type: "website", url: FIXTURES.website },
    ]);

    t.succeeded();
    t.calledSubagent("client-dossier");
    if (run === undefined) return;

    run.child.succeeded();
    run.child.calledTool("cnpj_lookup");
    run.child.calledTool("fetch_url");
    run.child.calledTool("build_dossier");

    t.check(deliveredDossier(run.delivered), matches(dossierSchema));
    t.check(
      deliveredBusinessField(run.delivered, "legalName"),
      satisfies((v) => typeof v === "string" && v.length > 0, "razão social fiscal preenchida"),
    );
    t.check(
      deliveredConfidence(run.delivered),
      satisfies((conf) => Array.isArray(conf) && conf.length > 0, "lista de confiança/proveniência preenchida"),
    );
  },
});
