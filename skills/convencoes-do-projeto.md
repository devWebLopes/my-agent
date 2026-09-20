# Skill: Convenções do projeto

> **Categoria:** Regra de negócio
> **Nível:** Essencial
> **Áreas do projeto:** `package.json`, `tsconfig.json`, `agent/`
> **Skills relacionadas:** [TypeScript + ESM](typescript-esm.md), [Operar o framework eve](framework-eve.md)
> **Docs:** [`docs/05-guidelines-de-codigo.md`](../docs/05-guidelines-de-codigo.md), [`docs/06-padroes-e-convencoes.md`](../docs/06-padroes-e-convencoes.md)

## Resumo

Reúne os padrões específicos deste projeto que todo agente deve respeitar ao contribuir: aliases de import, helpers `define*`, organização de pastas e regras de descoberta.

## Aliases de import

Definidos no `package.json`:

| Atalho | Resolve para |
|--------|--------------|
| `#*` | `./agent/*` |
| `#evals/*` | `./evals/*` |

Use `#/...` em vez de caminhos relativos longos.

## Helpers `define*`

O projeto declara componentes via helpers do eve (garantem tipagem/validação):

- `defineAgent` → agente raiz.
- `eveChannel` → canal.
- `defineSelfModificationAgent` / `defineSelfModificationConfig` / `defineSelfModificationSandbox` → subagente.
- `selfModification(config)` → extensão.

## Organização de pastas

- Capacidades novas (tools, connections, channels, skills, subagents, schedules) sob `agent/`, nas subpastas correspondentes.
- Um subagente segue: `agent.ts`, `config.ts`, `sandbox.ts` e `extensions/` (quando aplicável).

## Regras de descoberta (importante!)

- Não faça **descoberta excessiva**: não varra `node_modules` recursivamente, não enumere toda a árvore de docs e não leia scaffold irrelevante quando o caminho direto é conhecido.
- Links de package-manager podem esconder arquivos de ferramentas de glob recursivas, mesmo que leituras diretas funcionem.

## Procedimento

1. Confira se a mudança respeita as convenções listadas.
2. Use os aliases de import e os helpers `define*` corretos.
3. Mantenha a estrutura de pastas existente.
4. Siga o checklist de contribuição em `docs/10-contribuicao.md`.

## Armadilhas

- Não reinvente helpers — use os `define*` do eve.
- Não crie caminhos relativos profundos (`../../`) quando existe alias `#`.
- Não explore `node_modules`/`docs` além do necessário.

## Referências

- [`docs/05-guidelines-de-codigo.md`](../docs/05-guidelines-de-codigo.md)
- [`docs/06-padroes-e-convencoes.md`](../docs/06-padroes-e-convencoes.md)
- [`docs/10-contribuicao.md`](../docs/10-contribuicao.md)
