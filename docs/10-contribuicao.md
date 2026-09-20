# 10 — Contribuição

Guia para quem vai contribuir com o projeto.

## Antes de começar

1. Leia [`01-visao-geral.md`](01-visao-geral.md) e [`03-estrutura-do-projeto.md`](03-estrutura-do-projeto.md) para entender o que é o projeto e onde cada coisa vive.
2. Leia [`05-guidelines-de-codigo.md`](05-guidelines-de-codigo.md) e [`06-padroes-e-convencoes.md`](06-padroes-e-convencoes.md) — são obrigatórias para qualquer mudança.

## Checklist de contribuição

- [ ] Identifiquei se a mudança é de **conteúdo** (`instructions.md`) ou de **código** (sob `agent/`).
- [ ] Li a página relevante da documentação do eve quando a mudança envolve tools, connections, channels, skills, subagents, schedules ou deploy.
- [ ] Preferi uma **integração existente** (registry) em vez de implementar do zero, quando aplicável.
- [ ] Não alterei `agent/agent.ts` sem solicitação explícita.
- [ ] Não editei arquivos gerados (`.eve/`, `node_modules/`) nem versionei segredos.
- [ ] Rodei `npm run typecheck` (e a validação específica da tarefa).
- [ ] Mantive a estrutura de pastas e o estilo existentes.

## Validação

Rode a validação que a tarefa pedir. Quando ela não estabelecer o comportamento alterado, rode a verificação mais estreita relevante:

```sh
npm run typecheck
```

## Regras gerais (herdadas de `AGENTS.md`)

- Documentação primeiro, código depois.
- Loop de descoberta limitado: leia só o necessário.
- Use o `eve` para operações na Vercel (`eve link` / `eve deploy`).
- Não faça descoberta excessiva em `node_modules` ou na árvore de docs.
