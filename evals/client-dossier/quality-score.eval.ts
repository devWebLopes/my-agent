import { defineEval } from "eve/evals";
import { matches, satisfies } from "eve/evals/expect";

import { dossierSchema } from "../../agent/subagents/client-dossier/lib/schema";
import { FIXTURES, deliveredDossier, qualityScore, runDossier } from "./sources";

/** §11 — Avaliação global de qualidade de dados: cálculo de completude como métrica de benchmark. */
export default defineEval({
  description: "Score de qualidade de dados: avalia a completude agregada do dossiê extraído.",
  tags: ["client-dossier", "quality", "benchmark"],
  async test(t) {
    const run = await runDossier(t, [
      { type: "website", url: FIXTURES.website },
    ]);

    t.succeeded();
    t.calledSubagent("client-dossier");
    if (run === undefined) return;

    run.child.succeeded();
    run.child.calledTool("build_dossier");

    t.check(deliveredDossier(run.delivered), matches(dossierSchema));
    // Soft check do score de qualidade (> 40 pontos para fontes com website)
    t.check(
      qualityScore(run.delivered),
      satisfies((score) => typeof score === "number" && score >= 40, "score de qualidade >= 40"),
    ).soft().label("score de completude do dossiê");
  },
});
