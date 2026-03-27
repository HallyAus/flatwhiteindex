import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractSuburb, getSydneySearchGrid, getSuburbCenter } from "../cafes.js";

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
    assert.ok(centers.length > 0, "should have at least one point");
    assert.strictEqual(centers[0].lat, -33.8967);
    assert.strictEqual(centers[0].lng, 151.1796);
  });

  it("falls back to sydney_cbd for unknown suburb", () => {
    const centers = getSuburbCenter("nonexistent");
    assert.ok(Array.isArray(centers));
    assert.strictEqual(centers[0].lat, -33.8688);
    assert.strictEqual(centers[0].lng, 151.2093);
  });
});
