import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("test runner smoke check", () => {
  it("runs", () => {
    assert.strictEqual(1 + 1, 2);
  });
});
