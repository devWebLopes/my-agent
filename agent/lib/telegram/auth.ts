import type {
  TelegramContext,
  TelegramInboundResult,
  TelegramMessage,
} from "eve/channels/telegram";

import { allowedContacts, type AllowedContact } from "./allowed-contacts.ts";

export type { AllowedContact } from "./allowed-contacts.ts";

/**
 * Gatekeeper do canal Telegram (PRD §2 e §3): allowlist estática de contatos
 * autorizados, complementada por variáveis de ambiente na Vercel.
 *
 * O Telegram não expõe o número de telefone nos webhooks comuns — apenas o
 * `user_id`. Por isso a allowlist mapeia telefone → user id, e o fluxo de
 * "Compartilhar Contato" (botão de anexo do Telegram) serve para o primeiro
 * uso: o dono envia o próprio contato, o bot confirma o número e devolve o
 * `user_id` para ser cadastrado aqui (ou em `TELEGRAM_ALLOWED_USER_IDS`).
 */

export type AuthorizationResult =
  | { readonly status: "authorized"; readonly via: "userId" | "phone"; readonly contact: AllowedContact }
  | { readonly status: "unauthorized" };

export type GatekeeperAction =
  | { readonly action: "dispatch" }
  | { readonly action: "reject" }
  | { readonly action: "identify"; readonly userId: string; readonly phone: string }
  | { readonly action: "ignore" };

export interface SharedContactInput {
  readonly phoneNumber?: string | null;
  readonly userId?: string | number | null;
}

export interface InboundMessageInput {
  readonly chatType: string;
  readonly isBot?: boolean;
  readonly userId?: string | number | null;
  readonly text?: string;
  readonly caption?: string;
  readonly hasAttachments?: boolean;
  readonly contact?: SharedContactInput | null;
  readonly replyToFromIsBot?: boolean;
  readonly botUsername?: string | undefined;
  readonly contacts: readonly AllowedContact[];
}

export const UNAUTHORIZED_MESSAGE = "Acesso não autorizado.";

/** Normaliza um telefone para apenas dígitos ("+55 51 98254-8025" → "5551982548025"). */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Carrega a allowlist: o arquivo estático `allowed-contacts.ts` mais as
 * variáveis `TELEGRAM_ALLOWED_USER_IDS` e `TELEGRAM_ALLOWED_PHONES`
 * (listas separadas por vírgula), para ajuste sem redeploy de código na Vercel.
 */
export function loadAllowedContacts(env: NodeJS.ProcessEnv = process.env): AllowedContact[] {
  const contacts: AllowedContact[] = [...allowedContacts];

  const userIds = (env.TELEGRAM_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  for (const telegramUserId of userIds) {
    if (!contacts.some((contact) => String(contact.telegramUserId) === telegramUserId)) {
      contacts.push({ telegramUserId });
    }
  }

  const phones = (env.TELEGRAM_ALLOWED_PHONES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  for (const phone of phones) {
    if (!contacts.some((contact) => contact.phone !== undefined && normalizePhone(contact.phone) === normalizePhone(phone))) {
      contacts.push({ phone });
    }
  }

  return contacts;
}

/** Autoriza um remetente pelo Telegram user id ou pelo telefone de um contato compartilhado. */
export function authorizeTelegramSender(input: {
  readonly userId?: string | number | null;
  readonly contactPhone?: string | null;
  readonly contacts: readonly AllowedContact[];
}): AuthorizationResult {
  const { userId, contactPhone, contacts } = input;

  if (userId !== null && userId !== undefined) {
    const id = String(userId);
    const contact = contacts.find(
      (candidate) => candidate.telegramUserId !== null && candidate.telegramUserId !== undefined
        && String(candidate.telegramUserId) === id,
    );
    if (contact !== undefined) {
      return { status: "authorized", via: "userId", contact };
    }
  }

  if (contactPhone !== null && contactPhone !== undefined) {
    const phone = normalizePhone(contactPhone);
    if (phone.length > 0) {
      const contact = contacts.find(
        (candidate) => candidate.phone !== undefined && normalizePhone(candidate.phone) === phone,
      );
      if (contact !== undefined) {
        return { status: "authorized", via: "phone", contact };
      }
    }
  }

  return { status: "unauthorized" };
}

/**
 * Replica o gating de despacho do canal: privado sempre passa; em grupos só
 * comando `/cmd`, `/cmd@bot`, menção `@bot` ou resposta a mensagem do bot.
 */
export function isAddressedToBot(input: {
  readonly chatType: string;
  readonly text: string;
  readonly caption: string;
  readonly botUsername?: string | undefined;
  readonly replyToFromIsBot: boolean;
}): boolean {
  const { chatType, text, caption, botUsername, replyToFromIsBot } = input;
  if (chatType === "private") return true;
  if (replyToFromIsBot) return true;

  const content = text.trim().length > 0 ? text : caption;
  if (content.trim().length === 0) return false;

  const command = /^\/[A-Za-z0-9_]+(?:@(?<target>[A-Za-z0-9_]+))?(?:\s|$)/u.exec(content);
  if (command !== null) {
    const target = command.groups?.["target"];
    if (target === undefined) return true;
    if (botUsername !== undefined && target.toLowerCase() === botUsername.toLowerCase()) return true;
  }

  if (botUsername !== undefined) {
    const escaped = botUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mention = new RegExp(`(?:^|[^A-Za-z0-9_])@${escaped}(?=$|[^A-Za-z0-9_])`, "iu");
    if (mention.test(content)) return true;
  }

  return false;
}

/**
 * Decide o que fazer com uma mensagem inbound do Telegram:
 * - `dispatch`: autorizada, segue para o orquestrador (que delega ao client-dossier);
 * - `reject`: não autorizada — responde "Acesso não autorizado." e descarta;
 * - `identify`: contato próprio com telefone permitido — devolve o user id para cadastro;
 * - `ignore`: nada a fazer (bots, canais, grupos sem menção, mensagens vazias).
 */
export function evaluateInboundMessage(input: InboundMessageInput): GatekeeperAction {
  const {
    chatType,
    isBot = false,
    userId = null,
    text = "",
    caption = "",
    hasAttachments = false,
    contact = null,
    replyToFromIsBot = false,
    botUsername,
    contacts,
  } = input;

  if (isBot || chatType === "channel") return { action: "ignore" };

  // Fluxo "Compartilhar Contato" (primeiro uso): o remetente envia o próprio
  // contato; se o telefone estiver na allowlist, devolvemos o user id dele
  // para ser mapeado no allowed-contacts.json / TELEGRAM_ALLOWED_USER_IDS.
  if (contact?.phoneNumber !== null && contact?.phoneNumber !== undefined) {
    const phone = normalizePhone(contact.phoneNumber);
    const selfShare =
      contact.userId !== null && contact.userId !== undefined
      && userId !== null && String(contact.userId) === String(userId);

    if (selfShare) {
      const byUserId = authorizeTelegramSender({ userId, contacts });
      const byPhone = authorizeTelegramSender({ contactPhone: contact.phoneNumber, contacts });
      if (byUserId.status === "authorized" || byPhone.status === "authorized") {
        return { action: "identify", userId: String(userId), phone };
      }
    }
    // Contato de terceiro encaminhado ou telefone não permitido: se o
    // remetente já é autorizado, apenas ignore; senão, rejeite.
    const sender = authorizeTelegramSender({ userId, contacts });
    return sender.status === "authorized" ? { action: "ignore" } : { action: "reject" };
  }

  const hasContent = text.trim().length > 0 || caption.trim().length > 0 || hasAttachments;
  if (!hasContent) return { action: "ignore" };

  if (!isAddressedToBot({ chatType, text, caption, botUsername, replyToFromIsBot })) {
    return { action: "ignore" };
  }

  const auth = authorizeTelegramSender({ userId, contacts });
  return auth.status === "authorized" ? { action: "dispatch" } : { action: "reject" };
}

/** Mensagem do fluxo de identificação: confirma o telefone e expõe o user id para cadastro. */
export function renderIdentifyMessage(input: { readonly userId: string; readonly phone: string }): string {
  return [
    `Número +${input.phone} autorizado ✅`,
    "",
    `Seu Telegram user id é: ${input.userId}`,
    "",
    "Para liberar o acesso definitivo, cadastre-o:",
    '• em `allowed-contacts.ts`: telegramUserId: "' + input.userId + '"',
    `• ou na Vercel: TELEGRAM_ALLOWED_USER_IDS=${input.userId}`,
  ].join("\n");
}

/** Extrai o contato compartilhado do payload bruto do Telegram, quando presente. */
function readSharedContact(message: TelegramMessage): SharedContactInput | null {
  const raw = message.raw["contact"];
  if (raw === null || typeof raw !== "object") return null;
  const contact = raw as Record<string, unknown>;
  return {
    phoneNumber: typeof contact["phone_number"] === "string" ? contact["phone_number"] : null,
    userId:
      typeof contact["user_id"] === "number" || typeof contact["user_id"] === "string"
        ? contact["user_id"]
        : null,
  };
}

export interface GatekeeperOptions {
  readonly contacts: readonly AllowedContact[];
  /** Chamado apenas para mensagens autorizadas: devolve o auth que inicia o turno no orquestrador. */
  readonly onAuthorized: (
    ctx: TelegramContext,
    message: TelegramMessage,
  ) => TelegramInboundResult | Promise<TelegramInboundResult>;
  readonly unauthorizedMessage?: string;
}

/**
 * Fábrica do hook `onMessage` do canal Telegram. Retornar `null` descarta o
 * update (o webhook responde HTTP 200, sem reenvio do Telegram).
 */
export function createTelegramGatekeeper(
  options: GatekeeperOptions,
): (ctx: TelegramContext, message: TelegramMessage) => Promise<TelegramInboundResult> {
  const unauthorizedMessage = options.unauthorizedMessage ?? UNAUTHORIZED_MESSAGE;

  return async (ctx, message) => {
    const decision = evaluateInboundMessage({
      chatType: message.chat.type,
      isBot: message.from?.isBot ?? false,
      userId: message.from?.id ?? null,
      text: message.text,
      caption: message.caption,
      hasAttachments: message.attachments.length > 0,
      contact: readSharedContact(message),
      replyToFromIsBot: message.replyToMessage?.from?.isBot ?? false,
      botUsername: ctx.telegram.botUsername,
      contacts: options.contacts,
    });

    switch (decision.action) {
      case "dispatch":
        return options.onAuthorized(ctx, message);
      case "reject":
        await ctx.telegram.post(unauthorizedMessage);
        return null;
      case "identify":
        await ctx.telegram.post(renderIdentifyMessage(decision));
        return null;
      case "ignore":
        return null;
    }
  };
}
