import { defineEval } from "eve/evals";
import { equals, matches } from "eve/evals/expect";

import { dossierSchema } from "../../agent/subagents/client-dossier/lib/schema";
import { FIXTURES, deliveredDossier, deliveredMissingIncludes, runDossier } from "./sources";

/** §11 — Site sem logo: `visualIdentity.logo` ausente e sinalizado em `missing[]`. */
export default defineEval({
  description: "Site sem logo/favicon: o campo fica ausente e é sinalizado em missing[].",
  tags: ["client-dossier", "missing"],
  async test(t) {
    const run = await runDossier(t, [{ type: "website", url: FIXTURES.websiteWithoutLogo }]);

    t.succeeded();
    t.calledSubagent("client-dossier");
    if (run === undefined) return;

    run.child.succeeded();
    run.child.calledTool("extract_visual_identity");
    run.child.calledTool("build_dossier");

    t.check(deliveredDossier(run.delivered), matches(dossierSchema));
    t.check(deliveredMissingIncludes(run.delivered, "visualIdentity.logo"), equals(true)).label(
      "logo ausente sinalizado em missing[]",
    );
  },
});
