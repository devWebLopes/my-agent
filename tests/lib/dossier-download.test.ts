import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DOSSIER_DOWNLOAD_EVENTS,
  DOSSIER_PATH_PATTERN,
  dossierDocumentFilename,
  dossierDownloadKey,
  extractDossierMarkdownPath,
  markdownToBuffer,
  recordAutoDownload,
  resolveDossierDownload,
  shouldAutoDownload,
  toDossierDocument,
} from "../../agent/lib/dossier/download.ts";

const MARKDOWN = "# Dossiê — Empresa X\n\n- Site: https://empresax.com.br\n- Status: complete\n";

describe("dossier download — extração e nome (RF07/RF08)", () => {
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

  it("builds a standardized dossie-<slug>.md filename", () => {
    assert.equal(
      dossierDocumentFilename("dossiers/empresa-x/runs/2026-09-20_10-00-00_a1b2c3/dossie.md"),
      "dossie-empresa-x.md",
    );
    assert.equal(dossierDocumentFilename("dossiers/padaria-do-ze/latest/dossie.md"), "dossie-padaria-do-ze.md");
    assert.equal(dossierDocumentFilename("dossiers//vazio/dossie.md"), "dossie-vazio.md");
  });

  it("packs markdown into a .md document preserving the format", () => {
    const doc = toDossierDocument(MARKDOWN, "dossie-empresa-x.md");
    assert.ok(Buffer.isBuffer(doc.buffer));
    assert.equal(doc.buffer.toString("utf8"), MARKDOWN);
    assert.equal(doc.mimeType, "text/markdown");
    assert.equal(doc.filename, "dossie-empresa-x.md");
  });

  it("buffers markdown as utf-8", () => {
    assert.equal(markdownToBuffer(MARKDOWN).toString("utf8"), MARKDOWN);
    assert.ok(DOSSIER_PATH_PATTERN.test("dossiers/foo/latest/dossie.md"));
  });
});

describe("dossier download — idempotência (RF05)", () => {
  const key = dossierDownloadKey("dossiers/empresa-x/runs/run-1/dossie.md");

  it("derives a stable key per generation (normalized path)", () => {
    assert.equal(key, "dossiers/empresa-x/runs/run-1/dossie.md");
    assert.equal(
      dossierDownloadKey("dossiers\\empresa-x\\runs\\run-1\\dossie.md"),
      "dossiers/empresa-x/runs/run-1/dossie.md",
    );
  });

  it("fires once and then skips for the same generation", () => {
    const sent: ReadonlySet<string> = new Set();
    assert.equal(shouldAutoDownload(sent, key), true);

    const after = recordAutoDownload(sent, key);
    assert.equal(shouldAutoDownload(after, key), false);
    assert.equal(shouldAutoDownload(after, "dossiers/outra/runs/run-2/dossie.md"), true);
  });

  it("recordAutoDownload does not mutate the previous set", () => {
    const sent: ReadonlySet<string> = new Set();
    const after = recordAutoDownload(sent, key);
    assert.equal(sent.has(key), false);
    assert.equal(after.has(key), true);
  });
});

describe("dossier download — resolução e eventos (RNF04)", () => {
  it("resolves path, filename and key from a report", () => {
    const resolved = resolveDossierDownload(
      "Concluído.\n- dossiers/empresa-x/latest/dossie.md\n",
    );
    assert.deepEqual(resolved, {
      path: "dossiers/empresa-x/latest/dossie.md",
      filename: "dossie-empresa-x.md",
      key: "dossiers/empresa-x/latest/dossie.md",
    });
    assert.equal(resolveDossierDownload("Sem dossiê."), null);
  });

  it("exposes canonical event names", () => {
    assert.equal(DOSSIER_DOWNLOAD_EVENTS.succeeded, "dossier_auto_download_succeeded");
    assert.equal(DOSSIER_DOWNLOAD_EVENTS.failed, "dossier_auto_download_failed");
  });
});
