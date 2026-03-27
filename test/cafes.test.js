import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractSuburb, getSydneySearchGrid, getSuburbCenter, normalisePhoneAU } from "../cafes.js";

describe("extractSuburb", () => {
  it("extracts suburb from standard Australian address", () => {
    assert.strictEqual(
      extractSuburb("123 King St, Newtown NSW 2042, Australia"),
      "Newtown"
    );
  });

  it("extracts suburb with multi-word name", () => {
    assert.strictEqual(
      extractSuburb("45 Oxford St, Surry Hills NSW 2010, Australia"),
      "Surry Hills"
    );
  });

  it("returns null for missing address", () => {
    assert.strictEqual(extractSuburb(null), null);
  });

  it("returns null for address without NSW postcode", () => {
    assert.strictEqual(extractSuburb("123 Collins St, Melbourne VIC 3000"), null);
  });
});

describe("getSydneySearchGrid", () => {
  it("generates grid points within bounds", () => {
    const bounds = {
      northeast: { lat: -33.8, lng: 151.3 },
      southwest: { lat: -33.9, lng: 151.1 },
    };
    const grid = getSydneySearchGrid(bounds);
    assert.ok(grid.length > 0);
    grid.forEach(point => {
      assert.ok(point.lat >= bounds.southwest.lat && point.lat <= bounds.northeast.lat);
      assert.ok(point.lng >= bounds.southwest.lng && point.lng <= bounds.northeast.lng);
    });
  });
});

describe("getSuburbCenter", () => {
  it("returns array of coordinates for known suburb", () => {
    const centers = getSuburbCenter("newtown");
    assert.ok(Array.isArray(centers), "should return an array");
    assert.ok(centers.length >= 3, "should have multiple search points");
    assert.ok(centers[0].lat < -33.89 && centers[0].lat > -33.91, "lat should be in Newtown");
  });

  it("falls back to sydney_cbd for unknown suburb", () => {
    const centers = getSuburbCenter("nonexistent");
    assert.ok(Array.isArray(centers));
    assert.ok(centers.length >= 10, "CBD should have many search points");
  });
});

describe("normalisePhoneAU", () => {
  it("converts (02) landline to E.164", () => {
    assert.strictEqual(normalisePhoneAU("(02) 9211 0665"), "+61292110665");
  });

  it("converts 04xx mobile to E.164", () => {
    assert.strictEqual(normalisePhoneAU("0432 445 342"), "+61432445342");
  });

  it("returns null for 1300 numbers", () => {
    assert.strictEqual(normalisePhoneAU("1300 074 178"), null);
  });

  it("returns null for 1800 numbers", () => {
    assert.strictEqual(normalisePhoneAU("1800 123 456"), null);
  });

  it("leaves +61 numbers unchanged", () => {
    assert.strictEqual(normalisePhoneAU("+61292110665"), "+61292110665");
  });

  it("returns null for null input", () => {
    assert.strictEqual(normalisePhoneAU(null), null);
  });
});
