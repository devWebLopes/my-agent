# Documentação — my-agent

Índice principal da documentação do projeto **my-agent**.

Este diretório (`docs/`) reúne, em arquivos separados, tudo o que qualquer pessoa precisa para entender o que o projeto faz, qual é a sua stack, como ele está organizado e — principalmente — quais são as **guidelines** e **padrões** que devem ser seguidos ao contribuir.

## Sobre o projeto em uma frase

`my-agent` é um **agente de IA** construído com o framework **eve** (TypeScript + Node.js 24), exposto por canais HTTP e deployado como backend serverless na **Vercel**.

## Índice

| # | Arquivo | Conteúdo |
|---|---------|----------|
| 01 | [`visao-geral`](01-visao-geral.md) | O que é o projeto, objetivo e tipo de aplicação |
| 02 | [`stack`](02-stack.md) | Tecnologias, runtime, dependências e versões |
| 03 | [`estrutura-do-projeto`](03-estrutura-do-projeto.md) | Árvore de diretórios e responsabilidade de cada arquivo |
| 04 | [`arquitetura`](04-arquitetura.md) | Agente, canais de comunicação e subagentes |
| 05 | [`guidelines-de-codigo`](05-guidelines-de-codigo.md) | Convenções de código TypeScript/eve |
| 06 | [`padroes-e-convencoes`](06-padroes-e-convencoes.md) | Padrões e convenções específicos do projeto |
| 07 | [`comandos-e-scripts`](07-comandos-e-scripts.md) | Scripts npm e comandos da CLI `eve` |
| 08 | [`fluxo-de-desenvolvimento`](08-fluxo-de-desenvolvimento.md) | Loop de desenvolvimento e validação |
| 09 | [`deploy`](09-deploy.md) | Como deployar na Vercel |
| 10 | [`contribuicao`](10-contribuicao.md) | Guia de contribuição e checklist |

## PRDs

Documentos de requisitos de produto (PRDs) para funcionalidades planejadas:

| [`PRD-subagente-dossie-clientes`](PRD-subagente-dossie-clientes.md) | Requisitos do subagente `client-dossier` (coleta de dados + identidade visual + dossiê de cliente). |
| [`PRD-organizacao-dossies-pastas`](PRD-organizacao-dossies-pastas.md) | Organização e estrutura de pastas para dossiês isolados por consulta e nome pesquisado. |

## Leitura recomendada

- **Quer entender o projeto?** Comece por [`01-visao-geral.md`](01-visao-geral.md) e [`02-stack.md`](02-stack.md).
- **Vai contribuir com código?** Leia [`05-guidelines-de-codigo.md`](05-guidelines-de-codigo.md) e [`06-padroes-e-convencoes.md`](06-padroes-e-convencoes.md) antes de abrir qualquer alteração.
- **Vai rodar ou deployar?** Consulte [`07-comandos-e-scripts.md`](07-comandos-e-scripts.md) e [`09-deploy.md`](09-deploy.md).
- **Vai operar/automatizar tarefas?** Consulte as skills em [`skills/README.md`](../skills/README.md).

## Skills

Além desta documentação (que descreve o **contexto** do projeto), o diretório [`skills/`](../skills/) documenta, em arquivos `.md`, as **habilidades** que os agentes precisam para **operar** o projeto — habilidades técnicas, regras de negócio e ferramentas específicas. O índice principal é [`skills/README.md`](../skills/README.md).

| Skill | Arquivo | Categoria |
|-------|---------|-----------|
| Operar o framework eve | [`framework-eve`](../skills/framework-eve.md) | Técnica |
| TypeScript + ESM | [`typescript-esm`](../skills/typescript-esm.md) | Técnica |
| Canais e autenticação | [`canais-e-autenticacao`](../skills/canais-e-autenticacao.md) | Técnica |
| Subagente de auto-modificação | [`subagente-self-modification`](../skills/subagente-self-modification.md) | Técnica |
| Subagente de dossiê de clientes | [`subagente-client-dossier`](../skills/subagente-client-dossier.md) | Técnica |
| Registry e integrações | [`registry-e-integracoes`](../skills/registry-e-integracoes.md) | Ferramenta |
| Deploy na Vercel | [`deploy-vercel`](../skills/deploy-vercel.md) | Ferramenta |
| Validação e scripts | [`validacao-e-scripts`](../skills/validacao-e-scripts.md) | Ferramenta |
| Conteúdo vs. código | [`conteudo-vs-codigo`](../skills/conteudo-vs-codigo.md) | Regra de negócio |
| Convenções do projeto | [`convencoes-do-projeto`](../skills/convencoes-do-projeto.md) | Regra de negócio |

## Referências externas

- Documentação oficial do eve: <https://eve.dev/docs>
- Repositório do eve: <https://github.com/vercel/eve>
