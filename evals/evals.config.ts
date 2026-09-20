import { defineEvalConfig } from "eve/evals";

// Os casos de `client-dossier` fazem rede + chamadas de modelo; rodam com
// concorrência baixa e timeout generoso (PRD §11).
export default defineEvalConfig({
  maxConcurrency: 2,
  timeoutMs: 300_000,
});
