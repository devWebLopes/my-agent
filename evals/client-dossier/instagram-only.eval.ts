import { defineEval } from "eve/evals";
import { matches, satisfies } from "eve/evals/expect";

import { dossierSchema } from "../../agent/subagents/client-dossier/lib/schema";
import { FIXTURES, deliveredDossier, deliveredField, includesInOutput, nonEmptyList, runDossier } from "./sources";

/** §11 — Só Instagram: handle, bio, seguidores, links. */
export default defineEval({
  description: "Só Instagram: o perfil é coletado como `social[]` no dossiê.",
  tags: ["client-dossier", "instagram"],
  async test(t) {
    const run = await runDossier(t, [{ type: "instagram", url: FIXTURES.instagram }]);

    t.succeeded();
    t.calledSubagent("client-dossier");
    if (run === undefined) return;

    run.child.succeeded();
    run.child.calledTool("social_profile");
    run.child.calledTool("build_dossier");
    // Mesmo com a coleta bloqueada pela plataforma, o perfil entra em `social[]`.
    run.child.calledTool("build_dossier", { output: includesInOutput("\"social\"") });

    t.check(deliveredDossier(run.delivered), matches(dossierSchema));
    t.check(
      deliveredField(run.delivered, "social"),
      satisfies(nonEmptyList, "social[] preenchido"),
    );
  },
});
