# Skill: Validação e scripts

> **Categoria:** Ferramenta
> **Nível:** Essencial
> **Áreas do projeto:** `package.json`, `agent/`, `evals/`
> **Skills relacionadas:** [Operar o framework eve](framework-eve.md), [Deploy na Vercel](deploy-vercel.md)
> **Docs:** [`docs/07-comandos-e-scripts.md`](../docs/07-comandos-e-scripts.md), [`docs/08-fluxo-de-desenvolvimento.md`](../docs/08-fluxo-de-desenvolvimento.md)

## Resumo

Os scripts npm e os comandos da CLI `eve` orquestram o ciclo de desenvolvimento: rodar localmente, compilar, checar tipos e avaliar.

## Scripts npm

| Comando | Script | Descrição |
|---------|--------|-----------|
| `npm run dev` | `eve dev` | Servidor de dev + TUI interativo. |
| `npm run build` | `eve build` | Compila o agente. |
| `npm run start` | `eve start` | Inicia em modo produção local. |
| `npm run deploy` | `eve deploy` | Deploy na Vercel. |
| `npm run eval` | `eve eval` | Executa avaliações (`evals/`). |
| `npm run typecheck` | `tsc` | Checagem de tipos TypeScript. |

## Fluxo típico

```sh
npm run dev        # 1. desenvolver e testar localmente
npm run typecheck  # 2. validar tipos
npm run deploy     # 3. publicar
```

## Regra de validação

> Rode a validação que a tarefa pedir. Quando ela não cobrir o comportamento alterado, rode a checagem mais estreita relevante (`npm run typecheck`).

## Procedimento

1. Implemente a mudança.
2. Rode `npm run typecheck`.
3. Rode a validação específica da tarefa (se houver).
4. Se precisar exercitar o agente, use `npm run dev` (TUI interativo).

## Armadilhas

- `tsc` só checa tipos (`noEmit: true`); o build é do `eve` (`eve build`).
- Requer **Node.js 24.x** — confira `engines` no `package.json`.
- `npm run eval` depende de avaliações em `evals/`; só rode quando existirem.

## Referências

- [`docs/07-comandos-e-scripts.md`](../docs/07-comandos-e-scripts.md)
- [`docs/08-fluxo-de-desenvolvimento.md`](../docs/08-fluxo-de-desenvolvimento.md)
