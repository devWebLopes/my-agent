import { defineEval } from "eve/evals";
import { includes, matches } from "eve/evals/expect";

import { dossierSchema } from "../../agent/subagents/client-dossier/lib/schema";
import { FIXTURES, deliveredDossier, runDossier, turnText } from "./sources";

/** §11 — Só website: negócio + identidade visual + assets extraídos. */
export default defineEval({
  description: "Só website: o subagente coleta o site e entrega o dossiê validado ao agente raiz.",
  tags: ["client-dossier", "website"],
  async test(t) {
    const run = await runDossier(t, [{ type: "website", url: FIXTURES.website }]);

    t.succeeded();
    t.calledSubagent("client-dossier");
    if (run === undefined) return;

    // A coleta roda na sessão filha do subagente.
    run.child.succeeded();
    run.child.calledTool("fetch_url");
    run.child.calledTool("extract_visual_identity");
    run.child.calledTool("build_dossier");

    // O pai recebe um dossiê que valida contra o contrato (RNF-06).
    t.check(deliveredDossier(run.delivered), matches(dossierSchema));
    t.check(turnText(run.delivered), includes("dossiers/"));
  },
});
