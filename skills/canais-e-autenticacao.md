# Skill: Canais e autenticação

> **Categoria:** Habilidade técnica
> **Nível:** Essencial
> **Áreas do projeto:** `agent/channels/`
> **Skills relacionadas:** [Operar o framework eve](framework-eve.md), [Deploy na Vercel](deploy-vercel.md)
> **Docs:** [`docs/03-estrutura-do-projeto.md`](../docs/03-estrutura-do-projeto.md), [`docs/09-deploy.md`](../docs/09-deploy.md)

## Resumo

Os **canais** definem *como* o agente é acessado (endpoints HTTP) e *quem* pode acessá-lo (autenticação). O projeto usa um único canal `eve` em `agent/channels/eve.ts`.

## Quando usar

- Adicionar ou ajustar endpoints do agente.
- Alterar a política de autenticação (ex.: liberar para o público, adicionar Auth.js/Clerk).

## Estrutura atual

```ts
import { eveChannel } from "eve/channels/eve";
import { localDev, placeholderAuth, vercelOidc } from "eve/channels/auth";

export default eveChannel({
  auth: [
    vercelOidc(),      // TUI do eve + deploys Vercel
    localDev(),        // localhost no `eve dev`/REPL (ignorado em produção)
    placeholderAuth(), // placeholder — substituir em produção
  ],
});
```

## Métodos de auth

| Método | Finalidade |
|--------|------------|
| `vercelOidc()` | Libera o TUI do eve e os próprios deploys Vercel. |
| `localDev()` | Acesso em `localhost` durante dev/REPL; ignorado em produção. |
| `placeholderAuth()` | **Bloqueia** requisições de navegador em produção. |
| `none()` | Demo pública (sem auth). Usar com consciência. |

## Regra de negócio

> **Substitua `placeholderAuth()`** pelo provedor de auth real da aplicação (ex.: Auth.js, Clerk) **ou** por `none()` para uma demo pública **antes** de liberar o agente para usuários reais.

## Procedimento

1. Identifique quem deve acessar o agente em produção.
2. Escolha o provedor (Auth.js/Clerk/none) ou mantenha os métodos atuais.
3. Edite `agent/channels/eve.ts`.
4. Valide com `npm run typecheck`.

## Armadilhas

- Não deixe `placeholderAuth()` em produção se o agente for público.
- `localDev()` é ignorado em produção — não conte com ele para acesso remoto.
- Segredos de auth ficam em `env.local` (`.env*` é ignorado pelo git).

## Referências

- [`docs/03-estrutura-do-projeto.md`](../docs/03-estrutura-do-projeto.md)
- [`docs/09-deploy.md`](../docs/09-deploy.md)
