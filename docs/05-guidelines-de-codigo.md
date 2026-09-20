# 05 — Guidelines de código

Estas são as convenções que **todo código novo** deve seguir.

## TypeScript

1. **Strict mode ativo.** O `tsconfig.json` usa `"strict": true`. Não introduza `any` desnecessário e tipifique entradas e saídas.
2. **ESM.** O projeto é `"type": "module"`. Use `import`/`export` padrão do ESM.
3. **`export default` para definições do eve.** Canais, subagentes e agentes usam `export default defineX({ ... })`.
4. **Sem emissão de build local.** `noEmit: true` — o build é responsabilidade do `eve`, não do `tsc`.

## Imports

- Use os **atalhos de import** sempre que possível em vez de caminhos relativos longos:
  - `#*` → `./agent/*`
  - `#evals/*` → `./evals/*`
- Imports do framework eve usam subpaths oficiais, por exemplo:
  - `eve`
  - `eve/channels/eve`
  - `eve/channels/auth`
  - `eve/self-modification/agent`
  - `eve/self-modification/config`
  - `eve/self-modification/sandbox`
  - `eve/self-modification`

## Organização de arquivos

- Capacidades novas (tools, connections, channels, skills, subagents, schedules) devem ser criadas **sob `agent/`**, nas subpastas correspondentes.
- Um subagente deve seguir a estrutura: `agent.ts`, `config.ts`, `sandbox.ts` e `extensions/` quando aplicável.

## Estilo

- Siga o estilo já presente no repositório (indentação de 2 espaços, ponto-e-vírgula, aspas duplas).
- Mantenha comentários curtos e relevantes, como os comentários explicativos existentes em `agent/channels/eve.ts`.

## Regras não negociáveis

1. **Não edite `agent/agent.ts`** para trocar o modelo sem solicitação explícita do usuário.
2. **Não edite arquivos gerados** (`.eve/`, `node_modules/`).
3. **Não versione segredos.** `env.local` e `.env*` já estão ignorados; nunca adicione credenciais em código.
4. **Leia a documentação do eve antes de escrever código** que envolva tools, connections, channels, skills, subagents, schedules ou deploy (`node_modules/eve/docs/README.md`, ou <https://eve.dev/docs> se os docs locais não existirem).
5. **Prefira integrações existentes** ao invés de implementar do zero (veja [`06-padroes-e-convencoes.md`](06-padroes-e-convencoes.md)).
