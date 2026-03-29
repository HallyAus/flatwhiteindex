import { sleep } from "./utils.js";

// Google Places API (New) — https://developers.google.com/maps/documentation/places/web-service/nearby-search
const PLACES_API = "https://places.googleapis.com/v1/places";

export async function fetchSydneyCafes(bounds, suburbFilter = null) {
  const cafes = [];
  const seen = new Set();

  const searchLocations = suburbFilter
    ? getSuburbCenter(suburbFilter)
    : getSydneySearchGrid(bounds);

  for (const location of searchLocations) {
    const body = {
      includedTypes: ["cafe"],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: location.lat, longitude: location.lng },
          radius: location.radius || 1000.0,
        },
      },
    };

    const res = await fetch(`${PLACES_API}:searchNearby`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.location,places.rating",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (data.error) {
      throw new Error(`Places API error: ${data.error.status} — ${data.error.message}`);
    }

    for (const place of data.places || []) {
      if (seen.has(place.id)) continue;
      seen.add(place.id);

      const phone = normalisePhoneAU(place.nationalPhoneNumber);

      cafes.push({
        google_place_id: place.id,
        name: place.displayName?.text || "Unknown",
        address: place.formattedAddress || null,
        suburb: extractSuburb(place.formattedAddress),
        phone,
        lat: place.location?.latitude || null,
        lng: place.location?.longitude || null,
        google_rating: place.rating || null,
      });
    }

    await sleep(200);
  }

  return cafes;
}

function extractSuburb(address) {
  if (!address) return null;
  const parts = address.split(",");
  for (const part of parts) {
    const cleaned = part.trim();
    if (/NSW\s+\d{4}/.test(cleaned)) {
      const suburbMatch = cleaned.match(/^(.+?)\s+NSW/);
      return suburbMatch ? suburbMatch[1].trim() : null;
    }
  }
  return null;
}

function getSydneySearchGrid(bounds) {
  const locations = [];
  const latStep = 0.018;
  const lngStep = 0.025;

  for (let lat = bounds.southwest.lat; lat <= bounds.northeast.lat; lat += latStep) {
    for (let lng = bounds.southwest.lng; lng <= bounds.northeast.lng; lng += lngStep) {
      locations.push({ lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 });
    }
  }

  return locations;
}

function getSuburbCenter(suburb) {
  // Multiple search points per suburb for better coverage (20 results per point)
  const centers = {
    // CBD: dense grid with 800m radius — covers Circular Quay to Town Hall
    sydney_cbd: [
      { lat: -33.8610, lng: 151.2090 },  // Circular Quay
      { lat: -33.8640, lng: 151.2050 },  // Wynyard
      { lat: -33.8640, lng: 151.2130 },  // Bridge St east
      { lat: -33.8670, lng: 151.2090 },  // Martin Place
      { lat: -33.8670, lng: 151.2020 },  // Barangaroo
      { lat: -33.8700, lng: 151.2060 },  // Town Hall west
      { lat: -33.8700, lng: 151.2120 },  // Town Hall east / Hyde Park
      { lat: -33.8730, lng: 151.2050 },  // Darling Harbour north
      { lat: -33.8730, lng: 151.2130 },  // Museum / Liverpool St
      { lat: -33.8760, lng: 151.2090 },  // Central south
      { lat: -33.8680, lng: 151.2170 },  // The Domain
      { lat: -33.8590, lng: 151.2100 },  // The Rocks
    ],
    surry_hills: [
      { lat: -33.8840, lng: 151.2108 },
      { lat: -33.8870, lng: 151.2140 },
      { lat: -33.8900, lng: 151.2080 },
      { lat: -33.8860, lng: 151.2060 },
      { lat: -33.8900, lng: 151.2130 },
    ],
    newtown: [
      { lat: -33.8940, lng: 151.1790 },
      { lat: -33.8970, lng: 151.1770 },
      { lat: -33.9000, lng: 151.1800 },
      { lat: -33.9030, lng: 151.1820 },
    ],
    glebe: [
      { lat: -33.8790, lng: 151.1876 },
      { lat: -33.8770, lng: 151.1840 },
      { lat: -33.8810, lng: 151.1910 },
    ],
    balmain: [
      { lat: -33.8580, lng: 151.1764 },
      { lat: -33.8560, lng: 151.1730 },
      { lat: -33.8610, lng: 151.1800 },
    ],
    paddington: [
      { lat: -33.8840, lng: 151.2270 },
      { lat: -33.8810, lng: 151.2310 },
      { lat: -33.8870, lng: 151.2240 },
    ],
    darlinghurst: [
      { lat: -33.8769, lng: 151.2173 },
      { lat: -33.8800, lng: 151.2200 },
      { lat: -33.8760, lng: 151.2220 },
    ],
    redfern: [
      { lat: -33.8944, lng: 151.2047 },
      { lat: -33.8910, lng: 151.2020 },
      { lat: -33.8970, lng: 151.2070 },
    ],
    chippendale: [
      { lat: -33.8895, lng: 151.1987 },
      { lat: -33.8880, lng: 151.1960 },
    ],
    erskineville: [
      { lat: -33.9003, lng: 151.1858 },
      { lat: -33.9030, lng: 151.1880 },
    ],
    mosman: [
      { lat: -33.8290, lng: 151.2440 },
      { lat: -33.8260, lng: 151.2400 },
      { lat: -33.8320, lng: 151.2470 },
    ],
    bondi: [
      { lat: -33.8908, lng: 151.2743 },
      { lat: -33.8880, lng: 151.2710 },
      { lat: -33.8940, lng: 151.2770 },
    ],
    bondi_junction: [
      { lat: -33.8921, lng: 151.2500 },
      { lat: -33.8890, lng: 151.2470 },
      { lat: -33.8950, lng: 151.2530 },
    ],
    manly: [
      { lat: -33.7970, lng: 151.2870 },
      { lat: -33.7940, lng: 151.2840 },
      { lat: -33.8000, lng: 151.2900 },
    ],
    crows_nest: [
      { lat: -33.8270, lng: 151.2049 },
      { lat: -33.8240, lng: 151.2020 },
      { lat: -33.8300, lng: 151.2080 },
    ],
    neutral_bay: [
      { lat: -33.8342, lng: 151.2168 },
      { lat: -33.8310, lng: 151.2140 },
    ],
    marrickville: [
      { lat: -33.9104, lng: 151.1558 },
      { lat: -33.9070, lng: 151.1530 },
      { lat: -33.9130, lng: 151.1590 },
    ],
    leichhardt: [
      { lat: -33.8831, lng: 151.1568 },
      { lat: -33.8800, lng: 151.1540 },
      { lat: -33.8860, lng: 151.1600 },
    ],
    // North Shore
    kirribilli: [
      { lat: -33.8493, lng: 151.2149 },
      { lat: -33.8470, lng: 151.2120 },
    ],
    north_sydney: [
      { lat: -33.8390, lng: 151.2070 },
      { lat: -33.8360, lng: 151.2040 },
      { lat: -33.8420, lng: 151.2100 },
    ],
    chatswood: [
      { lat: -33.7960, lng: 151.1830 },
      { lat: -33.7930, lng: 151.1800 },
      { lat: -33.7990, lng: 151.1860 },
    ],
    lane_cove: [
      { lat: -33.8150, lng: 151.1670 },
      { lat: -33.8120, lng: 151.1640 },
    ],
    // Eastern Suburbs
    double_bay: [
      { lat: -33.8766, lng: 151.2428 },
      { lat: -33.8740, lng: 151.2400 },
    ],
    woollahra: [
      { lat: -33.8860, lng: 151.2390 },
      { lat: -33.8830, lng: 151.2360 },
    ],
    rose_bay: [
      { lat: -33.8700, lng: 151.2670 },
      { lat: -33.8730, lng: 151.2640 },
    ],
    bronte: [
      { lat: -33.9030, lng: 151.2640 },
      { lat: -33.9000, lng: 151.2610 },
    ],
    coogee: [
      { lat: -33.9200, lng: 151.2560 },
      { lat: -33.9170, lng: 151.2530 },
    ],
    randwick: [
      { lat: -33.9140, lng: 151.2410 },
      { lat: -33.9110, lng: 151.2380 },
    ],
    // Inner West
    annandale: [
      { lat: -33.8830, lng: 151.1710 },
      { lat: -33.8800, lng: 151.1680 },
    ],
    rozelle: [
      { lat: -33.8620, lng: 151.1710 },
      { lat: -33.8590, lng: 151.1680 },
    ],
    enmore: [
      { lat: -33.8990, lng: 151.1740 },
      { lat: -33.9020, lng: 151.1760 },
    ],
    stanmore: [
      { lat: -33.8950, lng: 151.1670 },
      { lat: -33.8920, lng: 151.1640 },
    ],
    dulwich_hill: [
      { lat: -33.9040, lng: 151.1400 },
      { lat: -33.9010, lng: 151.1370 },
    ],
    ashfield: [
      { lat: -33.8886, lng: 151.1243 },
      { lat: -33.8860, lng: 151.1210 },
    ],
    strathfield: [
      { lat: -33.8726, lng: 151.0931 },
      { lat: -33.8700, lng: 151.0900 },
    ],
    // South
    alexandria: [
      { lat: -33.9070, lng: 151.1950 },
      { lat: -33.9040, lng: 151.1920 },
    ],
    waterloo: [
      { lat: -33.9010, lng: 151.2070 },
      { lat: -33.8980, lng: 151.2040 },
    ],
    zetland: [
      { lat: -33.9060, lng: 151.2110 },
      { lat: -33.9030, lng: 151.2080 },
    ],
    // CBD surrounds
    pyrmont: [
      { lat: -33.8706, lng: 151.1946 },
      { lat: -33.8680, lng: 151.1920 },
    ],
    ultimo: [
      { lat: -33.8790, lng: 151.1990 },
      { lat: -33.8810, lng: 151.1960 },
    ],
    haymarket: [
      { lat: -33.8810, lng: 151.2050 },
      { lat: -33.8790, lng: 151.2020 },
    ],
    // Northern Beaches
    dee_why: [
      { lat: -33.7510, lng: 151.2870 },
      { lat: -33.7540, lng: 151.2900 },
    ],
    brookvale: [
      { lat: -33.7680, lng: 151.2720 },
      { lat: -33.7650, lng: 151.2690 },
    ],
    avalon: [
      { lat: -33.6290, lng: 151.3290 },
      { lat: -33.6320, lng: 151.3320 },
    ],
    // Greater West
    parramatta: [
      { lat: -33.8150, lng: 151.0010 },
      { lat: -33.8120, lng: 150.9980 },
      { lat: -33.8180, lng: 151.0040 },
    ],
    newcastle: [
      { lat: -32.9270, lng: 151.7760 },
      { lat: -32.9240, lng: 151.7730 },
      { lat: -32.9300, lng: 151.7790 },
    ],
  };

  return centers[suburb] || centers.sydney_cbd;
}

// Convert Australian local numbers to E.164 format for Twilio
// (02) 9211 0665 → +61292110665 | 0432 445 342 → +61432445342
// Returns null for 1300/1800 numbers (not dialable via Twilio, usually chains)
function normalisePhoneAU(raw) {
  if (!raw) return null;
  let phone = raw.replace(/[\s()\-]/g, "");
  if (/^1[38]00/.test(phone)) return null; // skip 1300/1800 numbers
  if (phone.startsWith("+")) return phone;
  if (phone.startsWith("0")) return "+61" + phone.slice(1);
  return "+61" + phone;
}

export { extractSuburb, getSydneySearchGrid, getSuburbCenter, normalisePhoneAU };
