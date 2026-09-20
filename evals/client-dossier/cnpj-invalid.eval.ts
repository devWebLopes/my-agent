import { defineEval } from "eve/evals";
import { equals, matches } from "eve/evals/expect";

import { dossierSchema } from "../../agent/subagents/client-dossier/lib/schema";
import {
  FIXTURES,
  deliveredDossier,
  deliveredMissingIncludes,
  deliveredStatus,
  runDossier,
} from "./sources";

/** §11 — CNPJ inválido: falha de validação ou consulta inexistente registrada em missing[]. */
export default defineEval({
  description: "CNPJ inválido: o subagente detecta a inconsistência e sinaliza a falha em missing[].",
  tags: ["client-dossier", "cnpj", "error-handling"],
  async test(t) {
    const run = await runDossier(t, [{ type: "cnpj", url: FIXTURES.cnpjInvalid }]);

    t.succeeded();
    t.calledSubagent("client-dossier");
    if (run === undefined) return;

    run.child.succeeded();
    run.child.calledTool("cnpj_lookup");
    run.child.calledTool("build_dossier");

    t.check(deliveredDossier(run.delivered), matches(dossierSchema));
    t.check(deliveredStatus(run.delivered), equals("partial")).label("dossiê parcial");
    t.check(deliveredMissingIncludes(run.delivered, "business.cnpj"), equals(true)).label(
      "cnpj ausente ou falho sinalizado em missing[]",
    );
  },
});
