import { defineEval } from "eve/evals";
import { matches, satisfies } from "eve/evals/expect";

import { dossierSchema } from "../../agent/subagents/client-dossier/lib/schema";
import {
  FIXTURES,
  deliveredBusinessField,
  deliveredDossier,
  deliveredField,
  runDossier,
} from "./sources";

/** §11 — Website com meta tags ricas: extração de nome comercial, descrição e identidade visual. */
export default defineEval({
  description: "Website com meta tags ricas: extração de nome comercial, descrição, cores e tipografia.",
  tags: ["client-dossier", "website", "quality"],
  async test(t) {
    const run = await runDossier(t, [{ type: "website", url: FIXTURES.websiteRich }]);

    t.succeeded();
    t.calledSubagent("client-dossier");
    if (run === undefined) return;

    run.child.succeeded();
    run.child.calledTool("fetch_url");
    run.child.calledTool("extract_visual_identity");
    run.child.calledTool("build_dossier");

    t.check(deliveredDossier(run.delivered), matches(dossierSchema));
    t.check(
      deliveredBusinessField(run.delivered, "name"),
      satisfies((v) => typeof v === "string" && v.trim().length > 0, "nome comercial extraído"),
    );
    t.check(
      deliveredBusinessField(run.delivered, "description"),
      satisfies((v) => typeof v === "string" && v.trim().length > 0, "descrição do negócio extraída"),
    );
    t.check(
      deliveredField(run.delivered, "visualIdentity"),
      satisfies(
        (v) =>
          v !== null &&
          typeof v === "object" &&
          Array.isArray((v as Record<string, unknown>)["colors"]) &&
          ((v as Record<string, unknown>)["colors"] as unknown[]).length > 0,
        "paleta de cores extraída",
      ),
    );
  },
});
