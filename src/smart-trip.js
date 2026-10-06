const { findReturnStartIndex } = require("./flight-journeys");
const { parseDate } = require("./flight-timings");

const NOT_SPECIFIED = "Not specified";

function meaningful(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text && text !== NOT_SPECIFIED ? text : "";
}

function limitedText(value, maxLength = 200) {
  return meaningful(value).slice(0, maxLength);
}

function passengerFirstNameEnglish(value, passengerName = "") {
  const requested = String(value || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (requested && !/^[\p{Script=Latin}\p{M}' -]+$/u.test(requested)) {
    throw new Error("Please enter the passenger first name using English letters.");
  }
  if (requested) return requested;

  const titles = /^(mr|mrs|ms|miss|dr)\.?$/i;
  const firstName = String(passengerName || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .find((part) => !titles.test(part) && /^[\p{Script=Latin}\p{M}'-]+$/u.test(part));
  return firstName || "Traveler";
}

function hasExplicitYear(value) {
  return /\b\d{4}\b/.test(String(value || ""));
}

function datePartsTimestamp(date) {
  return Date.UTC(date.year, date.month - 1, date.day, 23, 59, 59);
}

function parseSmartTripDate(value, referenceTimestamp = Date.now()) {
  const text = meaningful(value);
  if (!text) return null;
  if (hasExplicitYear(text)) return parseDate(text);

  const reference = new Date(Number.isFinite(referenceTimestamp) ? referenceTimestamp : Date.now());
  const referenceDay = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate());
  let year = reference.getUTCFullYear();
  let date = null;

  const numeric = text.match(/^(\d{1,2})[./-](\d{1,2})$/);
  if (numeric) {
    date = { year, month: Number(numeric[2]), day: Number(numeric[1]) };
  } else {
    const withoutWeekday = text.replace(/^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+/i, "");
    const parsed = new Date(`${withoutWeekday} ${year} 00:00:00 UTC`);
    if (!Number.isNaN(parsed.getTime())) {
      date = { year, month: parsed.getUTCMonth() + 1, day: parsed.getUTCDate() };
    }
  }

  if (!date || !parseDate(`${date.year}-${date.month}-${date.day}`)) return null;
  if (Date.UTC(date.year, date.month - 1, date.day) < referenceDay) {
    year += 1;
    date = { ...date, year };
  }
  return parseDate(`${date.year}-${date.month}-${date.day}`);
}

function isoDate(value, referenceTimestamp = Date.now()) {
  const date = parseSmartTripDate(value, referenceTimestamp);
  if (!date) return "";
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function dateTimestamp(value, referenceTimestamp = Date.now()) {
  const date = parseSmartTripDate(value, referenceTimestamp);
  if (!date) return null;
  return datePartsTimestamp(date);
}

function addDays(timestamp, days) {
  return new Date(timestamp + days * 24 * 60 * 60 * 1000).toISOString();
}

function calculateTripDayCount(arrivalDate, returnDate, hotels = [], referenceTimestamp = Date.now()) {
  const arrivalTime = dateTimestamp(arrivalDate, referenceTimestamp)
    ?? dateTimestamp(hotels?.[0]?.checkInDate, referenceTimestamp)
    ?? dateTimestamp(returnDate, referenceTimestamp)
    ?? referenceTimestamp;
  const checkoutTimes = (hotels || [])
    .map((hotel) => dateTimestamp(hotel.checkOutDate, arrivalTime))
    .filter((timestamp) => timestamp !== null);
  const returnTime = dateTimestamp(returnDate, arrivalTime);
  const endTime = returnTime ?? (checkoutTimes.length ? Math.max(...checkoutTimes) : arrivalTime);
  const inclusiveDays = Math.floor((endTime - arrivalTime) / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, Math.min(30, inclusiveDays));
}

function deriveSmartTripPrefill(itinerary = {}) {
  const segments = Array.isArray(itinerary.segments) ? itinerary.segments : [];
  const returnStart = findReturnStartIndex(segments);
  const outbound = returnStart > 0 ? segments.slice(0, returnStart) : segments;
  const destinationSegment = outbound[outbound.length - 1] || segments[segments.length - 1] || {};
  const firstSegment = segments[0] || {};
  const returnSegment = returnStart > 0 ? segments[returnStart] : null;

  const passengerName = meaningful(itinerary.passengers?.[0]?.fullName);
  return {
    passengerName,
    passengerFirstName: passengerFirstNameEnglish("", passengerName),
    destinationCity: meaningful(destinationSegment.arrivalCity) || meaningful(destinationSegment.arrivalAirport),
    destinationCountry: "",
    airline: meaningful(firstSegment.airline),
    flightNumber: meaningful(firstSegment.flightNumber),
    pnr: meaningful(itinerary.pnr),
    departureAirport: meaningful(firstSegment.departureAirport),
    departureCity: meaningful(firstSegment.departureCity),
    arrivalAirport: meaningful(destinationSegment.arrivalAirport),
    arrivalCity: meaningful(destinationSegment.arrivalCity),
    departureDate: meaningful(firstSegment.departureDate),
    departureTime: meaningful(firstSegment.departureTime),
    arrivalDate: meaningful(destinationSegment.arrivalDate),
    arrivalTime: meaningful(destinationSegment.arrivalTime),
    returnDate: meaningful(returnSegment?.departureDate),
    needsConfirmation: !meaningful(destinationSegment.arrivalCity)
  };
}

function normalizeHotels(value, destinationCity, referenceTimestamp = Date.now()) {
  const hotels = Array.isArray(value) ? value : [];
  return hotels
    .slice(0, 10)
    .map((hotel) => {
      const checkInDate = isoDate(hotel?.checkInDate, referenceTimestamp);
      const checkInTimestamp = dateTimestamp(checkInDate, referenceTimestamp) ?? referenceTimestamp;
      return {
        hotelName: limitedText(hotel?.hotelName, 160),
        hotelCity: limitedText(hotel?.hotelCity, 120) || destinationCity,
        hotelAddress: limitedText(hotel?.hotelAddress, 300),
        checkInDate,
        checkOutDate: isoDate(hotel?.checkOutDate, checkInTimestamp),
        hotelPhone: limitedText(hotel?.hotelPhone, 80),
        notes: limitedText(hotel?.notes, 500)
      };
    })
    .filter((hotel) => hotel.hotelName)
    .sort((left, right) => {
      const leftTime = dateTimestamp(left.checkInDate) ?? Number.MAX_SAFE_INTEGER;
      const rightTime = dateTimestamp(right.checkInDate) ?? Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });
}

function normalizeSmartTripInput(value = {}, prefill = {}, now = Date.now()) {
  const destinationCity = limitedText(value.destinationCity || prefill.destinationCity, 120);
  if (destinationCity.length < 2) throw new Error("Please confirm the destination city.");

  const whatsapp = limitedText(value.customerWhatsapp, 40);
  if (whatsapp && !/^[+\d\s().-]+$/.test(whatsapp)) {
    throw new Error("WhatsApp number contains unsupported characters.");
  }

  const departureDate = isoDate(prefill.departureDate, now);
  const departureTimestamp = dateTimestamp(departureDate, now) ?? now;
  const arrivalDate = isoDate(prefill.arrivalDate, departureTimestamp) || departureDate;
  const returnDate = isoDate(prefill.returnDate, departureTimestamp);
  const hotels = normalizeHotels(value.hotels, destinationCity, departureTimestamp);

  return {
    passengerFirstName: passengerFirstNameEnglish(value.passengerFirstName, prefill.passengerName),
    destinationCity,
    destinationCountry: limitedText(value.destinationCountry || prefill.destinationCountry, 120),
    customerWhatsapp: whatsapp,
    notes: limitedText(value.notes, 1000),
    sightseeingRequested: value.sightseeingRequested !== false,
    departureDate: departureDate || limitedText(prefill.departureDate, 40),
    arrivalDate: arrivalDate || limitedText(prefill.arrivalDate, 40),
    returnDate: returnDate || limitedText(prefill.returnDate, 40),
    hotels,
    tripDayCount: calculateTripDayCount(arrivalDate || departureDate, returnDate, hotels, departureTimestamp)
  };
}

function calculateSmartTripExpiry(returnDate, hotels, departureDate, now = Date.now()) {
  const departureTime = dateTimestamp(departureDate, now) ?? now;
  const returnTime = dateTimestamp(returnDate, departureTime);
  let expiry = returnTime !== null ? addDays(returnTime, 14) : "";

  if (!expiry) {
    const checkoutTimes = (hotels || [])
      .map((hotel) => dateTimestamp(hotel.checkOutDate, departureTime))
      .filter((timestamp) => timestamp !== null);
    if (checkoutTimes.length) expiry = addDays(Math.max(...checkoutTimes), 14);
  }

  if (!expiry) expiry = addDays(departureTime, 30);
  return Date.parse(expiry) > now ? expiry : addDays(now, 30);
}

function flightSnapshot(itinerary = {}) {
  return {
    pnr: meaningful(itinerary.pnr),
    passengerName: meaningful(itinerary.passengers?.[0]?.fullName),
    passengers: (itinerary.passengers || []).map((passenger) => ({
      fullName: meaningful(passenger.fullName),
      ticketNumber: meaningful(passenger.ticketNumber),
      passengerType: meaningful(passenger.passengerType),
      seat: meaningful(passenger.seat)
    })),
    baggage: {
      checkedBaggage: meaningful(itinerary.baggage?.checkedBaggage),
      cabinBaggage: meaningful(itinerary.baggage?.cabinBaggage)
    },
    importantNotes: (itinerary.importantNotes || []).map((note) => meaningful(note)).filter(Boolean),
    segments: (itinerary.segments || []).map((segment) => ({
      airline: meaningful(segment.airline),
      flightNumber: meaningful(segment.flightNumber),
      class: meaningful(segment.class),
      departureAirport: meaningful(segment.departureAirport),
      departureCity: meaningful(segment.departureCity),
      departureDate: meaningful(segment.departureDate),
      departureTime: meaningful(segment.departureTime),
      arrivalAirport: meaningful(segment.arrivalAirport),
      arrivalCity: meaningful(segment.arrivalCity),
      arrivalDate: meaningful(segment.arrivalDate),
      arrivalTime: meaningful(segment.arrivalTime),
      duration: meaningful(segment.duration),
      layoverAfter: meaningful(segment.layoverAfter),
      journeyDirection: meaningful(segment.journeyDirection) || "departure",
      terminal: meaningful(segment.terminal),
      gate: meaningful(segment.gate),
      boardingTime: meaningful(segment.boardingTime)
    }))
  };
}

function hotelMapLinks(hotel, fallbackCity = "") {
  const place = [hotel.hotelName, hotel.hotelAddress, hotel.hotelCity || fallbackCity]
    .filter(Boolean)
    .join(" ");
  const encoded = encodeURIComponent(place);
  return {
    searchUrl: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`
  };
}

module.exports = {
  calculateTripDayCount,
  calculateSmartTripExpiry,
  deriveSmartTripPrefill,
  flightSnapshot,
  hotelMapLinks,
  normalizeSmartTripInput,
  passengerFirstNameEnglish
};
