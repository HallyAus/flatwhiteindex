// scripts/seed-mock-data.js
// Generates a static JSON file with mock cafe price data for dashboard development

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUBURBS = [
  { name: "Sydney CBD", lat: -33.8688, lng: 151.2093 },
  { name: "Surry Hills", lat: -33.8872, lng: 151.2108 },
  { name: "Newtown", lat: -33.8967, lng: 151.1796 },
  { name: "Glebe", lat: -33.8800, lng: 151.1876 },
  { name: "Balmain", lat: -33.8600, lng: 151.1764 },
  { name: "Paddington", lat: -33.8840, lng: 151.2280 },
  { name: "Darlinghurst", lat: -33.8769, lng: 151.2173 },
  { name: "Redfern", lat: -33.8944, lng: 151.2047 },
  { name: "Chippendale", lat: -33.8895, lng: 151.1987 },
  { name: "Erskineville", lat: -33.9003, lng: 151.1858 },
  { name: "Bondi", lat: -33.8908, lng: 151.2743 },
  { name: "Manly", lat: -33.7969, lng: 151.2878 },
  { name: "Mosman", lat: -33.8269, lng: 151.2466 },
  { name: "Marrickville", lat: -33.9111, lng: 151.1553 },
  { name: "Leichhardt", lat: -33.8833, lng: 151.1569 },
];

function randomPrice(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 20) / 20;
}

function generateMockData() {
  const cafes = [];
  let id = 1;

  for (const suburb of SUBURBS) {
    const cafeCount = 5 + Math.floor(Math.random() * 15);
    for (let i = 0; i < cafeCount; i++) {
      const priceSmall = randomPrice(3.80, 5.50);
      const priceLarge = priceSmall + randomPrice(0.50, 1.50);
      cafes.push({
        id: `cafe-${id++}`,
        name: `${suburb.name} Cafe ${i + 1}`,
        suburb: suburb.name,
        lat: suburb.lat + (Math.random() - 0.5) * 0.01,
        lng: suburb.lng + (Math.random() - 0.5) * 0.01,
        google_rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
        price_small: priceSmall,
        price_large: priceLarge,
        status: "completed",
      });
    }
  }

  const suburbStats = SUBURBS.map(s => {
    const suburbCafes = cafes.filter(c => c.suburb === s.name);
    const prices = suburbCafes.map(c => c.price_small).filter(Boolean);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    return {
      suburb: s.name,
      lat: s.lat,
      lng: s.lng,
      avg_price: Math.round(avg * 100) / 100,
      sample_size: prices.length,
      min_price: Math.min(...prices),
      max_price: Math.max(...prices),
    };
  }).sort((a, b) => a.avg_price - b.avg_price);

  return {
    generated_at: new Date().toISOString(),
    total_cafes: cafes.length,
    total_suburbs: SUBURBS.length,
    avg_price: Math.round(cafes.reduce((a, c) => a + c.price_small, 0) / cafes.length * 100) / 100,
    suburbs: suburbStats,
    cafes,
  };
}

const data = generateMockData();
const outPath = join(__dirname, "..", "public", "mock-data.json");
writeFileSync(outPath, JSON.stringify(data, null, 2));
console.log(`Generated ${data.total_cafes} mock cafes across ${data.total_suburbs} suburbs`);
console.log(`Average flat white: $${data.avg_price}`);
console.log(`Written to: mock-data.json`);
