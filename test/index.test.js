import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isExcludedChain, filterEligibleCafes } from "../index.js";

describe("isExcludedChain", () => {
  it("excludes Starbucks", () => {
    assert.strictEqual(isExcludedChain("Starbucks Reserve"), true);
  });

  it("excludes McCafe", () => {
    assert.strictEqual(isExcludedChain("McDonald's McCafe"), true);
  });

  it("excludes Gloria Jeans", () => {
    assert.strictEqual(isExcludedChain("Gloria Jean's Coffees"), true);
  });

  it("allows independent cafes", () => {
    assert.strictEqual(isExcludedChain("Single O"), false);
  });

  it("is case insensitive", () => {
    assert.strictEqual(isExcludedChain("STARBUCKS"), true);
  });
});

describe("filterEligibleCafes", () => {
  it("filters out cafes without phone", () => {
    const cafes = [
      { name: "Good Cafe", phone: "0299991234" },
      { name: "No Phone Cafe", phone: null },
    ];
    const result = filterEligibleCafes(cafes);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "Good Cafe");
  });

  it("filters out chain cafes", () => {
    const cafes = [
      { name: "Good Cafe", phone: "0299991234" },
      { name: "Starbucks CBD", phone: "0299995678" },
    ];
    const result = filterEligibleCafes(cafes);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "Good Cafe");
  });
});
