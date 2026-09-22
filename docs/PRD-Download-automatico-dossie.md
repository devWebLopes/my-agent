# PRD — Download automático do dossiê

**Data:** 22 de setembro de 2026  
**Status:** Implementado (backend — Telegram e web/eve)  
**Produto:** my-agent (agente eve; dossiê em Markdown `.md`)  
**Responsável:** [Nome do responsável]  

## 1. Resumo

Implementar o download automático do dossiê assim que o documento estiver concluído e disponível para o usuário.

Atualmente, o usuário precisa localizar o dossiê gerado e iniciar manualmente o download. A proposta é iniciar automaticamente o download do arquivo após a geração bem-sucedida, mantendo também uma opção manual para baixar novamente o documento.

---

## 2. Contexto e problema

O dossiê é gerado pelo sistema após o preenchimento ou processamento das informações necessárias. Depois da geração, o usuário precisa realizar uma ação adicional para acessar o arquivo.

Esse comportamento pode causar:

- Perda de tempo;
- Dúvidas sobre onde encontrar o dossiê;
- Abandono após a conclusão da geração;
- Downloads duplicados por falta de feedback;
- Necessidade de navegar novamente até a página do documento.

### Problema principal

> O usuário não recebe o dossiê automaticamente quando ele fica pronto, mesmo quando o arquivo já está disponível para download.

---

## 3. Objetivo

Permitir que o dossiê seja baixado automaticamente assim que sua geração for concluída com sucesso.

### Objetivos específicos

- Iniciar o download sem exigir uma ação adicional do usuário;
- Exibir feedback visual sobre o status da geração e do download;
- Disponibilizar uma opção manual para baixar o arquivo novamente;
- Evitar downloads duplicados;
- Tratar adequadamente erros de geração, indisponibilidade ou bloqueio do navegador.

---

## 4. Fora do escopo

Esta primeira versão não contempla:

- Alteração do conteúdo do dossiê;
- Alteração do layout ou template do documento;
- Envio do dossiê por e-mail;
- Compartilhamento por link;
- Download automático de múltiplos dossiês;
- Sincronização com serviços externos de armazenamento;
- Retomada automática de downloads interrompidos;
- Conversão entre formatos diferentes.

---

## 5. Usuários impactados

- Usuários que geram um dossiê individualmente;
- Usuários autenticados que possuem permissão para visualizar ou baixar o dossiê;
- Administradores que acompanham a geração dos documentos.

---

## 6. User stories

### História principal

> Como usuário, quero que o dossiê seja baixado automaticamente quando estiver pronto, para não precisar procurar ou clicar novamente no botão de download.

### Histórias complementares

> Como usuário, quero saber quando o dossiê está sendo gerado, para entender que o sistema está processando minha solicitação.

> Como usuário, quero poder baixar o dossiê manualmente caso o download automático não aconteça.

> Como usuário, quero receber uma mensagem clara caso a geração ou o download falhe.

> Como administrador, quero acompanhar a quantidade de downloads automáticos realizados para avaliar o uso da funcionalidade.

---

## 7. Fluxo esperado

1. O usuário solicita a geração do dossiê.
2. O sistema exibe o status **“Gerando dossiê...”**.
3. O sistema processa as informações e gera o arquivo.
4. Quando o arquivo estiver disponível:
   - O sistema altera o status para **“Dossiê pronto”**;
   - O download é iniciado automaticamente;
   - Uma mensagem de confirmação é exibida.
5. Após o início do download:
   - O usuário pode continuar utilizando a aplicação;
   - O botão **“Baixar novamente”** fica disponível.
6. Caso o download automático seja bloqueado ou falhe:
   - O sistema exibe uma mensagem explicativa;
   - O botão manual de download permanece disponível.

---

## 8. Requisitos funcionais

### RF01 — Iniciar o download automaticamente

Quando a geração do dossiê for concluída com sucesso, o sistema deve iniciar automaticamente o download do arquivo.

### RF02 — Validar disponibilidade do arquivo

O download automático só deve ser iniciado quando:

- O arquivo tiver sido gerado com sucesso;
- O arquivo estiver disponível no armazenamento;
- O usuário tiver permissão para acessá-lo;
- A URL ou resposta de download estiver válida.

### RF03 — Exibir estado de processamento

Enquanto o dossiê estiver sendo gerado, o sistema deve exibir um indicador de progresso ou status, por exemplo:

- **Gerando dossiê...**
- **Preparando download...**
- **Dossiê pronto**
- **Download iniciado**
- **Não foi possível baixar o dossiê**

### RF04 — Permitir download manual

O usuário deve ter acesso a um botão **“Baixar novamente”** após a geração do dossiê.

Esse botão também deve aparecer quando:

- O navegador bloquear o download automático;
- O download automático falhar;
- O usuário fechar ou cancelar o download;
- O arquivo já tiver sido baixado anteriormente.

### RF05 — Evitar downloads duplicados

O sistema não deve iniciar múltiplos downloads automáticos para a mesma geração do dossiê.

A aplicação deve controlar, no mínimo:

- Identificador da geração;
- Status do download;
- Se o download automático já foi disparado;
- Tentativas de download realizadas.

### RF06 — Tratar falhas

Em caso de erro, o sistema deve:

- Informar que o dossiê foi gerado, mas não pôde ser baixado;
- Disponibilizar o download manual;
- Permitir tentar novamente;
- Registrar o erro para diagnóstico.

### RF07 — Nomear o arquivo

O arquivo deve ser baixado com um nome padronizado e compreensível.

Exemplo:

```text
dossie-{identificador}-{data}.pdf
```

Exemplo real:

```text
dossie-12345-2026-09-22.pdf
```

### RF08 — Preservar o formato atual

O formato do arquivo deve permanecer igual ao utilizado atualmente, salvo decisão específica do produto.

### RF09 — Respeitar permissões

Somente usuários autorizados devem conseguir baixar o dossiê.

A URL ou mecanismo de download não deve permitir acesso não autenticado ou acesso a documentos de outros usuários.

### RF10 — Permitir reprocessamento

Caso a geração falhe, o usuário deve receber uma opção para tentar gerar o dossiê novamente, quando tecnicamente possível.

---

## 9. Requisitos não funcionais

### RNF01 — Performance

Após o arquivo estar disponível, o download deve ser iniciado em até **2 segundos**, desconsiderando latência ou limitações do navegador.

### RNF02 — Compatibilidade

A funcionalidade deve funcionar nos navegadores oficialmente suportados pela aplicação, incluindo:

- Google Chrome;
- Microsoft Edge;
- Mozilla Firefox;
- Safari, quando aplicável.

### RNF03 — Segurança

- O arquivo deve ser entregue por conexão segura;
- URLs temporárias devem expirar;
- O endpoint deve validar autenticação e autorização;
- O nome do arquivo não deve conter dados sensíveis desnecessários;
- O download deve ser protegido contra acesso direto indevido.

### RNF04 — Observabilidade

Devem ser registrados eventos de:

- Solicitação de geração;
- Geração concluída;
- Geração com erro;
- Download automático iniciado;
- Download automático concluído, quando mensurável;
- Download manual iniciado;
- Download bloqueado ou falho.

### RNF05 — Acessibilidade

- O status da geração deve ser comunicado a leitores de tela;
- O botão de download manual deve possuir nome acessível;
- As mensagens de sucesso e erro devem ter contraste adequado;
- A funcionalidade não deve depender exclusivamente de cor.

---

## 10. Regras de negócio

1. O download automático só pode ocorrer após a conclusão bem-sucedida da geração.
2. Cada geração do dossiê deve disparar no máximo um download automático.
3. O usuário deve poder iniciar o download manual mais de uma vez.
4. O download automático não deve ocorrer para documentos sem permissão de acesso.
5. Se o navegador bloquear o download, o sistema deve manter o arquivo disponível para download manual.
6. A disponibilidade do arquivo deve ser validada antes de iniciar o download.
7. Em caso de expiração da URL temporária, o sistema deve solicitar ou gerar uma nova URL válida.
8. O comportamento deve ser idempotente: atualizar a página não deve gerar downloads automáticos duplicados para a mesma geração.

---

## 11. Interface e experiência do usuário

### Estado 1 — Geração em andamento

Exibir:

> Gerando seu dossiê. Aguarde alguns instantes.

Com indicador visual de carregamento.

### Estado 2 — Dossiê pronto

Exibir:

> Seu dossiê foi gerado e o download foi iniciado.

Disponibilizar o botão:

> Baixar novamente

### Estado 3 — Download bloqueado

Exibir:

> O navegador bloqueou o download automático. Clique abaixo para baixar o dossiê.

Disponibilizar o botão:

> Baixar dossiê

### Estado 4 — Erro na geração

Exibir:

> Não foi possível gerar o dossiê.

Disponibilizar:

- Botão **Tentar novamente**;
- Orientação para entrar em contato com o suporte, se necessário.

### Estado 5 — Erro no download

Exibir:

> O dossiê foi gerado, mas não foi possível iniciar o download.

Disponibilizar:

- Botão **Tentar download novamente**;
- Link ou ação para voltar à página do dossiê.

---

## 12. Critérios de aceite

### Cenário 1 — Download automático realizado

**Dado que** o usuário solicitou a geração do dossiê  
**E** a geração foi concluída com sucesso  
**Quando** o arquivo estiver disponível  
**Então** o sistema deve iniciar automaticamente o download  
**E** deve exibir uma mensagem de confirmação.

### Cenário 2 — Download manual disponível

**Dado que** o dossiê foi gerado  
**Quando** o download automático for concluído ou bloqueado  
**Então** o botão **Baixar novamente** deve estar disponível.

### Cenário 3 — Evitar duplicidade

**Dado que** o download automático já foi iniciado para uma geração  
**Quando** o usuário atualizar a página  
**Então** o sistema não deve iniciar outro download automático para a mesma geração.

### Cenário 4 — Erro na geração

**Dado que** ocorreu um erro durante a geração  
**Quando** o processamento terminar  
**Então** o sistema deve informar o erro  
**E** não deve iniciar o download  
**E** deve oferecer uma opção para tentar novamente, quando aplicável.

### Cenário 5 — Erro no download

**Dado que** o dossiê foi gerado com sucesso  
**E** o download automático falhou  
**Quando** o erro for identificado  
**Então** o sistema deve exibir uma mensagem clara  
**E** deve manter o botão de download manual disponível.

### Cenário 6 — Usuário sem permissão

**Dado que** o usuário não possui permissão para acessar o dossiê  
**Quando** o arquivo estiver disponível  
**Então** o sistema não deve iniciar o download  
**E** deve exibir uma mensagem de acesso negado.

### Cenário 7 — Nome do arquivo

**Dado que** o download foi iniciado  
**Quando** o arquivo for salvo no dispositivo do usuário  
**Então** ele deve utilizar o padrão de nomenclatura definido pelo produto.

---

## 13. Métricas de sucesso

Após o lançamento, acompanhar:

- Percentual de dossiês baixados automaticamente;
- Percentual de downloads automáticos bloqueados;
- Percentual de falhas no download;
- Percentual de usuários que usam o download manual;
- Tempo médio entre a conclusão da geração e o início do download;
- Taxa de sucesso da geração do dossiê;
- Quantidade de downloads duplicados;
- Chamados de suporte relacionados ao download.

### Meta sugerida

- Pelo menos **95%** dos dossiês gerados devem iniciar o download automaticamente;
- Menos de **2%** dos downloads devem apresentar erro técnico;
- Reduzir em **50%** os cliques necessários para acessar um dossiê;
- Não aumentar significativamente o número de downloads duplicados.

---

## 14. Eventos de analytics

Sugestão de eventos:

```text
dossier_generation_started
dossier_generation_succeeded
dossier_generation_failed
dossier_auto_download_started
dossier_auto_download_failed
dossier_manual_download_started
dossier_download_completed
dossier_download_blocked
```

Parâmetros sugeridos:

```text
dossier_id
generation_id
user_id_hash
file_format
file_size
error_code
download_type
timestamp
```

Não registrar conteúdo sensível do dossiê nos eventos.

---

## 15. Dependências técnicas

- Endpoint ou serviço responsável pela geração do dossiê;
- Endpoint seguro para download;
- Identificador único da geração;
- Mecanismo de armazenamento do arquivo;
- Controle de autenticação e autorização;
- Tratamento de URLs temporárias;
- Interface para exibição dos estados de processamento;
- Sistema de logs e monitoramento.

---

## 16. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---:|---|
| Navegador bloquear downloads automáticos | Médio | Disponibilizar botão de download manual |
| Download duplicado após atualização da página | Alto | Persistir o status do download por geração |
| URL de download expirar | Médio | Gerar nova URL sob demanda |
| Arquivo ainda não estar disponível | Alto | Validar disponibilidade antes do download |
| Usuário perder o arquivo baixado | Baixo | Manter opção de baixar novamente |
| Falha silenciosa | Alto | Exibir status e registrar eventos |
| Acesso indevido ao arquivo | Alto | Validar autenticação, autorização e expiração da URL |
| Arquivo muito grande | Médio | Exibir feedback de preparação e avaliar processamento assíncrono |

---

## 17. Plano de implementação

### Fase 1 — Preparação

- Identificar o fluxo atual de geração;
- Identificar o endpoint atual de download;
- Definir o identificador da geração;
- Mapear os estados existentes na interface;
- Definir eventos de analytics e logs.

### Fase 2 — Backend

- Garantir que o serviço informe quando o arquivo estiver disponível;
- Implementar ou revisar o endpoint seguro de download;
- Implementar controle de idempotência;
- Adicionar tratamento de expiração de URL;
- Adicionar logs de geração e download.

### Fase 3 — Frontend

- Implementar o disparo automático;
- Implementar controle para evitar duplicidade;
- Adicionar estados de carregamento, sucesso e erro;
- Manter o botão de download manual;
- Implementar tratamento para bloqueio do navegador.

### Fase 4 — Testes

- Testes unitários;
- Testes de integração;
- Testes nos navegadores suportados;
- Testes de permissões;
- Testes de atualização da página;
- Testes de falha e retry;
- Testes com arquivos grandes.

### Fase 5 — Lançamento

- Liberar inicialmente para um grupo pequeno de usuários;
- Monitorar falhas e downloads duplicados;
- Ajustar mensagens e comportamento;
- Expandir gradualmente para toda a base.

---

## 18. Plano de rollout

Sugestão:

1. Implementação atrás de uma feature flag;
2. Ativação para usuários internos;
3. Ativação para 5% dos usuários;
4. Monitoramento por 24 a 48 horas;
5. Expansão para 25%;
6. Expansão para 100% após validação das métricas.

A funcionalidade deve poder ser desativada rapidamente caso sejam identificados problemas críticos.

---

## 19. Perguntas em aberto

1. O dossiê será sempre baixado em PDF ou existem outros formatos?
2. O download automático deve ocorrer apenas após uma ação explícita do usuário?
3. O sistema deve iniciar o download mesmo que a aba esteja em segundo plano?
4. Qual é o tempo de validade da URL de download?
5. O usuário poderá gerar mais de um dossiê simultaneamente?
6. Existe limite de tamanho para os arquivos?
7. O download deve continuar disponível após o encerramento da sessão?
8. O dossiê deve ser armazenado permanentemente ou apenas durante um período determinado?
9. Em caso de falha, o sistema deve tentar novamente automaticamente?
10. O produto precisa enviar uma notificação quando o download automático não for possível?

---

## 20. Definição de pronto

A funcionalidade será considerada pronta quando:

- O download automático ocorrer após uma geração bem-sucedida;
- Downloads duplicados forem evitados;
- O download manual estiver disponível;
- Os estados de carregamento, sucesso e erro estiverem implementados;
- As permissões de acesso estiverem validadas;
- Os cenários de falha estiverem tratados;
- Os principais navegadores suportados forem testados;
- Os eventos de monitoramento estiverem registrados;
- Os critérios de aceite forem validados;
- A funcionalidade estiver protegida por feature flag ou mecanismo equivalente durante o rollout inicial.

---

## 21. Mapeamento da implementação (back-end)

Este projeto é um agente eve sem frontend; o "dossiê" é um Markdown `.md` gerado pelo
subagente `client-dossier`. O "download" é a entrega do arquivo ao usuário ao fim da
geração, implementado nos dois canais.

| Req. | Implementação |
|------|---------------|
| RF01 (auto) | Disparo automático no evento `message.completed` de cada canal (`telegram.ts` envia via `sendDocument`; `eve.ts` valida e sinaliza pronto). |
| RF02 (disponibilidade) | `sandbox.readTextFile({ path })` retorna `null` → download não dispara. |
| RF04 (manual) | Telegram: o texto final permanece com os caminhos; falha de envio gera mensagem e o caminho fica disponível para re-solicitar. |
| RF05 (idempotência) | Chave estável por geração (`dossierDownloadKey`, o runId no caminho) + `defineState` durável (`sentDownloadKeys`). |
| RF06 (falhas) | `dossier_auto_download_failed` com `reason` (`file-not-found`, `http-<status>`, `exception`) + fallback em texto/mensagem clara. |
| RF07 (nomenclatura) | `dossie-<slug>.md` em `dossierDocumentFilename`. |
| RF08 (formato) | Preserva `.md` atual (text/markdown). |
| RF09 (permissões) | Telegram: gatekeeper/allowlist. Web: `auth` do canal eve. |
| RNF04 (observabilidade) | Eventos estruturados `dossier_auto_download_{started,succeeded,failed,skipped}` via `logDossierDownload`. |

Módulo central (fonte única de verdade): `agent/lib/dossier/download.ts` (lógica pura,
testada em `tests/lib/dossier-download.test.ts`). Canais: `agent/channels/telegram.ts` e
`agent/channels/eve.ts`.

**Fora do escopo deste back-end** (exigem frontend, conforme §4): download automático em
navegador (blob/`<a download>`), botões "Baixar novamente"/"Tentar novamente", conversão
para PDF e mensagens de estado renderizadas em UI. O relatório final do agente já expõe
`dossier.meta.markdownPath` (e caminhos em `dossiers/<slug>/latest/`), que um frontend pode
consumir para orquestrar o download no lado do cliente.