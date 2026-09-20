# Skill: Conteúdo vs. código

> **Categoria:** Regra de negócio
> **Nível:** Essencial
> **Áreas do projeto:** `agent/instructions.md`, `agent/**/*.ts`
> **Skills relacionadas:** [Operar o framework eve](framework-eve.md), [Convenções do projeto](convencoes-do-projeto.md)
> **Docs:** [`docs/01-visao-geral.md`](../docs/01-visao-geral.md), [`docs/04-arquitetura.md`](../docs/04-arquitetura.md), [`docs/06-padroes-e-convencoes.md`](../docs/06-padroes-e-convencoes.md)

## Resumo

O projeto separa de forma rígida **conteúdo** (o que o agente *diz* e como se comporta na conversa) de **código** (o que o agente *pode fazer*). Saber onde editar cada mudança evita regressões e mantém o repositório previsível.

## Tabela de decisão

| Tipo de mudança | Onde editar |
|-----------------|-------------|
| Identidade, propósito, tom, diretrizes de resposta | `agent/instructions.md` |
| Modelo e runtime | `agent/agent.ts` (só com solicitação explícita) |
| Canais de comunicação | `agent/channels/` |
| Subagentes | `agent/subagents/` |
| Tools, skills, schedules, connections | sob `agent/` nas pastas correspondentes |

## Regras não negociáveis

1. **Não edite `agent/agent.ts`** para trocar o modelo sem solicitação explícita.
2. **Não edite arquivos gerados** (`.eve/`, `node_modules/`).
3. **Não versione segredos** (`env.local` e `.env*` já são ignorados).
4. Mudanças **somente de conteúdo** não exigem ler os docs do framework — edite `agent/instructions.md` diretamente.

## Procedimento

1. Classifique a mudança como **conteúdo** ou **código**.
2. Se conteúdo → edite `agent/instructions.md`.
3. Se código → edite o arquivo correto sob `agent/` e leia a doc relevante do eve antes.
4. Valide conforme a skill [Validação e scripts](validacao-e-scripts.md).

## Armadilhas

- Não coloque instruções de tom/identidade dentro de arquivos `.ts`.
- Não toque em `agent/agent.ts` "só para ajustar" — o modelo é fixo salvo pedido.
- Arquivos gerados (`.eve/`, `node_modules/`) são regenerados; edições ali são perdidas.

## Referências

- [`docs/01-visao-geral.md`](../docs/01-visao-geral.md)
- [`docs/04-arquitetura.md`](../docs/04-arquitetura.md)
- [`docs/06-padroes-e-convencoes.md`](../docs/06-padroes-e-convencoes.md)
