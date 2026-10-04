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

function isoDate(value) {
  const date = parseDate(value);
  if (!date) return "";
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function dateTimestamp(value) {
  const date = parseDate(value);
  if (!date) return null;
  return Date.UTC(date.year, date.month - 1, date.day, 23, 59, 59);
}

function addDays(timestamp, days) {
  return new Date(timestamp + days * 24 * 60 * 60 * 1000).toISOString();
}

function deriveSmartTripPrefill(itinerary = {}) {
  const segments = Array.isArray(itinerary.segments) ? itinerary.segments : [];
  const returnStart = findReturnStartIndex(segments);
  const outbound = returnStart > 0 ? segments.slice(0, returnStart) : segments;
  const destinationSegment = outbound[outbound.length - 1] || segments[segments.length - 1] || {};
  const firstSegment = segments[0] || {};
  const returnSegment = returnStart > 0 ? segments[returnStart] : null;

  return {
    passengerName: meaningful(itinerary.passengers?.[0]?.fullName),
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

function normalizeHotels(value, destinationCity) {
  const hotels = Array.isArray(value) ? value : [];
  return hotels
    .slice(0, 10)
    .map((hotel) => ({
      hotelName: limitedText(hotel?.hotelName, 160),
      hotelCity: limitedText(hotel?.hotelCity, 120) || destinationCity,
      hotelAddress: limitedText(hotel?.hotelAddress, 300),
      checkInDate: isoDate(hotel?.checkInDate),
      checkOutDate: isoDate(hotel?.checkOutDate),
      hotelPhone: limitedText(hotel?.hotelPhone, 80),
      notes: limitedText(hotel?.notes, 500)
    }))
    .filter((hotel) => hotel.hotelName)
    .sort((left, right) => {
      const leftTime = dateTimestamp(left.checkInDate) ?? Number.MAX_SAFE_INTEGER;
      const rightTime = dateTimestamp(right.checkInDate) ?? Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });
}

function normalizeSmartTripInput(value = {}, prefill = {}) {
  const destinationCity = limitedText(value.destinationCity || prefill.destinationCity, 120);
  if (destinationCity.length < 2) throw new Error("Please confirm the destination city.");

  const whatsapp = limitedText(value.customerWhatsapp, 40);
  if (whatsapp && !/^[+\d\s().-]+$/.test(whatsapp)) {
    throw new Error("WhatsApp number contains unsupported characters.");
  }

  return {
    destinationCity,
    destinationCountry: limitedText(value.destinationCountry || prefill.destinationCountry, 120),
    customerWhatsapp: whatsapp,
    notes: limitedText(value.notes, 1000),
    sightseeingRequested: value.sightseeingRequested !== false,
    hotels: normalizeHotels(value.hotels, destinationCity)
  };
}

function calculateSmartTripExpiry(returnDate, hotels, departureDate) {
  const returnTime = dateTimestamp(returnDate);
  if (returnTime !== null) return addDays(returnTime, 14);

  const checkoutTimes = (hotels || [])
    .map((hotel) => dateTimestamp(hotel.checkOutDate))
    .filter((timestamp) => timestamp !== null);
  if (checkoutTimes.length) return addDays(Math.max(...checkoutTimes), 14);

  const departureTime = dateTimestamp(departureDate) ?? Date.now();
  return addDays(departureTime, 30);
}

function flightSnapshot(itinerary = {}) {
  return {
    pnr: meaningful(itinerary.pnr),
    passengerName: meaningful(itinerary.passengers?.[0]?.fullName),
    baggage: {
      checkedBaggage: meaningful(itinerary.baggage?.checkedBaggage),
      cabinBaggage: meaningful(itinerary.baggage?.cabinBaggage)
    },
    segments: (itinerary.segments || []).map((segment) => ({
      airline: meaningful(segment.airline),
      flightNumber: meaningful(segment.flightNumber),
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
      journeyDirection: meaningful(segment.journeyDirection) || "departure"
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
  calculateSmartTripExpiry,
  deriveSmartTripPrefill,
  flightSnapshot,
  hotelMapLinks,
  normalizeSmartTripInput
};
