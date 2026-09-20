# Skills — my-agent

Índice principal das **skills** (habilidades) que os agentes de IA precisam dominar para operar, evoluir e manter este projeto com segurança e consistência.

Este diretório (`skills/`) documenta, em arquivos `.md`, as **habilidades técnicas**, as **regras de negócio** e as **ferramentas específicas** usadas no dia a dia do projeto. Cada skill é autocontida: descreve o que é, quando aplicar, o que saber antes, o passo a passo, exemplos e armadilhas.

> **Nota sobre terminologia:** estas skills `.md` são **conhecimento operacional/procedural** que o agente consulta antes de agir. Elas são **diferentes** das "skills" de runtime do framework eve, que são capacidades de código (TypeScript) criadas sob `agent/` e documentadas em <https://eve.dev/docs>. Aqui registramos o *como fazer*; o *código* vive em `agent/`.

## Como usar este índice

1. Identifique o tipo de tarefa (conteúdo, código, integração, deploy...).
2. Localize a skill correspondente na tabela abaixo.
3. Leia a skill **antes** de agir e siga o checklist descrito nela.
4. Ao terminar, valide conforme a skill [Validação e scripts](validacao-e-scripts.md).

## Índice de skills

| Skill | Arquivo | Categoria | O que faz |
|-------|---------|-----------|-----------|
| Operar o framework eve | [`framework-eve`](framework-eve.md) | Técnica | Criar e organizar capacidades (tools, canais, subagentes, skills, schedules) com os helpers `define*`. |
| TypeScript + ESM | [`typescript-esm`](typescript-esm.md) | Técnica | Convenções de TypeScript strict, ESM e estilo de código. |
| Canais e autenticação | [`canais-e-autenticacao`](canais-e-autenticacao.md) | Técnica | Configurar endpoints HTTP e quem pode acessá-los (OIDC, localDev, placeholder). |
| Subagente de auto-modificação | [`subagente-self-modification`](subagente-self-modification.md) | Técnica | Entender e operar o subagente `self-modification` e sua sandbox. |
| Subagente de dossiê de clientes | [`subagente-client-dossier`](subagente-client-dossier.md) | Técnica | Coletar site/Google Maps/redes e emitir o dossiê estruturado com provenance e assets. |
| Registry e integrações | [`registry-e-integracoes`](registry-e-integracoes.md) | Ferramenta | Buscar, avaliar e instalar integrações do eve (`eve registry` / `eve add`). |
| Deploy na Vercel | [`deploy-vercel`](deploy-vercel.md) | Ferramenta | Linkar e publicar o agente com `eve link` / `eve deploy`. |
| Validação e scripts | [`validacao-e-scripts`](validacao-e-scripts.md) | Ferramenta | Rodar `dev` / `build` / `typecheck` / `eval` e validar mudanças. |
| Conteúdo vs. código | [`conteudo-vs-codigo`](conteudo-vs-codigo.md) | Regra de negócio | Decidir **onde** editar cada tipo de mudança. |
| Convenções do projeto | [`convencoes-do-projeto`](convencoes-do-projeto.md) | Regra de negócio | Aliases de import, helpers `define*` e regras não negociáveis. |

## Agrupamento por categoria

- **Habilidades técnicas** (como escrever e estruturar código): `framework-eve`, `typescript-esm`, `canais-e-autenticacao`, `subagente-self-modification`, `subagente-client-dossier`.
- **Regras de negócio** (decisões e limites do projeto): `conteudo-vs-codigo`, `convencoes-do-projeto`.
- **Ferramentas específicas** (CLI e scripts): `registry-e-integracoes`, `deploy-vercel`, `validacao-e-scripts`.

## Relação com a documentação

As skills são complementares à documentação em [`docs/`](../docs/). A doc explica o **contexto** (o que é, arquitetura, stack); as skills descrevem o **procedimento** (como operar). Em caso de conflito, siga a skill e aponte a divergência.

- Visão geral → [`docs/01-visao-geral.md`](../docs/01-visao-geral.md)
- Stack → [`docs/02-stack.md`](../docs/02-stack.md)
- Estrutura → [`docs/03-estrutura-do-projeto.md`](../docs/03-estrutura-do-projeto.md)
- Arquitetura → [`docs/04-arquitetura.md`](../docs/04-arquitetura.md)
- Guidelines → [`docs/05-guidelines-de-codigo.md`](../docs/05-guidelines-de-codigo.md)
- Padrões → [`docs/06-padroes-e-convencoes.md`](../docs/06-padroes-e-convencoes.md)
