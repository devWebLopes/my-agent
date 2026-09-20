import { defineEval } from "eve/evals";
import { matches, satisfies } from "eve/evals/expect";

import { dossierSchema } from "../../agent/subagents/client-dossier/lib/schema";
import { FIXTURES, deliveredDossier, deliveredFinalUrl, runDossier } from "./sources";

/** §11 — Redirect: URL final resolvida e registrada em `sources[]`. */
export default defineEval({
  description: "URL que redireciona: a URL final aparece no dossiê.",
  tags: ["client-dossier", "redirect"],
  async test(t) {
    const run = await runDossier(t, [{ type: "website", url: FIXTURES.redirect }]);

    t.succeeded();
    t.calledSubagent("client-dossier");
    if (run === undefined) return;

    run.child.succeeded();
    run.child.calledTool("fetch_url");
    run.child.calledTool("build_dossier");

    // A URL final resolvida fica registrada em `sources[].finalUrl` (RF-05).
    t.check(
      deliveredFinalUrl(run.delivered),
      satisfies(
        (value) =>
          typeof value === "string" && value.startsWith("https://") && value !== FIXTURES.redirect,
        "finalUrl em https, diferente da URL pedida",
      ),
    );
    t.check(deliveredDossier(run.delivered), matches(dossierSchema));
  },
});

