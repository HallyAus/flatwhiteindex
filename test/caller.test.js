import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunk } from "../caller.js";

describe("chunk", () => {
  it("splits array into chunks of given size", () => {
    const result = chunk([1, 2, 3, 4, 5], 2);
    assert.deepStrictEqual(result, [[1, 2], [3, 4], [5]]);
  });

  it("handles array smaller than chunk size", () => {
    const result = chunk([1, 2], 5);
    assert.deepStrictEqual(result, [[1, 2]]);
  });

  it("handles empty array", () => {
    const result = chunk([], 3);
    assert.deepStrictEqual(result, []);
  });

  it("handles chunk size of 1", () => {
    const result = chunk([1, 2, 3], 1);
    assert.deepStrictEqual(result, [[1], [2], [3]]);
  });
});
