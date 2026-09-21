import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authorizeTelegramSender,
  createTelegramGatekeeper,
  evaluateInboundMessage,
  loadAllowedContacts,
  normalizePhone,
  UNAUTHORIZED_MESSAGE,
  type AllowedContact,
} from "../../agent/lib/telegram/auth.ts";

const OWNER_PHONE = "+55 51 982548025";
const OWNER_USER_ID = "111222333";

/** Allowlist de teste: o número do dono mapeado a um Telegram user id. */
const CONTACTS: AllowedContact[] = [
  { name: "Dono", phone: OWNER_PHONE, telegramUserId: OWNER_USER_ID },
];

function fakeMessage(overrides: Record<string, unknown> = {}) {
  return {
    attachments: [],
    caption: "",
    chat: { id: "555000111", type: "private" },
    from: { id: OWNER_USER_ID, isBot: false },
    messageId: "1",
    raw: {},
    text: "Gerar dossiê para Empresa X",
    ...overrides,
  } as never;
}

function fakeCtx() {
  const posted: string[] = [];
  const ctx = {
    telegram: {
      chatId: "555000111",
      post: async (message: string) => {
        posted.push(message);
        return { id: "1", raw: null };
      },
    },
  };
  return { ctx: ctx as never, posted };
}

describe("telegram gatekeeper (allowlist)", () => {
  it("should_reject_unauthorized_telegram_request", async () => {
    // Payload vindo de um user_id que NÃO está na allowlist.
    const decision = evaluateInboundMessage({
      chatType: "private",
      userId: "999999999",
      text: "Gerar dossiê para Empresa X",
      contacts: CONTACTS,
    });
    assert.equal(decision.action, "reject");

    // O gatekeeper aborta: não devolve auth, logo o turno nunca chega ao
    // orquestrador nem aciona o client-dossier.
    let delegated = false;
    const gatekeeper = createTelegramGatekeeper({
      contacts: CONTACTS,
      onAuthorized: async () => {
        delegated = true;
        return { auth: null };
      },
    });
    const { ctx, posted } = fakeCtx();
    const result = await gatekeeper(ctx, fakeMessage({ from: { id: "999999999", isBot: false } }));

    assert.equal(result, null);
    assert.equal(delegated, false);
    assert.deepEqual(posted, [UNAUTHORIZED_MESSAGE]);
  });

  it("should_accept_authorized_telegram_request", async () => {
    // Webhook com a identificação ligada ao número 55 51 982548025.
    const decision = evaluateInboundMessage({
      chatType: "private",
      userId: OWNER_USER_ID,
      text: "Gerar dossiê para Empresa X",
      contacts: CONTACTS,
    });
    assert.deepEqual(decision, { action: "dispatch" });

    const gatekeeper = createTelegramGatekeeper({
      contacts: CONTACTS,
      onAuthorized: async () => ({ auth: { principalId: `telegram:${OWNER_USER_ID}` } as never }),
    });
    const { ctx, posted } = fakeCtx();
    const result = await gatekeeper(ctx, fakeMessage());

    assert.notEqual(result, null);
    assert.equal(posted.length, 0);
  });

  it("should_delegate_task_to_client_dossier_agent", async () => {
    // Mensagem autorizada: o gatekeeper entrega a mensagem íntegra ao
    // orquestrador (que delega a coleta ao subagente client-dossier).
    const seen: unknown[] = [];
    const gatekeeper = createTelegramGatekeeper({
      contacts: CONTACTS,
      onAuthorized: async (_ctx, message) => {
        seen.push(message);
        return { auth: { principalId: `telegram:${OWNER_USER_ID}` } as never };
      },
    });
    const { ctx } = fakeCtx();
    const message = fakeMessage({ text: "Gerar dossiê para Empresa X" });
    const result = await gatekeeper(ctx, message);

    assert.equal(seen.length, 1);
    assert.equal((seen[0] as { text: string }).text, "Gerar dossiê para Empresa X");
    assert.notEqual(result, null);
  });
});

describe("telegram allowlist helpers", () => {
  it("normalizes phone numbers to digits only", () => {
    assert.equal(normalizePhone("+55 51 982548025"), "5551982548025");
    assert.equal(normalizePhone("5551982548025"), "5551982548025");
    assert.equal(normalizePhone("+55 (51) 98254-8025"), "5551982548025");
  });

  it("authorizes by telegram user id and by shared contact phone", () => {
    assert.equal(
      authorizeTelegramSender({ userId: OWNER_USER_ID, contacts: CONTACTS }).status,
      "authorized",
    );
    const byPhone = authorizeTelegramSender({ contactPhone: "55 51 98254-8025", contacts: CONTACTS });
    assert.equal(byPhone.status, "authorized");
    assert.equal(byPhone.status === "authorized" ? byPhone.via : null, "phone");
    assert.equal(
      authorizeTelegramSender({ userId: "42", contactPhone: "+55 11 99999-0000", contacts: CONTACTS }).status,
      "unauthorized",
    );
  });

  it("identifies an allowed phone sharing its own contact", () => {
    const decision = evaluateInboundMessage({
      chatType: "private",
      userId: "777",
      contact: { phoneNumber: "+5551982548025", userId: "777" },
      contacts: CONTACTS,
    });
    assert.deepEqual(decision, { action: "identify", userId: "777", phone: "5551982548025" });
  });

  it("rejects a contact share of an allowed phone by someone else", () => {
    const decision = evaluateInboundMessage({
      chatType: "private",
      userId: "888",
      contact: { phoneNumber: "+5551982548025", userId: "777" },
      contacts: CONTACTS,
    });
    assert.equal(decision.action, "reject");
  });

  it("ignores bots, channels and non-addressed group messages", () => {
    assert.equal(
      evaluateInboundMessage({ chatType: "private", isBot: true, userId: OWNER_USER_ID, text: "x", contacts: CONTACTS }).action,
      "ignore",
    );
    assert.equal(
      evaluateInboundMessage({ chatType: "channel", userId: OWNER_USER_ID, text: "x", contacts: CONTACTS }).action,
      "ignore",
    );
    assert.equal(
      evaluateInboundMessage({ chatType: "group", userId: OWNER_USER_ID, text: "conversa alheia", contacts: CONTACTS, botUsername: "my_bot" }).action,
      "ignore",
    );
    assert.equal(
      evaluateInboundMessage({ chatType: "group", userId: OWNER_USER_ID, text: "@my_bot gera dossiê", contacts: CONTACTS, botUsername: "my_bot" }).action,
      "dispatch",
    );
  });

  it("merges env vars (TELEGRAM_ALLOWED_USER_IDS / TELEGRAM_ALLOWED_PHONES) into the allowlist", () => {
    const contacts = loadAllowedContacts({
      TELEGRAM_ALLOWED_USER_IDS: "123, 456",
      TELEGRAM_ALLOWED_PHONES: "+55 11 90000-0000",
    } as NodeJS.ProcessEnv);
    assert.ok(contacts.some((c) => c.telegramUserId === "123"));
    assert.ok(contacts.some((c) => c.telegramUserId === "456"));
    assert.ok(contacts.some((c) => normalizePhone(c.phone ?? "") === "5511900000000"));
  });
});
