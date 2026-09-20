# Skill: TypeScript + ESM

> **Categoria:** Habilidade técnica
> **Nível:** Essencial
> **Áreas do projeto:** todo o código sob `agent/` e `evals/`
> **Skills relacionadas:** [Operar o framework eve](framework-eve.md), [Convenções do projeto](convencoes-do-projeto.md)
> **Docs:** [`docs/02-stack.md`](../docs/02-stack.md), [`docs/05-guidelines-de-codigo.md`](../docs/05-guidelines-de-codigo.md)

## Resumo

O projeto usa **TypeScript** (strict) como módulo **ESM** sobre **Node.js 24.x**. O `tsconfig.json` habilita `strict: true` e `noEmit: true` — o build é responsabilidade do `eve`, não do `tsc`.

## Quando usar

- Escrever qualquer código TypeScript novo.
- Corrigir erros de tipo ou revisar PRs.

## Regras obrigatórias

1. **Strict mode ativo** (`"strict": true`): não introduza `any` desnecessário; tipifique entradas e saídas.
2. **ESM** (`"type": "module"`): use `import`/`export` padrão.
3. **`export default defineX({ ... })`** para definições do eve (agente, canais, subagentes).
4. **`noEmit: true`**: não rode `tsc` para gerar build; use `npm run typecheck` só para validar tipos.

## Import paths

Use os atalhos do `package.json` em vez de caminhos relativos longos:

| Atalho | Resolve para |
|--------|--------------|
| `#*` | `./agent/*` |
| `#evals/*` | `./evals/*` |

```ts
import config from "#/channels/eve";
```

Imports do framework eve usam subpaths oficiais:

```ts
import { eveChannel } from "eve/channels/eve";
import { localDev, placeholderAuth, vercelOidc } from "eve/channels/auth";
import { defineSelfModificationAgent } from "eve/self-modification/agent";
import selfModification from "eve/self-modification";
```

## Estilo

- Indentação de **2 espaços**.
- **Ponto-e-vírgula** ao final das linhas.
- **Aspas duplas** para strings.
- Comentários curtos e relevantes.

## Armadilhas

- Não use `require`/`module.exports` (o projeto é ESM).
- Não ajuste `tsconfig.json` sem necessidade; `include` já cobre `agent/**/*.ts` e `evals/**/*.ts`.
- Use **Node.js 24.x** (ver `engines` no `package.json`).

## Referências

- [`docs/02-stack.md`](../docs/02-stack.md)
- [`docs/05-guidelines-de-codigo.md`](../docs/05-guidelines-de-codigo.md)
