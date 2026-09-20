import { defineEval } from "eve/evals";
import { matches, satisfies } from "eve/evals/expect";

import { dossierSchema } from "../../agent/subagents/client-dossier/lib/schema";
import { FIXTURES, deliveredDossier, deliveredField, runDossier } from "./sources";

/** §11 — Rede social bloqueada (Facebook/Instagram): degradação elegante com preservação do handle. */
export default defineEval({
  description: "Rede social com bloqueio/login wall: o subagente tolera a resposta e preserva handle/URL em social[].",
  tags: ["client-dossier", "social", "error-handling"],
  async test(t) {
    const run = await runDossier(t, [{ type: "social", url: FIXTURES.facebook }]);

    t.succeeded();
    t.calledSubagent("client-dossier");
    if (run === undefined) return;

    run.child.succeeded();
    run.child.calledTool("social_profile");
    run.child.calledTool("build_dossier");

    t.check(deliveredDossier(run.delivered), matches(dossierSchema));
    t.check(
      deliveredField(run.delivered, "social"),
      satisfies(
        (socialList) =>
          Array.isArray(socialList) &&
          socialList.some(
            (p) =>
              p !== null &&
              typeof p === "object" &&
              (p as Record<string, unknown>)["network"] === "facebook",
          ),
        "perfil de facebook registrado na lista social",
      ),
    );
  },
});
