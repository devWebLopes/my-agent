import assert from "node:assert/strict";
import { it } from "node:test";

import { allowedContacts } from "../../agent/lib/telegram/allowed-contacts.ts";
import { normalizePhone } from "../../agent/lib/telegram/auth.ts";

it("static allowlist registers the owner number +55 51 982548025 (PRD)", () => {
  assert.ok(
    allowedContacts.some((contact) => normalizePhone(contact.phone ?? "") === "5551982548025"),
  );
});
