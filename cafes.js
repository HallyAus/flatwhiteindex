const PLACES_API = "https://maps.googleapis.com/maps/api/place";

export async function fetchSydneyCafes(bounds, suburbFilter = null) {
  const cafes = [];
  const seen = new Set();

  const searchLocations = suburbFilter
    ? [getSuburbCenter(suburbFilter)]
    : getSydneySearchGrid(bounds);

  for (const location of searchLocations) {
    let pageToken = null;

    do {
      const url = pageToken
        ? `${PLACES_API}/nearbysearch/json?pagetoken=${pageToken}&key=${process.env.GOOGLE_PLACES_API_KEY}`
        : `${PLACES_API}/nearbysearch/json?location=${location.lat},${location.lng}&radius=2000&type=cafe&key=${process.env.GOOGLE_PLACES_API_KEY}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.status === "INVALID_REQUEST" || data.status === "REQUEST_DENIED") {
        throw new Error(`Places API error: ${data.status} — ${data.error_message}`);
      }

      for (const place of data.results || []) {
        if (seen.has(place.place_id)) continue;
        seen.add(place.place_id);

        const detail = await fetchPlaceDetail(place.place_id);
        if (!detail) continue;

        cafes.push({
          google_place_id: place.place_id,
          name: place.name,
          address: detail.formatted_address,
          suburb: extractSuburb(detail.formatted_address),
          phone: detail.formatted_phone_number?.replace(/\s/g, "") || null,
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          google_rating: place.rating || null,
        });
      }

      pageToken = data.next_page_token || null;
      if (pageToken) await sleep(2000);
    } while (pageToken);

    await sleep(200);
  }

  return cafes;
}

async function fetchPlaceDetail(placeId) {
  const url = `${PLACES_API}/details/json?place_id=${placeId}&fields=formatted_address,formatted_phone_number&key=${process.env.GOOGLE_PLACES_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.result || null;
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
