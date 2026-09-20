import { defineEval } from "eve/evals";
import { equals, matches, satisfies } from "eve/evals/expect";

import { dossierSchema } from "../../agent/subagents/client-dossier/lib/schema";
import {
  FIXTURES,
  deliveredDossier,
  deliveredField,
  deliveredStatus,
  hasUnhealthySource,
  nonEmptyList,
  runDossier,
} from "./sources";

/** §11 — Fonte quebrada: status partial, campo em missing[], demais fontes OK. */
export default defineEval({
  description: "Fonte 404 não derruba a coleta: o dossiê sai como partial com missing[].",
  tags: ["client-dossier", "partial"],
  async test(t) {
    const run = await runDossier(t, [
      { type: "website", url: FIXTURES.website },
      { type: "website", url: FIXTURES.broken },
    ]);

    t.succeeded();
    t.calledSubagent("client-dossier");
    if (run === undefined) return;

    run.child.succeeded();
    run.child.calledTool("build_dossier");

    // A fonte quebrada fica registrada como `failed`/`partial` em sources[].
    t.check(hasUnhealthySource(run.delivered), equals(true)).label(
      "fonte quebrada registrada como partial/failed",
    );

    // O dossiê continua válido, sai como `partial` e lista os campos ausentes.
    t.check(deliveredDossier(run.delivered), matches(dossierSchema));
    t.check(deliveredStatus(run.delivered), equals("partial"));
    t.check(
      deliveredField(run.delivered, "missing"),
      satisfies(nonEmptyList, "missing[] preenchido"),
    );

    // O relatório ao usuário precisa dizer que ficou parcial.
    run.delivered.messageIncludes(/parcial|partial/i);
  },
});

