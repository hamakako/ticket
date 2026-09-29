const crypto = require("crypto");

const IGNAV_BASE_URL = "https://ignav.com/api";
const SEARCH_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 60000;
const AIRPORT_LOOKUP_LIMIT = 20;
const MAX_CITY_AIRPORTS = 8;
const searchCache = new Map();

const cityAirportGroups = [
  { city: "Istanbul", country: "TR", code: "IST", codes: ["IST", "SAW"] },
  { city: "London", country: "GB", code: "LON", codes: ["LON"] },
  { city: "Paris", country: "FR", code: "PAR", codes: ["PAR"] },
  { city: "New York", country: "US", code: "NYC", codes: ["NYC"] },
  { city: "Tokyo", country: "JP", code: "TYO", codes: ["TYO"] },
  { city: "Milan", country: "IT", code: "MIL", codes: ["MIL"] },
  { city: "Rome", country: "IT", code: "ROM", codes: ["ROM"] },
  { city: "Moscow", country: "RU", code: "MOW", codes: ["MOW"] },
  { city: "Seoul", country: "KR", code: "SEL", codes: ["SEL"] },
  { city: "Chicago", country: "US", code: "CHI", codes: ["CHI"] },
  { city: "Washington", country: "US", code: "WAS", codes: ["WAS"] },
  { city: "Toronto", country: "CA", code: "YTO", codes: ["YTO"] },
  { city: "Montreal", country: "CA", code: "YMQ", codes: ["YMQ"] },
  { city: "Sao Paulo", country: "BR", code: "SAO", codes: ["SAO"] },
  { city: "Rio de Janeiro", country: "BR", code: "RIO", codes: ["RIO"] },
  { city: "Buenos Aires", country: "AR", code: "BUE", codes: ["BUE"] },
  { city: "Osaka", country: "JP", code: "OSA", codes: ["OSA"] }
];

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
  const carrierCode = cleanString(segment.marketing_carrier_code, 3).toUpperCase();
  return {
    carrierCode,
    flightNumber: cleanString(segment.flight_number, 12),
    airline: cleanString(segment.operating_carrier_name, 100),
    logoUrl: /^[A-Z0-9]{2,3}$/.test(carrierCode) ? `/api/airline-logo/${carrierCode}` : "",
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
  const payload = await ignavRequest(`/airports?q=${encodeURIComponent(q)}&limit=${AIRPORT_LOOKUP_LIMIT}`);
  const airports = Array.isArray(payload) ? payload : payload.airports || [];
  const normalizedQuery = q.toLowerCase();
  const curatedGroups = cityAirportGroups
    .filter((group) => group.city.toLowerCase().includes(normalizedQuery) || group.code.toLowerCase().startsWith(normalizedQuery))
    .map((group) => ({
      code: group.code,
      codes: group.codes,
      name: `All ${group.city} airports`,
      city: group.city,
      country: group.country,
      type: "city"
    }));
  const seenCodes = new Set();
  const airportResults = airports.map((airport) => ({
    code: cleanString(airport.code, 3).toUpperCase(),
    name: cleanString(airport.name, 120),
    city: cleanString(airport.city, 80),
    country: cleanString(airport.country, 3).toUpperCase(),
    metroCode: cleanString(
      airport.metro_code || airport.metroCode || airport.city_code || airport.cityCode,
      3
    ).toUpperCase(),
    type: "airport"
  })).filter((airport) => {
    if (!/^[A-Z]{3}$/.test(airport.code) || seenCodes.has(airport.code)) return false;
    seenCodes.add(airport.code);
    airport.codes = [airport.code];
    return true;
  });

  const curatedCities = new Set(curatedGroups.map((group) => `${group.city.toLowerCase()}|${group.country}`));
  const airportsByCity = new Map();
  for (const airport of airportResults) {
    if (!airport.city) continue;
    const key = `${airport.city.toLowerCase()}|${airport.country}`;
    if (!airportsByCity.has(key)) airportsByCity.set(key, []);
    airportsByCity.get(key).push(airport);
  }

  const dynamicGroups = [...airportsByCity.entries()].flatMap(([key, cityAirports]) => {
    if (curatedCities.has(key) || cityAirports.length < 2) return [];
    const metroCode = cityAirports.map((airport) => airport.metroCode).find((code) => /^[A-Z]{3}$/.test(code));
    const codes = metroCode
      ? [metroCode]
      : cityAirports.map((airport) => airport.code).slice(0, MAX_CITY_AIRPORTS);
    const first = cityAirports[0];
    return [{
      code: metroCode || first.code,
      codes,
      name: `All ${first.city} airports`,
      city: first.city,
      country: first.country,
      type: "city",
      airportCount: cityAirports.length
    }];
  });

  const results = [...curatedGroups, ...dynamicGroups, ...airportResults]
    .map(({ metroCode, ...airport }) => airport);
  return results.slice(0, AIRPORT_LOOKUP_LIMIT + curatedGroups.length + dynamicGroups.length);
}

function selectedAirportCodes(value, fallback) {
  const source = Array.isArray(value) && value.length ? value : [fallback];
  const codes = [...new Set(source.map((code) => airportCode(code)))].slice(0, MAX_CITY_AIRPORTS);
  if (!codes.length) throw new Error("Choose a departure and arrival airport or city.");
  return codes;
}

function passengerCount(value, fallback = 0) {
  const count = Number.parseInt(value, 10);
  return Number.isInteger(count) ? Math.max(0, Math.min(9, count)) : fallback;
}

function itineraryKey(itinerary = {}) {
  return [itinerary.outbound, itinerary.inbound]
    .filter(Boolean)
    .flatMap((leg) => Array.isArray(leg.segments) ? leg.segments : [])
    .map((segment) => [
      segment.marketing_carrier_code,
      segment.flight_number,
      segment.departure_airport,
      segment.departure_time_local,
      segment.arrival_airport,
      segment.arrival_time_local
    ].join("|"))
    .join("::");
}

async function searchFlights(input = {}) {
  const tripType = input.tripType === "round-trip" ? "round-trip" : "one-way";
  const origin = airportCode(input.origin);
  const destination = airportCode(input.destination);
  const originCodes = selectedAirportCodes(input.originAirports, origin);
  const destinationCodes = selectedAirportCodes(input.destinationAirports, destination);
  if (originCodes.some((code) => destinationCodes.includes(code))) {
    throw new Error("Origin and destination must be different.");
  }

  const departureDate = validDate(input.departureDate, "Departure date");
  const returnDate = tripType === "round-trip" ? validDate(input.returnDate, "Return date") : "";
  if (returnDate && returnDate < departureDate) {
    throw new Error("Return date cannot be before departure date.");
  }

  const adults = Math.max(1, Math.min(9, Number.parseInt(input.adults, 10) || 1));
  const children = passengerCount(input.children);
  const infantsOnLap = passengerCount(input.infantsOnLap);
  if (adults + children + infantsOnLap > 9) {
    throw new Error("The total number of adults, children, and infants cannot exceed 9.");
  }
  if (infantsOnLap > adults) {
    throw new Error("The number of lap infants cannot exceed the number of adults.");
  }
  const cabinClasses = new Set(["economy", "premium_economy", "business", "first"]);
  const cabinClass = cabinClasses.has(input.cabinClass) ? input.cabinClass : "economy";
  const maxStops = [0, 1, 2].includes(Number(input.maxStops)) ? Number(input.maxStops) : null;
  const requestBody = {
    departure_date: departureDate,
    adults,
    children,
    infants_on_lap: infantsOnLap,
    cabin_class: cabinClass,
    allow_self_transfer: false,
    ...(returnDate ? { return_date: returnDate } : {}),
    ...(maxStops !== null ? { max_stops: maxStops } : {})
  };

  const searches = originCodes.flatMap((originCode) => destinationCodes.map((destinationCode) => ({ originCode, destinationCode })));
  const responses = await Promise.allSettled(searches.map(({ originCode, destinationCode }) => (
    ignavRequest(`/fares/${tripType}`, {
      method: "POST",
      body: JSON.stringify({ ...requestBody, origin: originCode, destination: destinationCode })
    })
  )));
  const firstFailure = responses.find((response) => response.status === "rejected");
  const merged = responses
    .filter((response) => response.status === "fulfilled")
    .flatMap((response) => Array.isArray(response.value.itineraries) ? response.value.itineraries : []);
  if (!merged.length && firstFailure) throw firstFailure.reason;
  const seen = new Set();
  const rawItineraries = merged.filter((itinerary) => {
    const key = itineraryKey(itinerary);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
  const itineraries = rawItineraries.map(sanitizeItinerary).filter((item) => item.outbound?.segments?.length);
  const searchId = crypto.randomUUID();

  purgeSearchCache();
  searchCache.set(searchId, {
    expiresAt: Date.now() + SEARCH_TTL_MS,
    tripType,
    origin,
    destination,
    originCodes,
    destinationCodes,
    departureDate,
    returnDate,
    passengers: { adults, children, infants: infantsOnLap },
    rawItineraries,
    itineraries
  });

  return {
    searchId,
    tripType,
    origin,
    destination,
    originCodes,
    destinationCodes,
    departureDate,
    returnDate,
    passengers: { adults, children, infants: infantsOnLap },
    itineraries
  };
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
