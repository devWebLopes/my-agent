import { defineEval } from "eve/evals";
import { matches, satisfies } from "eve/evals/expect";

import { dossierSchema } from "../../agent/subagents/client-dossier/lib/schema";
import { FIXTURES, deliveredDossier, deliveredField, runDossier } from "./sources";

/** §11 — Site renderizado em JavaScript / SPA: detecção de looksJsDriven e scrape_page. */
export default defineEval({
  description: "Site JS-driven (SPA): o subagente detecta limitação de renderização e registra status parcial ou aviso.",
  tags: ["client-dossier", "website", "spa"],
  async test(t) {
    const run = await runDossier(t, [{ type: "website", url: FIXTURES.websiteJsDriven }]);

    t.succeeded();
    t.calledSubagent("client-dossier");
    if (run === undefined) return;

    run.child.succeeded();
    run.child.calledTool("fetch_url");
    run.child.calledTool("build_dossier");

    t.check(deliveredDossier(run.delivered), matches(dossierSchema));
    t.check(
      deliveredField(run.delivered, "sources"),
      satisfies(
        (sources) =>
          Array.isArray(sources) &&
          sources.some(
            (s) =>
              s !== null &&
              typeof s === "object" &&
              (s as Record<string, unknown>)["url"] === FIXTURES.websiteJsDriven,
          ),
        "fonte registrada no dossiê",
      ),
    );
  },
});
