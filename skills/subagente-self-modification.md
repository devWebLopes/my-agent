# Skill: Subagente de auto-modificação

> **Categoria:** Habilidade técnica
> **Nível:** Avançado
> **Áreas do projeto:** `agent/subagents/self-modification/`
> **Skills relacionadas:** [Operar o framework eve](framework-eve.md), [Convenções do projeto](convencoes-do-projeto.md)
> **Docs:** [`docs/03-estrutura-do-projeto.md`](../docs/03-estrutura-do-projeto.md), [`docs/04-arquitetura.md`](../docs/04-arquitetura.md)

## Resumo

O subagente **self-modification** dá ao agente a capacidade de modificar a si mesmo de forma **controlada**, com configuração e sandbox próprias.

## Estrutura

| Arquivo | Papel |
|---------|-------|
| `agent.ts` | `defineSelfModificationAgent` (definição do subagente). |
| `config.ts` | `defineSelfModificationConfig` (habilita `local`). |
| `sandbox.ts` | `defineSelfModificationSandbox`. |
| `extensions/selfmod.ts` | Expõe o recurso via `selfModification(config)`. |

## Quando usar

- Habilitar/desabilitar a auto-modificação.
- Ajustar o modelo ou o comportamento do subagente.
- Adicionar/estender recursos expostos pela extensão.

## Procedimento

1. Leia os 4 arquivos do subagente para imitar o padrão.
2. Alterações de configuração → `config.ts` (ex.: `local: { enabled: true }`).
3. Alterações de comportamento → `agent.ts`.
4. Extensões de recurso → `extensions/selfmod.ts`.
5. Valide com `npm run typecheck`.

## Exemplo (config)

```ts
import { defineSelfModificationConfig } from "eve/self-modification/config";

export default defineSelfModificationConfig({
  local: { enabled: true },
});
```

## Armadilhas

- A estrutura de um subagente segue o padrão `agent.ts` + `config.ts` + `sandbox.ts` + `extensions/`; mantenha-a.
- Não remova a sandbox sem entender o risco de segurança (modificações fora de controle).
- Preserve o modelo do subagente a menos que seja solicitado.

## Referências

- [`docs/04-arquitetura.md`](../docs/04-arquitetura.md)
- eve docs (subagents): <https://eve.dev/docs>
