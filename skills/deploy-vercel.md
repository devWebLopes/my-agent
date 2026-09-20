# Skill: Deploy na Vercel

> **Categoria:** Ferramenta
> **Nível:** Essencial
> **Áreas do projeto:** `agent/`, `.vercelignore`
> **Skills relacionadas:** [Validação e scripts](validacao-e-scripts.md), [Canais e autenticação](canais-e-autenticacao.md)
> **Docs:** [`docs/09-deploy.md`](../docs/09-deploy.md)

## Resumo

O agente é deployado como **backend serverless na Vercel**, orquestrado pela CLI `eve`. Use o `eve` (não o Vercel CLI) para linkar e publicar.

## Quando usar

- Publicar o agente em produção.
- Re-deployar após mudanças.

## Comandos

```sh
# Deploy rápido (interativo)
eve deploy

# Deploy não interativo
eve link --non-interactive --project <name-or-id> [--team <team-id-or-slug>]
eve deploy --non-interactive --yes [--project <name-or-id>]
```

## Regras

- `eve link` pode ser um pré-requisito reportado por um setup; rode-o e então retome a continuação.
- Quando um evento de setup concluído tiver `deploymentRequired: true`, rode o comando `next` reportado por ele.
- Antes de liberar para o público, revise a autenticação (ver [Canais e autenticação](canais-e-autenticacao.md)).

## Arquivos ignorados no deploy

O `.vercelignore` exclui: `node_modules`, `.env*`, `.eve`, `.next`, `.output`, `.nitro`, `dist`.

## Procedimento

1. Valide localmente (`npm run typecheck`, `npm run build`).
2. `eve link --non-interactive --project <name-or-id>` (se ainda não linkado).
3. `eve deploy --non-interactive --yes`.
4. Confira o endpoint e a auth em produção.

## Armadilhas

- Use `--non-interactive --yes` para CI/agentes; nunca deixe prompts em aberto.
- Não versionar segredos (`.env*` já é ignorado).
- O endpoint deployado só responde a quem a auth permitir (ver canal).

## Referências

- [`docs/09-deploy.md`](../docs/09-deploy.md)
- eve deployment docs: <https://eve.dev/docs/guides/deployment/vercel>
