# 09 — Instalação e Deploy em Produção (Vercel)

Este guia detalha o **passo a passo completo** para a instalação, configuração de chaves/segredos e deploy do projeto `my-agent` em ambiente de produção na **Vercel**.

---

## 1. Pré-requisitos

Antes de iniciar a instalação em produção, certifique-se de possuir:

1. **Ambiente local instalado**:
   - Node.js v24+ e npm v10+.
   - CLI do `eve` disponível (`npx eve` ou via dependências do projeto).
2. **Conta na Vercel**: Conta com permissão para vincular e publicar projetos.
3. **Chaves de API dos Provedores**:
   - **Google AI Studio API Key** (Provider nativo `@ai-sdk/google` — caminho ativo).
   - *(Opcional)* **Google Maps API Key** (Places API) para o subagente `client-dossier`.
   - *(Opcional)* **Telegram Bot Token** (obtido via `@BotFather`) caso o canal Telegram esteja ativo.

---

## 2. Mapeamento de Todas as Chaves e Variáveis de Ambiente

As variáveis de ambiente **nunca** devem ser versionadas em repositório (o arquivo `.gitignore` já cobre `.env*`). Em produção, todas as chaves devem ser cadastradas nas **Settings → Environment Variables** do seu projeto na Vercel.

### 🔑 Tabela Completa de Variáveis de Ambiente

| Variável | Categoria / Finalidade | Status em Produção | Onde Obter / Descrição |
|----------|------------------------|--------------------|------------------------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | **LLM Provider (Gemini)** | **Obrigatória** *(caminho ativo)* | Chave do Google AI Studio ([Google AI Studio](https://aistudio.google.com/)). Necessária para execução do agente raiz e subagentes. |
| `AI_GATEWAY_API_KEY` | **LLM Provider (AI Gateway)** | *Alternativa* *(inativa)* | Chave do Vercel AI Gateway (formato `vck_...`). Necessária somente se os modelos em `agent.ts` usarem o formato `google/gemini-3.8-flash`. |
| `VERCEL_OIDC_TOKEN` | **Autenticação Vercel / Eve** | *Automática* | Token de infraestrutura gerado automaticamente durante o comando `eve link`. |
| `GOOGLE_MAPS_API_KEY` | **Integração Google Maps** | **Recomendada** *(opcional)* | Chave de API da **Places API (New)** do Google Cloud. Utilizada pelo subagente `client-dossier` para buscar endereço, fotos e reputação no Google Places. |
| `TELEGRAM_BOT_TOKEN` | **Canal Telegram** | **Obrigatória** *(se usar Telegram)* | Token de acesso do Bot do Telegram fornecido pelo `@BotFather`. Exemplo: `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`. |
| `TELEGRAM_WEBHOOK_SECRET_TOKEN` | **Segurança Telegram** | **Obrigatória** *(se usar Telegram)* | String aleatória (token secreto) definida por você para autenticar chamadas de Webhook enviadas pelo Telegram. |
| `TELEGRAM_BOT_USERNAME` | **Canal Telegram** | *Opcional* | Nome de usuário do bot no Telegram (ex.: `meu_dossie_bot`). |
| `TELEGRAM_ALLOWED_USER_IDS` | **Gatekeeper Telegram** | **Recomendada** | Lista de IDs numéricos do Telegram autorizados a usar o agente, separados por vírgula (ex.: `123456789,987654321`). |
| `TELEGRAM_ALLOWED_PHONES` | **Gatekeeper Telegram** | *Opcional* | Lista de números de telefone em formato internacional autorizados (ex.: `+5511999999999,+5511988888888`). |

---

## 3. Passo a Passo de Instalação e Deploy em Produção

### Passo 1: Validação do Código e Testes Locais
Antes de qualquer deploy, execute as validações de tipo e compilação:

```sh
npm run typecheck
npm run build
```

### Passo 2: Autenticação e Associação do Projeto na Vercel (`eve link`)
Execute o comando de vinculação com o projeto Vercel:

```sh
# Modo interativo:
eve link

# Ou modo não-interativo (para CI/CD ou automação):
eve link --non-interactive --project <nome-ou-id-do-projeto> [--team <team-id-ou-slug>]
```
*O `eve link` cria/associa o projeto na Vercel e grava as credenciais OIDC necessárias.*

### Passo 3: Cadastrar as Variáveis de Ambiente na Vercel
Acesse o painel da Vercel em **Project Settings → Environment Variables** (ou utilize o Vercel CLI / `eve env`) e insira todas as chaves mapeadas na Seção 2:

- **Produção (Production)**: Adicione:
  - `GOOGLE_GENERATIVE_AI_API_KEY`
  - `GOOGLE_MAPS_API_KEY` (opcional)
  - `TELEGRAM_BOT_TOKEN` (se usar Telegram)
  - `TELEGRAM_WEBHOOK_SECRET_TOKEN` (se usar Telegram)
  - `TELEGRAM_ALLOWED_USER_IDS` (se usar Telegram)

Para desenvolvimento local, grave essas mesmas chaves no arquivo `.env.local` na raiz da aplicação.

> ⚠️ **Importante**: O arquivo local **deve** ter o ponto no início (`.env.local`). Um arquivo `env.local` sem o ponto **não será lido** pelo runtime do `eve`.

### Passo 4: Revisar a Autenticação dos Canais em Produção

1. **Canal Web / Eve (`agent/channels/eve.ts`)**:
   Por padrão, o arquivo possui o guard `placeholderAuth()`:
   ```ts
   // agent/channels/eve.ts
   export default eveChannel({
     auth: [
       vercelOidc(),
       localDev(),
       placeholderAuth(), // Bloqueia navegadores em produção!
     ],
   });
   ```
   *Antes de liberar para usuários reais via web, substitua `placeholderAuth()` pelo seu provedor de autenticação (ex.: Auth.js, Clerk) ou por `none()` para uma demonstração pública.*

2. **Canal Telegram (`agent/channels/telegram.ts`)**:
   O canal usa o Gatekeeper com a allowlist em `TELEGRAM_ALLOWED_USER_IDS` / `TELEGRAM_ALLOWED_PHONES`. Garanta que seu ID de usuário do Telegram está cadastrado.

### Passo 5: Executar o Deploy para Produção (`eve deploy`)

No diretório raiz do projeto, execute:

```sh
# Deploy interativo:
eve deploy

# Deploy não-interativo (para CI/CD / Scripts):
eve deploy --non-interactive --yes [--project <nome-ou-id-do-projeto>]
```

Após a conclusão, a CLI informará a URL pública de produção da Vercel (ex.: `https://my-agent.vercel.app`).

### Passo 6: Registrar o Webhook do Telegram (Se aplicável)

Caso esteja utilizando o canal do Telegram, configure o Webhook para apontar para a URL do seu deploy na Vercel:

```sh
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<seu-dominio-vercel>.vercel.app/api/channels/telegram",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET_TOKEN>"
  }'
```

---

## 4. Arquivos Ignorados no Deploy

O arquivo `.vercelignore` impede o envio de dados sensíveis e arquivos de desenvolvimento para os servidores da Vercel:
- `node_modules`
- `.env*`
- `.eve`
- `.next` / `.output` / `.nitro` / `dist`

---

## 5. Resolução de Problemas (Troubleshooting)

- **`MODEL_CALL_FAILED: AI Gateway received no credentials`**:
  O modelo em `agent/agent.ts` ou subagente está configurado para o AI Gateway sem a chave. Verifique se o projeto está usando o provider direto `@ai-sdk/google` (`model: google("gemini-3.8-flash")`) e se `GOOGLE_GENERATIVE_AI_API_KEY` está configurada na Vercel.
- **Dossiê sem dados do Google Maps (`missing: ["maps"]`)**:
  A variável `GOOGLE_MAPS_API_KEY` não foi configurada ou a API Places (New) não está ativada no console do Google Cloud.
- **Telegram não responde ou retorna HTTP 403 / 401**:
  - Verifique se `TELEGRAM_BOT_TOKEN` e `TELEGRAM_WEBHOOK_SECRET_TOKEN` foram inseridos corretamente nas variáveis da Vercel.
  - Verifique se o seu ID de usuário do Telegram está presente em `TELEGRAM_ALLOWED_USER_IDS`.
- **Requisições Web bloqueadas em produção**:
  Remova `placeholderAuth()` de `agent/channels/eve.ts` e configure o provedor de auth definitivo.

---

## 6. Referências

- **Visão Geral e Arquitetura**: [`docs/01-visao-geral.md`](01-visao-geral.md) e [`docs/04-arquitetura.md`](04-arquitetura.md)
- **Canais e Autenticação**: [`skills/canais-e-autenticacao.md`](../skills/canais-e-autenticacao.md)
- **Documentação Oficial do Eve**: <https://eve.dev/docs/guides/deployment/vercel>

