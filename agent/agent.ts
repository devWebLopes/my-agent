import { google } from "@ai-sdk/google";
import { defineAgent } from "eve";

export default defineAgent({
  // Provider direto: usa a chave do Google AI Studio (`GOOGLE_GENERATIVE_AI_API_KEY`).
  // O id é o nativo do provedor — sem o prefixo `google/`, que é a forma roteada
  // pelo Vercel AI Gateway (ver docs/09-deploy.md, Opção A).
  model: google("gemini-3.8-flash"),
});
