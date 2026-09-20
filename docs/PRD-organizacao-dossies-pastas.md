# PRD — Organização e Estrutura de Pastas para Dossiês de Consulta

> **Status:** Proposto / Em Especificação  
> **Tipo de artefato:** Documento de Requisitos de Produto (PRD)  
> **Proprietário:** Workspace `sitemaker` / Subagente `client-dossier`  
> **Consumidores:** Agente raiz, Subagente `client-dossier`, downstream site-builder e desenvolvedor  
> **Framework:** [eve](https://eve.dev)  

---

## 1. Contexto e Problema

Atualmente, o subagente `client-dossier` realiza a extração, consolidação de dados e download de assets de clientes a partir de múltiplas fontes públicas (sites, CNPJ, Google Places, redes sociais). No entanto, o armazenamento dos artefatos gerados apresenta as seguintes limitações estruturais:

1. **Dispersão de Arquivos:** Os assets são salvos em um diretório global `/workspace/assets/<kind>/`, enquanto os arquivos de dossiê ficam sob `dossiers/<id>/` ou em arquivos avulsos na raiz (`dossie.md`, `dossier.json`).
2. **Falta de Identificação Clara por Consulta/Entidade:** Quando múltiplas pesquisas são executadas ou o mesmo cliente é consultado em momentos diferentes, não há uma separação clara entre as execuções, dificultando a rastreabilidade e a inspeção manual no projeto.
3. **Ausência de Isolamento por Pesquisa:** Os assets e dados intermediários (raw fragments) de uma consulta podem se misturar com os de outras consultas, prejudicando o consumo downstream por agentes construtores de sites.

### O Problema a Resolver
Necessidade de uma **estrutura padronizada de diretórios no projeto**, onde **cada pesquisa/consulta possua sua própria pasta isolada e autocontida**, identificada de forma legível e sem ambiguidades pelo **nome da entidade/termo pesquisado**, guardando todos os artefatos daquela execução (dados consolidados, relatórios em Markdown, dados brutos e imagens).

---

## 2. Objetivos e Não-Objetivos

### Objetivos
1. **Pasta por Entidade Pesquisada:** Criar diretórios raiz de entidade baseados no nome legível normalizado (slug sanitizado, ex: `clinica-odontologica-sorriso`, `padaria-sao-jose`).
2. **Subpasta por Consulta/Execução:** Cada execução de pesquisa gera uma pasta isolada (identificada por timestamp/run-id), preservando o histórico completo de consultas.
3. **Autocontenção:** Todo o conteúdo da consulta (dossiê JSON, relatório Markdown, manifesto de consulta, fragmentos brutos e imagens baixadas) deve residir dentro da pasta da consulta correspondente.
4. **Ponteiro `latest`:** Manter um atalho/ponteiro para a consulta mais recente da entidade, facilitando a consulta imediata pelo agente de criação de sites.
5. **Índice Global de Consultas:** Gerar e manter um índice/catálogo centralizado (`dossiers/catalog.json` ou `dossiers/README.md`) para descoberta rápida de todos os dossiês disponíveis no projeto.
6. **Portabilidade e Compatibilidade Multiplataforma:** Garantir nomes de pastas e arquivos válidos em Windows, macOS e Linux (sem caracteres proibidos como `:`, `?`, `*`, `|`, `<`, `>`).

### Não-Objetivos
- **Não** gerencia banco de dados SQL/NoSQL externo (o armazenamento é puramente no filesystem do workspace).
- **Não** altera o conteúdo semântico do `dossierSchema` existente (apenas os caminhos físicos e a organização em disco).
- **Não** implementa interface gráfica de gerenciamento de arquivos (opera via filesystem/CLI/Eve Sandbox).

---

## 3. Arquitetura de Diretórios Proposta

A estrutura dentro do projeto seguirá a hierarquia:

```text
my-agent/
├── dossiers/                                  # Diretório raiz de todos os dossiês
│   ├── catalog.json                          # Catálogo indexado de todas as consultas
│   ├── README.md                             # Guia legível com listagem de clientes/consultas
│   │
│   └── <slug-da-entidade-pesquisada>/        # Pasta identificadora do que foi pesquisado
│       ├── latest -> runs/2026-09-18_03-30-00 # Link/atalho ou cópia da consulta mais recente
│       └── runs/                             # Histórico de consultas para esta entidade
│           │
│           ├── 2026-09-18_01-15-00_a1b2c3/   # Consulta #1 (Timestamp + Hash)
│           │   ├── manifest.json             # Metadados da consulta (query, fontes, status)
│           │   ├── dossier.json              # Dossiê estruturado consolidado
│           │   ├── dossie.md                 # Relatório legível em Markdown
│           │   ├── raw/                      # Dados brutos coletados por fonte
│           │   │   ├── cnpj.json
│           │   │   ├── google-places.json
│           │   │   ├── website-scrape.json
│           │   │   └── social.json
│           │   └── assets/                   # Assets baixados exclusivamente para esta consulta
│           │       ├── logo/
│           │       │   └── logo-principal.svg
│           │       ├── favicon/
│           │       │   └── favicon.png
│           │       ├── photos/
│           │       │   ├── fachada-01.jpg
│           │       │   └── equipe.jpg
│           │       └── covers/
│           │           └── banner-hero.jpg
│           │
│           └── 2026-09-18_03-30-00_d4e5f6/   # Consulta #2 (Re-pesquisa / Atualização)
│               ├── manifest.json
│               ├── dossier.json
│               ├── dossie.md
│               ├── raw/ ...
│               └── assets/ ...
```

---

## 4. Regras de Nomenclatura e Sanitização

### 4.1. Nome da Pasta da Entidade (`<slug-da-entidade-pesquisada>`)
A pasta principal da entidade é determinada com base na seguinte prioridade:
1. `request.name` (se fornecido pelo usuário/prompt, ex: `"Padaria Estrela do Brás"`).
2. `business.name.value` (nome comercial extraído das fontes consolidadas).
3. `request.clientId` (se fornecido).
4. Domínio do website consultado (ex: `clinicasorriso.com.br` → `clinicasorriso-com-br`).
5. Termo genérico de fallback: `consulta-<hash>`.

**Regras de Sanitização de Slug:**
- Todas as letras convertidas para minúsculas (`toLowerCase()`).
- Remoção de acentuação gráfica (`NFD` normalization).
- Substituição de espaços, underscores e caracteres especiais por hífens (`-`).
- Remoção de caracteres proibidos em sistemas de arquivos (`\ / : * ? " < > | .`).
- Compactação de múltiplos hífens consecutivos em um único hífen (`--` → `-`).
- Limite máximo de 64 caracteres para o slug base.

*Exemplo:*  
Entrada: `"Clínica Médica & Diagnóstico Dr. João da Silva (SP)!"`  
Slug gerado: `clinica-medica-e-diagnostico-dr-joao-da-silva-sp`

### 4.2. Nome da Subpasta da Consulta (`<timestamp>_<hash>`)
Para garantir ordenação cronológica natural pelo sistema operacional e evitar conflitos de concorrência:
- **Formato:** `YYYY-MM-DD_HH-mm-ss_<shortHash>`
- Exemplo: `2026-09-18_03-30-00_f82a1c`
- O `shortHash` (6 caracteres FNV-1a ou MD5) deriva das URLs das fontes consultadas, identificando univocamente o conjunto de entradas.

---

## 5. Requisitos Funcionais (RF)

| ID | Nome | Descrição |
|---|---|---|
| **RF-01** | **Resolução Automática do Nome da Pasta** | O sistema deve calcular deterministicamente o slug da entidade pesquisada a partir do nome informado ou dos dados extraídos. |
| **RF-02** | **Criação de Subpasta Exclusiva por Consulta** | Toda nova execução de pesquisa deve criar uma subpasta dedicada com timestamp e identificador único dentro da pasta da entidade. |
| **RF-03** | **Persistência do Manifesto de Consulta (`manifest.json`)** | Cada pasta de consulta deve conter um arquivo `manifest.json` com metadados da execução: termo pesquisado, fontes solicitadas, status das fontes, tempo de execução, versão do agente e contagem de assets. |
| **RF-04** | **Download de Assets no Escopo da Consulta** | O tool `download_asset` deve salvar imagens diretamente na subpasta `assets/<kind>/` da consulta ativa, evitando diretórios globais compartilhados. |
| **RF-05** | **Isolamento de Dados Brutos (`raw/`)** | O subagente deve salvar os retornos intermediários das ferramentas (`cnpj_lookup`, `google_places`, `scrape_page`, `social_profile`) na subpasta `raw/` para auditoria e debug. |
| **RF-06** | **Geração de Arquivos Consolidados** | Salvar `dossier.json` e `dossie.md` com caminhos relativos aos assets da própria pasta da consulta. |
| **RF-07** | **Atualização do Ponteiro `latest`** | Ao finalizar uma consulta com sucesso, o sistema deve atualizar o atalho/arquivo `latest` na raiz da entidade apontando para a consulta recém-gerada. |
| **RF-08** | **Manutenção do Catálogo Global (`catalog.json`)** | Ao término de cada dossiê, atualizar `dossiers/catalog.json` registrando a entidade, último status, data da última consulta e caminho relativo da pasta. |

---

## 6. Estrutura dos Arquivos de Cada Consulta

### 6.1. `manifest.json` (Metadados da Execução)
```json
{
  "query": "Restaurante Sabor da Terra",
  "entitySlug": "restaurante-sabor-da-terra",
  "runId": "2026-09-18_03-30-00_f82a1c",
  "executedAt": "2026-09-18T03:30:00.000Z",
  "durationMs": 4320,
  "status": "complete",
  "version": 1,
  "sources": [
    { "type": "website", "url": "https://sabordaterra.com.br", "status": "ok" },
    { "type": "cnpj", "url": "12.345.678/0001-90", "status": "ok" },
    { "type": "google_maps", "url": "https://maps.google.com/?cid=123", "status": "ok" }
  ],
  "stats": {
    "assetsDownloaded": 6,
    "confidenceHighCount": 18,
    "missingFieldsCount": 2
  },
  "paths": {
    "dossierJson": "dossiers/restaurante-sabor-da-terra/runs/2026-09-18_03-30-00_f82a1c/dossier.json",
    "dossierMarkdown": "dossiers/restaurante-sabor-da-terra/runs/2026-09-18_03-30-00_f82a1c/dossie.md",
    "assetsDir": "dossiers/restaurante-sabor-da-terra/runs/2026-09-18_03-30-00_f82a1c/assets"
  }
}
```

### 6.2. `dossier.json`
Contém o objeto `Dossier` validado por `dossierSchema`, com `meta.dossierPath` e `meta.markdownPath` e os caminhos locais dos `assets[].localPath` apontando para a estrutura interna da consulta.

### 6.3. `dossie.md`
Relatório executivo em Markdown com links e referências visuais aos assets locais (`./assets/logo/logo.png`, `./assets/photos/...`).

---

## 7. Requisitos Não-Funcionais (RNF)

| ID | Nome | Critério de Aceite |
|---|---|---|
| **RNF-01** | **Compatibilidade Multiplataforma** | Nomes de arquivos e pastas sanitizados sem `:` ou caracteres inválidos no Windows NTFS e Linux ext4. |
| **RNF-02** | **Idempotência e Não-Sobrescrita** | Execuções subsequentes com pequenas variações geram novos timestamps em `runs/`, preservando auditoria anterior a menos que explicitamente solicitado expurgo. |
| **RNF-03** | **Caminhos Relativos Portáveis** | Todas as referências de arquivos dentro do `dossier.json` e `dossie.md` devem suportar caminhos relativos ao diretório da consulta, permitindo zipar ou mover a pasta da entidade sem quebrar links. |
| **RNF-04** | **Desempenho de Escrita** | Operações de gravação no sandbox devem ser executadas em lote ou assincronamente ao término da consolidação, sem impactar o tempo de resposta da LLM. |

---

## 8. Impacto nos Componentes Existentes

1. **`agent/subagents/client-dossier/lib/url.ts`**:
   - Adicionar helper `slugifyEntityName(name: string): string` e `resolveRunDirectory(slug: string, timestamp?: Date): string`.
2. **`agent/subagents/client-dossier/tools/download_asset.ts`**:
   - Receber opcionalmente `destinationDir` ou `runContext` para direcionar a gravação dos assets para `dossiers/<slug>/runs/<runId>/assets/<kind>/`.
3. **`agent/subagents/client-dossier/tools/build_dossier.ts`**:
   - Atualizar a escrita de arquivos para a nova estrutura hierárquica.
   - Gerar `manifest.json` e atualizar `dossiers/catalog.json`.
4. **`agent/instructions.md`**:
   - Atualizar a instrução do agente raiz para referenciar os novos caminhos informados no retorno do subagente (`dossiers/<entidade>/latest/dossie.md`).

---

## 9. Plano de Implementação (Milestones)

- **M1 — Especificação e Tipagem (Schema & Helpers):** Criação das funções de geração de caminhos, sanitização de nomes de pesquisa e schema do `manifest.json`.
- **M2 — Adaptação do `download_asset`:** Ajuste no salvamento de imagens para respeitar o escopo da consulta ativa.
- **M3 — Adaptação do `build_dossier` & Catalogações:** Implementação da escrita em `dossiers/<slug>/runs/<runId>/`, geração do `manifest.json` e atualização do `catalog.json`.
- **M4 — Testes, Evals e Validação:** Execução dos scripts de verificação (`scripts/check-dossier-lib.mts`) e teste ponta a ponta com casos reais.
