# 08 — Fluxo de desenvolvimento

## Loop de desenvolvimento recomendado

1. **Entenda a tarefa.** Identifique se é uma mudança de conteúdo ou de código (veja [`06-padroes-e-convencoes.md`](06-padroes-e-convencoes.md)).

2. **Leia a documentação relevante.** Para recursos do eve (tools, canais, subagentes, skills, schedules, deploy), comece por `node_modules/eve/docs/README.md` e leia a página correspondente.

3. **Edite no lugar certo.**
   - Conteúdo → `agent/instructions.md`.
   - Código → arquivos sob `agent/`.

4. **Rode localmente.**
   ```sh
   npm run dev
   ```
   O TUI abre uma sessão interativa para conversar com o agente. O eve recarrega as mudanças conforme você trabalha.

5. **Valide.**
   ```sh
   npm run typecheck
   ```
   Rode também a validação específica que a tarefa pedir. Se a validação não cobrir o comportamento alterado, rode a checagem mais estreita relevante.

   Para o núcleo determinístico do subagente `client-dossier` existe uma checagem offline (sem rede e sem modelo):

   ```sh
   node scripts/check-dossier-lib.mts
   ```

   E para os casos de comportamento do agente (PRD §11), com credenciais de modelo configuradas:

   ```sh
   npm run eval client-dossier
   ```

6. **Revise e commit.**

## Mudanças somente de conteúdo

Não é necessário ler os docs do framework. Edite diretamente `agent/instructions.md`.

## Mudanças de código

Siga o loop de autoria limitado:

1. Leia a página relevante do eve e inspecione **apenas** os arquivos que vai modificar ou imitar.
2. Pare a descoberta assim que localização, imports e formato da definição estiverem claros.
3. Implemente o **menor comportamento completo** solicitado.
4. Rode **uma** verificação estreita; expanda a investigação só se falhar ou se a tarefa exigir detalhes específicos do projeto.

## Ambiente local

- Requer **Node.js 24.x**.
- O canal usa `localDev()`, então o agente fica acessível em `localhost` durante `eve dev`/REPL.
- Segredos locais ficam em `env.local` (já ignorado pelo `.gitignore`).
