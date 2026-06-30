const MAPS_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const REQUEST_TIMEOUT_MS = 20000;

function meaningful(value) {
  const text = String(value || "").trim();
  return text && text !== "Not specified" ? text : "";
}

function hotelQuery(data) {
  return [meaningful(data.hotelName), meaningful(data.hotelAddress)]
    .filter(Boolean)
    .join(", ");
}

function fallbackMapUrl(data) {
  const query = hotelQuery(data);
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "";
}

async function groundHotelWithMaps(data) {
  const apiKey = process.env.GEMINI_API_KEY;
  const query = hotelQuery(data);
  if (!apiKey || !query) return null;

  const requestBody = {
    contents: [{
      role: "user",
      parts: [{
        text: `Find the exact Google Maps listing for this hotel: ${query}. Return one short factual confirmation sentence only.`
      }]
    }],
    tools: [{ googleMaps: {} }],
    generationConfig: { temperature: 0 }
  };

  for (const model of MAPS_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        }
      );
      if (!response.ok) continue;
      const payload = await response.json();
      const chunks = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const source = chunks.map((chunk) => chunk.maps).find(Boolean);
      if (source) {
        return {
          placeId: String(source.placeId || "").replace(/^places\//, ""),
          mapUrl: source.uri || fallbackMapUrl(data),
          mapsTitle: source.title || meaningful(data.hotelName)
        };
      }
    } catch {
      // Location enrichment is optional and must not block voucher extraction.
    }
  }
  return null;
}

async function findPlaceWithPlacesApi(data, placeId = "") {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const query = hotelQuery(data);
  if (!apiKey || (!query && !placeId)) return null;

  try {
    let response;
    if (placeId) {
      response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "id,displayName,formattedAddress,googleMapsUri,location,photos"
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } else {
      response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.location,places.photos"
        },
        body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    }

    if (!response.ok) return null;
    const payload = await response.json();
    const place = placeId ? payload : payload?.places?.[0];
    if (!place) return null;

    const photo = place.photos?.[0];
    let photoUrl = "";
    if (photo?.name) {
      const mediaResponse = await fetch(
        `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=900&maxWidthPx=1400&skipHttpRedirect=true&key=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
      );
      if (mediaResponse.ok) {
        const media = await mediaResponse.json();
        photoUrl = media.photoUri || "";
      }
    }

    const authors = photo?.authorAttributions || [];
    const attribution = authors
      .map((author) => author.displayName)
      .filter(Boolean)
      .join(", ");
    const attributionUri = authors[0]?.uri || "";

    return {
      placeId: place.id || placeId,
      mapUrl: place.googleMapsUri || fallbackMapUrl(data),
      mapsTitle: place.displayName?.text || meaningful(data.hotelName),
      latitude: place.location?.latitude ?? "",
      longitude: place.location?.longitude ?? "",
      hotelPhotoUrl: photoUrl,
      photoAttribution: attribution,
      photoAttributionUrl: attributionUri.startsWith("//") ? `https:${attributionUri}` : attributionUri
    };
  } catch {
    return null;
  }
}

async function enrichHotelData(data) {
  const grounded = await groundHotelWithMaps(data);
  const places = await findPlaceWithPlacesApi(data, grounded?.placeId || "");
  const existingMap = meaningful(data.mapUrl);

  return {
    ...data,
    placeId: places?.placeId || grounded?.placeId || meaningful(data.placeId),
    mapUrl: places?.mapUrl || grounded?.mapUrl || existingMap || fallbackMapUrl(data),
    mapsTitle: places?.mapsTitle || grounded?.mapsTitle || meaningful(data.mapsTitle) || meaningful(data.hotelName),
    latitude: String(places?.latitude ?? meaningful(data.latitude)),
    longitude: String(places?.longitude ?? meaningful(data.longitude)),
    hotelPhotoUrl: places?.hotelPhotoUrl || meaningful(data.hotelPhotoUrl),
    photoAttribution: places?.photoAttribution || meaningful(data.photoAttribution),
    photoAttributionUrl: places?.photoAttributionUrl || meaningful(data.photoAttributionUrl)
  };
}

module.exports = {
  enrichHotelData,
  fallbackMapUrl
};
