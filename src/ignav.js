const crypto = require("crypto");

const IGNAV_BASE_URL = "https://ignav.com/api";
const SEARCH_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 60000;
const searchCache = new Map();

function assertApiKey() {
  if (!process.env.IGNAV_API_KEY || process.env.IGNAV_API_KEY === "your_ignav_api_key_here") {
    throw new Error("IGNAV_API_KEY is missing. Add it on the server side.");
  }
}

function cleanString(value, maxLength = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function airportCode(value) {
  const code = cleanString(value, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error("Origin and destination must be valid 3-letter airport or metro codes.");
  }
  return code;
}

function validDate(value, label) {
  const date = cleanString(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error(`${label} must be a valid date.`);
  }
  return date;
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

async function ignavRequest(pathname, options = {}, retry = true) {
  assertApiKey();
  let response;
  try {
    response = await fetch(`${IGNAV_BASE_URL}${pathname}`, {
      ...options,
      headers: {
        "X-Api-Key": process.env.IGNAV_API_KEY,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    if (retry) return ignavRequest(pathname, options, false);
    throw new Error(`Live flight service could not be reached: ${error.message}`);
  }

  const payload = await response.json().catch(() => ({}));
  if (response.status === 424 && retry) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return ignavRequest(pathname, options, false);
  }
  if (!response.ok) {
    const detail = payload?.message || payload?.error?.message || payload?.detail || `HTTP ${response.status}`;
    throw new Error(`Live flight search failed: ${cleanString(detail, 240)}`);
  }
  return payload;
}

function sanitizeSegment(segment = {}) {
  return {
    carrierCode: cleanString(segment.marketing_carrier_code, 3),
    flightNumber: cleanString(segment.flight_number, 12),
    airline: cleanString(segment.operating_carrier_name, 100),
    departureAirport: cleanString(segment.departure_airport, 3),
    departureTime: cleanString(segment.departure_time_local, 30),
    arrivalAirport: cleanString(segment.arrival_airport, 3),
    arrivalTime: cleanString(segment.arrival_time_local, 30),
    durationMinutes: Number.isFinite(Number(segment.duration_minutes)) ? Number(segment.duration_minutes) : null,
    aircraft: cleanString(segment.aircraft, 100)
  };
}

function sanitizeLeg(leg) {
  if (!leg || !Array.isArray(leg.segments)) return null;
  return {
    carrier: cleanString(leg.carrier, 100),
    durationMinutes: Number.isFinite(Number(leg.duration_minutes)) ? Number(leg.duration_minutes) : null,
    segments: leg.segments.map(sanitizeSegment).filter((segment) => segment.departureAirport && segment.arrivalAirport)
  };
}

function sanitizeItinerary(itinerary, index) {
  return {
    resultIndex: index,
    cabinClass: cleanString(itinerary.cabin_class, 40) || "economy",
    requiresSelfTransfer: Boolean(itinerary.requires_self_transfer),
    outbound: sanitizeLeg(itinerary.outbound),
    inbound: sanitizeLeg(itinerary.inbound)
  };
}

function purgeSearchCache() {
  const now = Date.now();
  for (const [id, entry] of searchCache.entries()) {
    if (entry.expiresAt <= now) searchCache.delete(id);
  }
}

async function searchAirports(query) {
  const q = cleanString(query, 80);
  if (q.length < 2) return [];
  const payload = await ignavRequest(`/airports?q=${encodeURIComponent(q)}&limit=6`);
  const airports = Array.isArray(payload) ? payload : payload.airports || [];
  return airports.slice(0, 6).map((airport) => ({
    code: cleanString(airport.code, 3),
    name: cleanString(airport.name, 120),
    city: cleanString(airport.city, 80),
    country: cleanString(airport.country, 3)
  })).filter((airport) => /^[A-Z]{3}$/.test(airport.code));
}

async function searchFlights(input = {}) {
  const tripType = input.tripType === "round-trip" ? "round-trip" : "one-way";
  const origin = airportCode(input.origin);
  const destination = airportCode(input.destination);
  if (origin === destination) throw new Error("Origin and destination must be different.");

  const departureDate = validDate(input.departureDate, "Departure date");
  const returnDate = tripType === "round-trip" ? validDate(input.returnDate, "Return date") : "";
  if (returnDate && returnDate < departureDate) {
    throw new Error("Return date cannot be before departure date.");
  }

  const adults = Math.max(1, Math.min(9, Number.parseInt(input.adults, 10) || 1));
  const cabinClasses = new Set(["economy", "premium_economy", "business", "first"]);
  const cabinClass = cabinClasses.has(input.cabinClass) ? input.cabinClass : "economy";
  const maxStops = [0, 1, 2].includes(Number(input.maxStops)) ? Number(input.maxStops) : null;
  const requestBody = {
    origin,
    destination,
    departure_date: departureDate,
    adults,
    cabin_class: cabinClass,
    allow_self_transfer: false,
    ...(returnDate ? { return_date: returnDate } : {}),
    ...(maxStops !== null ? { max_stops: maxStops } : {})
  };

  const payload = await ignavRequest(`/fares/${tripType}`, {
    method: "POST",
    body: JSON.stringify(requestBody)
  });
  const rawItineraries = Array.isArray(payload.itineraries) ? payload.itineraries.slice(0, 20) : [];
  const itineraries = rawItineraries.map(sanitizeItinerary).filter((item) => item.outbound?.segments?.length);
  const searchId = crypto.randomUUID();

  purgeSearchCache();
  searchCache.set(searchId, {
    expiresAt: Date.now() + SEARCH_TTL_MS,
    tripType,
    origin,
    destination,
    departureDate,
    returnDate,
    rawItineraries,
    itineraries
  });

  return { searchId, tripType, origin, destination, departureDate, returnDate, itineraries };
}

function getSelection(searchId, resultIndex) {
  purgeSearchCache();
  const entry = searchCache.get(cleanString(searchId, 80));
  const index = Number.parseInt(resultIndex, 10);
  if (!entry || !Number.isInteger(index) || index < 0 || index >= entry.rawItineraries.length) {
    throw new Error("This flight search has expired. Please search again.");
  }
  const itinerary = entry.itineraries.find((item) => item.resultIndex === index);
  if (!itinerary) throw new Error("The selected flight is no longer available in this search.");
  return { entry, itinerary, raw: entry.rawItineraries[index] };
}

async function bookingLinks(searchId, resultIndex) {
  const selection = getSelection(searchId, resultIndex);
  const ignavId = cleanString(selection.raw.ignav_id, 120);
  if (!ignavId) return [];
  const payload = await ignavRequest("/fares/booking-links", {
    method: "POST",
    body: JSON.stringify({ ignav_id: ignavId })
  });
  const options = Array.isArray(payload.booking_options) ? payload.booking_options : [];
  return options.flatMap((option) => (Array.isArray(option.links) ? option.links : []))
    .map((link) => ({
      providerName: cleanString(link.provider_name, 100) || "Booking provider",
      providerType: cleanString(link.provider_type, 40),
      fareName: cleanString(link.fare_name, 80),
      url: safeUrl(link.url)
    }))
    .filter((link) => link.url)
    .slice(0, 8);
}

module.exports = {
  bookingLinks,
  getSelection,
  searchAirports,
  searchFlights
};
