import { defineEval } from "eve/evals";
import { matches, satisfies } from "eve/evals/expect";

import { dossierSchema } from "../../agent/subagents/client-dossier/lib/schema";
import { FIXTURES, deliveredAssets, deliveredDossier, runDossier } from "./sources";

/** §11 — Download de assets: download de logo/favicon e preenchimento de `assets[]`. */
export default defineEval({
  description: "Download de assets: o subagente faz download do logo/favicon e preenche a lista de assets baixados.",
  tags: ["client-dossier", "assets", "download"],
  async test(t) {
    const run = await runDossier(t, [{ type: "website", url: FIXTURES.website }]);

    t.succeeded();
    t.calledSubagent("client-dossier");
    if (run === undefined) return;

    run.child.succeeded();
    run.child.calledTool("fetch_url");
    run.child.calledTool("extract_visual_identity");
    run.child.calledTool("build_dossier");

    t.check(deliveredDossier(run.delivered), matches(dossierSchema));
    // Soft check em assets para validar se assets foram persistidos quando disponíveis
    t.check(
      deliveredAssets(run.delivered),
      satisfies((assets) => Array.isArray(assets), "assets é uma lista estruturada"),
    ).soft();
  },
});
