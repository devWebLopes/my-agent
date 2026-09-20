import { defineEval } from "eve/evals";
import { equals, matches } from "eve/evals/expect";

import { dossierSchema } from "../../agent/subagents/client-dossier/lib/schema";
import { FIXTURES, deliveredDossier, deliveredMissingIncludes, runDossier } from "./sources";

/** §11 — Só Google Maps: categoria, rating, horários, fotos. */
export default defineEval({
  description: "Só Google Maps: a ficha é consultada via google_places e entra no dossiê.",
  tags: ["client-dossier", "google_maps"],
  async test(t) {
    const run = await runDossier(t, [{ type: "google_maps", url: FIXTURES.maps }]);

    t.succeeded();
    t.calledSubagent("client-dossier");
    if (run === undefined) return;

    run.child.succeeded();
    run.child.calledTool("google_places");
    run.child.calledTool("build_dossier");

    t.check(deliveredDossier(run.delivered), matches(dossierSchema));
    // Sem GOOGLE_MAPS_API_KEY o dossiê precisa sinalizar a ausência da ficha.
    t.check(deliveredMissingIncludes(run.delivered, "maps"), equals(true)).label(
      "maps ausente registrado em missing[]",
    );
  },
});
