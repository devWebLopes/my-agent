# 06 — Padrões e convenções

Padrões específicos deste projeto (e do framework eve) que devem ser seguidos.

## 1. Conteúdo vs. código

| Tipo de mudança | Onde editar |
|-----------------|-------------|
| Identidade, propósito, tom, diretrizes de resposta | `agent/instructions.md` |
| Modelo e runtime | `agent/agent.ts` (só com solicitação) |
| Canais de comunicação | `agent/channels/` |
| Subagentes | `agent/subagents/` |
| Tools, skills, schedules, connections | sob `agent/` nas pastas correspondentes |

## 2. Definições usam helpers `define*`

O projeto usa os helpers do eve para declarar componentes, garantindo tipagem e validação:

- `defineAgent` → agente raiz.
- `eveChannel` → canal de comunicação.
- `defineSelfModificationAgent` / `defineSelfModificationConfig` / `defineSelfModificationSandbox` → subagente de auto-modificação.
- `selfModification(config)` → extensão.

## 3. Autenticação de canais

O canal `eve` declara explicitamente a lista de métodos de auth:

```ts
auth: [
  vercelOidc(),     // acesso via TUI e deploys Vercel
  localDev(),       // acesso em localhost no dev
  placeholderAuth(),// placeholder — substituir em produção
],
```

Convenção: **substitua `placeholderAuth()`** por um provedor real (Auth.js, Clerk, etc.) ou por `none()` para uma demo pública, antes de liberar o agente para o público.

## 4. Leia a documentação antes de codar

Antes de criar tools, connections, channels, skills, subagents, schedules ou deploy:

```sh
ls node_modules/eve/docs
```

Comece por `docs/README.md` (mapeia cada tarefa para a página que a cobre). Leia a página relevante antes de escrever. Se os docs do pacote não existirem, use <https://eve.dev/docs>.

> Use um **loop de autoria limitado**: (1) leia a página relevante e inspecione só os arquivos que vai modificar/imitar; (2) implemente o menor comportamento completo pedido; (3) rode **uma** verificação estreita, expandindo só se falhar.

## 5. Prefira uma integração existente

Quando a tarefa envolver um produto/serviço externo, pesquise o registry antes de implementar:

```sh
eve registry search <query> --json
eve registry view <item>
```

- Prefira itens com `implementation: "native"`.
- Use adaptadores Chat SDK quando não houver canal nativo adequado.
- Instale sem prompts interativos: `eve add <item> --non-interactive`.

## 6. Use o `eve` para operações Vercel

Para linkar e deployar na Vercel:

```sh
eve link --non-interactive --project <name-or-id> [--team <team-id-or-slug>]
eve deploy --non-interactive --yes [--project <name-or-id>]
```

## 7. Não faça descoberta excessiva

Não varra `node_modules` recursivamente, não enumere toda a árvore de docs e não leia arquivos de scaffold irrelevantes quando o caminho direto já é conhecido. Links de package-manager podem esconder arquivos de ferramentas de glob recursivas mesmo que leituras diretas funcionem.

## 8. Valide a mudança

Rode a validação que a tarefa pedir. Quando a validação não cobrir o comportamento alterado, rode a verificação mais estreita relevante (ex.: `npm run typecheck`).
