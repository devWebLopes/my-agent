# 02 — Stack

## Resumo

| Camada | Tecnologia | Versão |
|--------|------------|--------|
| Linguagem | TypeScript | `7.0.2` (devDependency) |
| Runtime | Node.js | `24.x` |
| Framework do agente | `eve` | `^0.55.0` |
| SDK de IA | `ai` (Vercel AI SDK) | `^7.0.93` |
| Conexão Vercel | `@vercel/connect` | `1.0.0` |
| Execução de shell | `just-bash` | `^3.4.2` |
| Validação de esquemas | `zod` | `4.5.4` |
| Tipos Node | `@types/node` | `24.x` (dev) |

## Configuração do módulo

O projeto é um módulo ESM (`"type": "module"` no `package.json`).

## Atalhos de import (`imports`)

O `package.json` define atalhos que permitem importar módulos internos sem caminhos relativos longos:

| Atalho | Resolve para |
|--------|--------------|
| `#*` | `./agent/*` |
| `#evals/*` | `./evals/*` |

Exemplo:

```ts
import config from "#/channels/eve";
```

## Compilador TypeScript (`tsconfig.json`)

Principais opções:

| Opção | Valor |
|-------|-------|
| `target` | `ES2022` |
| `module` | `esnext` |
| `moduleResolution` | `bundler` |
| `types` | `["node", "eve/workflow-modules"]` |
| `strict` | `true` |
| `esModuleInterop` | `true` |
| `skipLibCheck` | `true` |
| `noEmit` | `true` |
| `include` | `["agent/**/*.ts", "evals/**/*.ts"]` |

> O modo `strict` está ativado. Todo código novo deve ser **tipado corretamente** e passar pelo `tsc`.

## Scripts npm

Veja a lista completa e o uso em [`07-comandos-e-scripts.md`](07-comandos-e-scripts.md).

## Engines

O projeto requer **Node.js 24.x** (`"engines": { "node": "24.x" }`). Use uma versão 24 do Node para desenvolvimento local e deploy.
