// Google Places API (New) — https://developers.google.com/maps/documentation/places/web-service/nearby-search
const PLACES_API = "https://places.googleapis.com/v1/places";

export async function fetchSydneyCafes(bounds, suburbFilter = null) {
  const cafes = [];
  const seen = new Set();

  const searchLocations = suburbFilter
    ? [getSuburbCenter(suburbFilter)]
    : getSydneySearchGrid(bounds);

  for (const location of searchLocations) {
    let pageToken = null;

    do {
      const body = {
        includedTypes: ["cafe"],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: location.lat, longitude: location.lng },
            radius: 2000.0,
          },
        },
      };

      if (pageToken) {
        body.pageToken = pageToken;
      }

      const res = await fetch(`${PLACES_API}:searchNearby`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.location,places.rating,nextPageToken",
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

        const phone = place.nationalPhoneNumber?.replace(/\s/g, "") || null;

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

      pageToken = data.nextPageToken || null;
      if (pageToken) await sleep(2000);
    } while (pageToken);

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
  const centers = {
    sydney_cbd: { lat: -33.8688, lng: 151.2093 },
    surry_hills: { lat: -33.8872, lng: 151.2108 },
    newtown: { lat: -33.8967, lng: 151.1796 },
    glebe: { lat: -33.8800, lng: 151.1876 },
    balmain: { lat: -33.8600, lng: 151.1764 },
    paddington: { lat: -33.8840, lng: 151.2280 },
    darlinghurst: { lat: -33.8769, lng: 151.2173 },
    redfern: { lat: -33.8944, lng: 151.2047 },
    chippendale: { lat: -33.8895, lng: 151.1987 },
    erskineville: { lat: -33.9003, lng: 151.1858 },
  };

  return centers[suburb] || centers.sydney_cbd;
}

export { extractSuburb, getSydneySearchGrid, getSuburbCenter };

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
