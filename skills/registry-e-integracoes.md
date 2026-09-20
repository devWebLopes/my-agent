# Skill: Registry e integrações

> **Categoria:** Ferramenta
> **Nível:** Essencial
> **Áreas do projeto:** integrações de terceiros
> **Skills relacionadas:** [Operar o framework eve](framework-eve.md), [Deploy na Vercel](deploy-vercel.md)
> **Docs:** [`docs/06-padroes-e-convencoes.md`](../docs/06-padroes-e-convencoes.md)

## Resumo

Quando a tarefa envolve um produto/serviço externo (API, banco, SaaS, etc.), a regra é **pesquisar o registry do eve antes de implementar do zero**.

## Quando usar

- Integrar um produto/serviço externo ao agente.
- Descobrir se já existe um canal/adaptação nativa para algo.

## Comandos

```sh
# Buscar integrações
eve registry search <query> --json

# Ver detalhes de um item (inclui link para a doc)
eve registry view <item>

# Instalar sem prompt interativo
eve add <item> --non-interactive
```

## Critérios de escolha

1. Prefira itens com `implementation: "native"`.
2. Use adaptadores **Chat SDK** quando não houver canal nativo adequado.
3. `registry view` aponta a documentação do item — leia antes de instalar.

## Código de retorno do `eve add`

| Exit code | Significado | Ação |
|-----------|-------------|------|
| `0` | Setup concluído. | — |
| `1` | Falhou. | Investigar. |
| `2` | Precisa de resposta/pré-requisito. | Rode o `next.command` do evento NDJSON final. |

## Regras

- Para pergunta **não-secreta**, substitua o placeholder `<JSON value>` pela resposta coletada (strings precisam de aspas JSON).
- **Nunca** passe um segredo em `--answer`.

## Procedimento

1. `eve registry search <query> --json`.
2. `eve registry view <item>` e leia a doc apontada.
3. `eve add <item> --non-interactive`.
4. Trate o exit code (0/1/2) conforme a tabela.

## Armadilhas

- Não implemente do zero o que o registry já oferece.
- Não use prompts interativos; sempre `--non-interactive`.
- Segredos jamais em `--answer`.

## Referências

- [`docs/06-padroes-e-convencoes.md`](../docs/06-padroes-e-convencoes.md)
- eve docs (instalação de integrações): <https://eve.dev/docs>
