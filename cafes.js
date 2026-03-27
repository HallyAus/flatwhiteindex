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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
