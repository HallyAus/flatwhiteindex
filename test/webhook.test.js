import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractPrices } from "../webhook.js";

describe("extractPrices", () => {
  it("extracts dollar sign prices", () => {
    const result = extractPrices("The flat white is $4.50 for small and $5.50 for large");
    assert.strictEqual(result.price_small, 4.50);
    assert.strictEqual(result.price_large, 5.50);
    assert.strictEqual(result.needs_review, false);
  });

  it("extracts word prices — four fifty", () => {
    const result = extractPrices("Yeah it's four fifty for a small");
    assert.strictEqual(result.price_small, 4.50);
    assert.strictEqual(result.needs_review, false);
  });

  it("extracts word prices — five eighty", () => {
    const result = extractPrices("A large is five eighty");
    assert.strictEqual(result.price_large, 5.80);
  });

  it("returns null prices for empty transcript", () => {
    const result = extractPrices("");
    assert.strictEqual(result.price_small, null);
    assert.strictEqual(result.price_large, null);
  });

  it("returns null prices for null transcript", () => {
    const result = extractPrices(null);
    assert.strictEqual(result.price_small, null);
    assert.strictEqual(result.price_large, null);
  });

  it("flags needs_review when no price found in non-empty transcript", () => {
    const result = extractPrices("Yeah we do flat whites, they're pretty good");
    assert.strictEqual(result.needs_review, true);
  });

  it("rejects prices outside $3-$15 range", () => {
    const result = extractPrices("That'll be $0.50 or maybe $200");
    assert.strictEqual(result.price_small, null);
    assert.strictEqual(result.needs_review, true);
  });

  it("assigns single price to small when no size mentioned", () => {
    const result = extractPrices("A flat white is $4.80");
    assert.strictEqual(result.price_small, 4.80);
    assert.strictEqual(result.price_large, null);
  });

  it("assigns single price to large when large mentioned", () => {
    const result = extractPrices("A large flat white is $5.50");
    assert.strictEqual(result.price_small, null);
    assert.strictEqual(result.price_large, 5.50);
  });

  it("handles both sizes mentioned separately", () => {
    const result = extractPrices("Small is $4.00 and a large is $5.00");
    assert.strictEqual(result.price_small, 4.00);
    assert.strictEqual(result.price_large, 5.00);
  });

  it("extractPrices handles transcript with only out-of-range prices", () => {
    const result = extractPrices("It costs $1 for a tiny one and $50 for a huge one");
    assert.strictEqual(result.price_small, null);
    assert.strictEqual(result.price_large, null);
    assert.strictEqual(result.needs_review, true);
  });

  it("extractPrices handles transcript with mixed valid/invalid prices", () => {
    const result = extractPrices("Maybe $2 or actually $4.50 for a small");
    assert.strictEqual(result.price_small, 4.50);
  });
});
