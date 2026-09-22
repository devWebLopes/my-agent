import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dossierDocumentFilename,
  extractDossierMarkdownPath,
  sendTelegramDocument,
  toMarkdownDocument,
} from "../../agent/lib/telegram/dossier-document.ts";

const MARKDOWN = "# Dossiê — Empresa X\n\n- Site: https://empresax.com.br\n- Status: complete\n";

describe("dossier document generator", () => {
  it("should_convert_markdown_string_to_buffer", () => {
    const document = toMarkdownDocument(MARKDOWN, "dossie_empresa-x.md");

    assert.ok(Buffer.isBuffer(document.buffer));
    assert.equal(document.buffer.toString("utf8"), MARKDOWN);
    assert.equal(document.mimeType, "text/markdown");
    assert.equal(document.filename, "dossie_empresa-x.md");
  });

  it("extracts the dossier markdown path from the agent report", () => {
    const report =
      "Coleta concluída (partial).\n" +
      "- dossiers/empresa-x/runs/2026-09-20_10-00-00_a1b2c3/dossie.md\n" +
      "- dossiers/empresa-x/latest/dossie.md\n" +
      "Caminho completo: /workspace/dossiers/empresa-x/runs/2026-09-20_10-00-00_a1b2c3/dossie.md";
    assert.equal(
      extractDossierMarkdownPath(report),
      "dossiers/empresa-x/runs/2026-09-20_10-00-00_a1b2c3/dossie.md",
    );
    assert.equal(extractDossierMarkdownPath("Nenhum dossiê aqui."), null);
  });

  it("builds a dynamic document filename from the dossier path", () => {
    assert.equal(
      dossierDocumentFilename("dossiers/empresa-x/runs/2026-09-20_10-00-00_a1b2c3/dossie.md"),
      "dossie-empresa-x.md",
    );
    assert.equal(dossierDocumentFilename("dossiers/padaria-do-ze/latest/dossie.md"), "dossie-padaria-do-ze.md");
  });
});

describe("telegram sendDocument delivery", () => {
  it("should_call_telegram_sendDocument_api", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const document = toMarkdownDocument(MARKDOWN, "dossie_empresa-x.md");
    const result = await sendTelegramDocument({
      botToken: "123456:ABC",
      chatId: "555000111",
      document,
      caption: "Dossiê da Empresa X",
      fetch: fakeFetch as typeof fetch,
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);

    const [{ url, init }] = calls;
    // Método sendDocument (nunca sendMessage) com o token do bot.
    assert.equal(url, "https://api.telegram.org/bot123456:ABC/sendDocument");
    assert.ok(!url.includes("sendMessage"));
    assert.equal(init.method, "POST");

    // Multipart com chat_id, caption e o arquivo .md anexado.
    const form = init.body as FormData;
    assert.ok(form instanceof FormData);
    assert.equal(form.get("chat_id"), "555000111");
    assert.equal(form.get("caption"), "Dossiê da Empresa X");
    const file = form.get("document");
    assert.ok(file instanceof File);
    assert.equal(file.name, "dossie_empresa-x.md");
    assert.equal(file.type, "text/markdown");
    assert.equal(await file.text(), MARKDOWN);
  });

  it("surfaces Telegram API errors", async () => {
    const failingFetch = async () =>
      new Response(JSON.stringify({ ok: false, description: "chat not found" }), { status: 400 });

    const result = await sendTelegramDocument({
      botToken: "123456:ABC",
      chatId: "555000111",
      document: toMarkdownDocument(MARKDOWN, "dossie_empresa-x.md"),
      fetch: failingFetch as typeof fetch,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });
});
