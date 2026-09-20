import { defineEval } from "eve/evals";
import { includes, matches, satisfies } from "eve/evals/expect";

import { dossierSchema } from "../../agent/subagents/client-dossier/lib/schema";
import {
  FIXTURES,
  deliveredDossier,
  deliveredField,
  nonEmptyList,
  runDossier,
  turnText,
} from "./sources";

/** §11 — Misto: consolidação sem duplicidade, com provenance por campo. */
export default defineEval({
  description: "Website + Google Maps + Instagram: consolidação com provenance.",
  tags: ["client-dossier", "mixed"],
  async test(t) {
    const run = await runDossier(t, [
      { type: "website", url: FIXTURES.website },
      { type: "google_maps", url: FIXTURES.maps },
      { type: "instagram", url: FIXTURES.instagram },
    ]);

    t.succeeded();
    t.calledSubagent("client-dossier");
    if (run === undefined) return;

    run.child.succeeded();
    run.child.calledTool("build_dossier");

    // O dossiê entregue é válido, tem provenance e as três fontes registradas.
    t.check(deliveredDossier(run.delivered), matches(dossierSchema));
    t.check(
      deliveredField(run.delivered, "confidence"),
      satisfies(nonEmptyList, "confidence[] com provenance"),
    );
    t.check(
      deliveredField(run.delivered, "sources"),
      satisfies(
        (value) => Array.isArray(value) && value.length === 3,
        "as três fontes registradas em sources[]",
      ),
    );

    // O relatório ao usuário precisa dizer se ficou completo ou parcial.
    run.delivered.messageIncludes(/parcial|partial|completo|complete/i);
    t.check(turnText(run.delivered), includes("dossi").soft());
  },
});

