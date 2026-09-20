# 07 — Comandos e scripts

## Scripts npm

Definidos em `package.json`:

| Comando | Script | Descrição |
|---------|--------|-----------|
| `npm run dev` | `eve dev` | Sobe o servidor de desenvolvimento com TUI interativo para conversar com o agente. |
| `npm run build` | `eve build` | Compila o agente. |
| `npm run start` | `eve start` | Inicia o agente em modo produção local. |
| `npm run deploy` | `eve deploy` | Deploya o agente para a Vercel. |
| `npm run eval` | `eve eval` | Executa avaliações (`evals/`). Use `npm run eval client-dossier` para os casos do dossiê. |
| `npm run typecheck` | `tsc` | Roda a checagem de tipos do TypeScript. |

## Comandos úteis da CLI `eve`

Além dos scripts acima, a CLI `eve` oferece comandos usados nos padrões do projeto:

```sh
# Descobrir integrações disponíveis
eve registry search <query> --json
eve registry view <item>

# Instalar uma integração sem prompt interativo
eve add <item> --non-interactive

# Linkar um projeto Vercel
eve link --non-interactive --project <name-or-id> [--team <team-id-or-slug>]

# Deployar para a Vercel
eve deploy --non-interactive --yes [--project <name-or-id>]
```

## Comandos de apoio

```sh
# Listar a documentação local do eve
ls node_modules/eve/docs

# Validar offline o núcleo determinístico do client-dossier (sem rede/modelo)
node scripts/check-dossier-lib.mts
```

## Integrações e credenciais opcionais

| Variável | Para que serve | Efeito quando ausente |
|----------|----------------|-----------------------|
| `GOOGLE_MAPS_API_KEY` | Consultar a ficha do cliente no Google Maps via `google_places` | A tool retorna `ok:false` e o dossiê registra `maps` em `missing[]` com o motivo |
| `DOSSIER_EVAL_WEBSITE`, `DOSSIER_EVAL_WEBSITE_NO_LOGO`, `DOSSIER_EVAL_MAPS`, `DOSSIER_EVAL_INSTAGRAM`, `DOSSIER_EVAL_REDIRECT`, `DOSSIER_EVAL_BROKEN` | Sobrescrever as URLs dos evals de dossiê | Os evals usam as URLs padrão definidas em `evals/client-dossier/sources.ts` |

## Fluxo típico

```sh
# 1. Desenvolver e testar localmente
npm run dev

# 2. Validar tipos antes de concluir
npm run typecheck

# 3. Deployar
npm run deploy
```
