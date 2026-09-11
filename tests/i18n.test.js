import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { messages, translator } from "../src/i18n.js";

describe("translations", () => {
  it("keeps English and Spanish keys aligned", () => {
    assert.deepEqual(Object.keys(messages.es).sort(), Object.keys(messages.en).sort());
  });

  it("interpolates values", () => {
    assert.equal(translator("es")("yearsMonths", { years: 3, months: 2 }), "3a 2m");
  });
});
