/**
 * Allowlist estática do canal Telegram (PRD §3).
 *
 * O Telegram não expõe o número de telefone nos webhooks comuns — apenas o
 * `user_id`. Por isso cada contato mapeia telefone → user id:
 *
 * - `phone`: número em formato internacional, usado no fluxo de primeiro uso
 *   ("Compartilhar Contato") para identificar o dono.
 * - `telegramUserId`: preenchido após a identificação; é o que libera o acesso
 *   definitivo nas mensagens seguintes.
 *
 * Em produção, a lista pode ser complementada sem redeploy de código via
 * `TELEGRAM_ALLOWED_USER_IDS` e `TELEGRAM_ALLOWED_PHONES` (ver `auth.ts`).
 */

export interface AllowedContact {
  readonly name?: string;
  readonly phone?: string;
  readonly telegramUserId?: string | number | null;
}

export const allowedContacts: AllowedContact[] = [
  {
    name: "Dono do bot",
    phone: "+55 51 982548025",
    telegramUserId: null,
  },
];
