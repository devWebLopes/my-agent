# 09 — Deploy (Vercel)

## Deploy rápido

Do diretório raiz do projeto:

```sh
eve deploy
```

O `eve deploy` linka um projeto Vercel (se necessário) e faz o deploy do agente para produção.

## Deploy não interativo

```sh
eve link --non-interactive --project <name-or-id> [--team <team-id-or-slug>]
eve deploy --non-interactive --yes [--project <name-or-id>]
```

- `eve link` pode ser um pré-requisito reportado por um setup; rode-o e então retome a continuação.
- Quando um evento de setup concluído tiver `deploymentRequired: true`, rode o comando `next` reportado por ele.

## Autenticação e acesso em produção

O canal (`agent/channels/eve.ts`) define quem pode acessar o agente deployado:

- `vercelOidc()` — libera o TUI do eve e os próprios deploys Vercel.
- `placeholderAuth()` — **bloqueia** requisições de navegador em produção. **Substitua** pelo provedor de auth da aplicação (ex.: Auth.js, Clerk) ou use `none()` para uma demo pública antes de liberar o agente para usuários reais.

## Arquivos ignorados no deploy

O `.vercelignore` exclui do deploy: `node_modules`, `.env*`, `.eve`, `.next`, `.output`, `.nitro`, `dist`.

## Variáveis de ambiente

Segredos **não** vão para o deploy junto com o código: configure-os no projeto da Vercel (Settings → Environment
Variables) e, no ambiente local, no arquivo `.env.local`.

> O arquivo local precisa se chamar `.env.local` (com ponto) para ser carregado; um arquivo `env.local` sem o ponto não é lido pelo eve.

| Variável | Necessária para | Sem ela |
|----------|-----------------|---------|
| `AI_GATEWAY_API_KEY` (ou `VERCEL_OIDC_TOKEN` via `eve link`) | Chamadas de modelo do agente e dos evals no caminho de gateway | `MODEL_CALL_FAILED: AI Gateway received no credentials` no TUI e em `npm run eval` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Chamadas no caminho de **provedor direto** (`@ai-sdk/google`) | `The model provider could not load an API key` |
| `GOOGLE_MAPS_API_KEY` | Ficha do cliente no Google Maps, usada pelo subagente `client-dossier` | A tool `google_places` retorna `ok:false` e o dossiê registra `maps` em `missing[]` (o resto da coleta continua) |

### Opção A — Vercel AI Gateway (alternativa; hoje NÃO é o caminho ativo)

Ids no formato `provedor/modelo` (ex.: `google/gemini-3.8-flash` em `agent/agent.ts`) são roteados pelo
[Vercel AI Gateway](https://vercel.com/docs/ai-gateway). Nesse caminho a credencial é do **gateway**, não do Google:

```sh
eve link            # linka o projeto Vercel e grava VERCEL_OIDC_TOKEN em .env.local
```

ou, criando uma chave em <https://vercel.com/dashboard/ai/api-keys>:

```dotenv
# .env.local
AI_GATEWAY_API_KEY=vck_...
```

Trocar o id do modelo: `eve set --model google/gemini-3.8-flash` (ou `/model ...` no TUI), que edita `agent/agent.ts`.

### Opção B — provedor direto do Google — CAMINHO ATIVO NESTE PROJETO

Se você quer autenticar com a **sua** chave do Gemini, use o provider-authored `LanguageModel`:

```sh
npm install @ai-sdk/google
```

```ts title="agent/agent.ts"
import { google } from "@ai-sdk/google";
import { defineAgent } from "eve";

export default defineAgent({
  model: google("gemini-3.8-flash"),
});
```

```dotenv
# .env.local
GOOGLE_GENERATIVE_AI_API_KEY=sua_chave_do_google_ai_studio
```

Nesse caminho o gateway não é usado. Observações:

- O id do provedor usa a nomenclatura nativa (`gemini-3.8-flash`); ids de gateway usam ponto e prefixo de provedor.
- Uma config com modelo autorizado pelo SDK vira *runtime entry*: `eve set --model` e `/model` **não** conseguem
  reescrevê-la — a mudança passa a ser no próprio `agent/agent.ts`.
- Subagentes têm `agent.ts` próprio e **não** herdam o modelo do raiz: repita a configuração em
  `agent/subagents/<id>/agent.ts` (por exemplo em `client-dossier`).

## Referências

- Documentação de deployment do eve: <https://eve.dev/docs/guides/deployment/vercel>
