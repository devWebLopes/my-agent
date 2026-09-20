# Skill: Operar o framework eve

> **Categoria:** Habilidade técnica
> **Nível:** Essencial
> **Áreas do projeto:** `agent/`, `agent/agent.ts`, `agent/channels/`, `agent/subagents/`
> **Skills relacionadas:** [TypeScript + ESM](typescript-esm.md), [Canais e autenticação](canais-e-autenticacao.md), [Convenções do projeto](convencoes-do-projeto.md)
> **Docs:** [`docs/04-arquitetura.md`](../docs/04-arquitetura.md)

## Resumo

O `my-agent` é um agente construído com o framework **eve**. Todo o comportamento do agente vive dentro do diretório `agent/`, e a CLI `eve` compila e executa essa definição.

## Quando usar

- Criar ou alterar **tools**, **connections**, **channels**, **skills**, **subagents** ou **schedules**.
- Adicionar qualquer capacidade de código ao agente.
- Navegar pelos componentes existentes (agente raiz, canais, subagentes, extensões).

## O que você precisa saber

1. **Um agente é um diretório de arquivos** sob `agent/`, não um único arquivo monolítico.
2. **Agente raiz** → `agent/agent.ts`, via `defineAgent({ model: "..." })`. Preserve o modelo salvo pedido explícito.
3. **Instruções** → `agent/instructions.md` (identidade, propósito, tom). É conteúdo, não código.
4. **Canais** → `agent/channels/` (como o agente é acessado + auth).
5. **Subagentes** → `agent/subagents/` (agentes especializados; ex.: `self-modification`).
6. **Extensões** → dentro de um subagente, expõem recursos específicos.

## Regra de ouro

> **Leia a documentação do eve antes de escrever código** que envolva tools, connections, channels, skills, subagents, schedules ou deploy:
>
> ```sh
> ls node_modules/eve/docs
> ```
>
> Comece por `docs/README.md` (mapeia cada tarefa à página que a cobre). Leia a página relevante antes de autora. Se os docs locais não existirem, use <https://eve.dev/docs>.

## Procedimento (loop de autoria limitado)

1. Leia a página relevante do eve.
2. Inspecione **apenas** os arquivos que vai modificar ou imitar.
3. Pare a descoberta assim que localização, imports e formato da definição estiverem claros.
4. Implemente o **menor comportamento completo** solicitado.
5. Rode **uma** verificação estreita (ex.: `npm run typecheck`); expanda só se falhar.

## Exemplos de definições

```ts
// agente raiz
import { defineAgent } from "eve";
export default defineAgent({ model: "google/gemini-3.8-flash" });

// canal
import { eveChannel } from "eve/channels/eve";
export default eveChannel({ auth: [ /* ... */ ] });

// subagente de auto-modificação
import { defineSelfModificationAgent } from "eve/self-modification/agent";
export default defineSelfModificationAgent({ config });
```

## Armadilhas

- Não varra `node_modules` recursivamente nem enumere toda a árvore de docs.
- Não crie capacidade do zero se existir uma integração no registry (ver [Registry e integrações](registry-e-integracoes.md)).
- Definições usam `export default defineX({ ... })`; não exporte objetos soltos.

## Referências

- eve docs: <https://eve.dev/docs>
- eve GitHub: <https://github.com/vercel/eve>
- [`docs/04-arquitetura.md`](../docs/04-arquitetura.md)
