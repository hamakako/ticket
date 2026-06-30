const NOT_SPECIFIED = "Not specified";

const financialPattern = /\b(price|fare|amount|total|paid|payment|invoice|receipt|fee|cost|charge|currency)\b|[$€£]|(?:USD|EUR|GBP|IQD|AED|SAR|TRY)\b/i;

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function cleanText(value) {
  if (isBlank(value)) return NOT_SPECIFIED;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return NOT_SPECIFIED;
  return financialPattern.test(text) ? NOT_SPECIFIED : text;
}

function cleanFreeText(value) {
  if (isBlank(value)) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function cleanUrl(value) {
  const text = cleanFreeText(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function asArray(value) {
  if (!Array.isArray(value)) return [];
  return value;
}

function normalizeNotes(value) {
  const notes = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

  return notes
    .map(cleanFreeText)
    .filter((note) => note && !financialPattern.test(note));
}

function normalizeFlightData(input = {}) {
  const baggage = input.baggage || {};
  const passengers = asArray(input.passengers)
    .map((passenger) => ({
      fullName: cleanText(passenger?.fullName),
      ticketNumber: cleanText(passenger?.ticketNumber),
      passengerType: cleanText(passenger?.passengerType),
      seat: cleanText(passenger?.seat)
    }))
    .filter((passenger) => Object.values(passenger).some((value) => value !== NOT_SPECIFIED));

  const segments = asArray(input.segments)
    .map((segment) => ({
      airline: cleanText(segment?.airline),
      flightNumber: cleanText(segment?.flightNumber),
      class: cleanText(segment?.class),
      departureAirport: cleanText(segment?.departureAirport),
      departureCity: cleanText(segment?.departureCity),
      departureDate: cleanText(segment?.departureDate),
      departureTime: cleanText(segment?.departureTime),
      arrivalAirport: cleanText(segment?.arrivalAirport),
      arrivalCity: cleanText(segment?.arrivalCity),
      arrivalDate: cleanText(segment?.arrivalDate),
      arrivalTime: cleanText(segment?.arrivalTime),
      duration: cleanText(segment?.duration),
      terminal: cleanText(segment?.terminal),
      gate: cleanText(segment?.gate),
      boardingTime: cleanText(segment?.boardingTime)
    }))
    .filter((segment) => Object.values(segment).some((value) => value !== NOT_SPECIFIED));

  return {
    type: "flight",
    pnr: cleanText(input.pnr),
    passengers: passengers.length ? passengers : [{
      fullName: NOT_SPECIFIED,
      ticketNumber: NOT_SPECIFIED,
      passengerType: NOT_SPECIFIED,
      seat: NOT_SPECIFIED
    }],
    segments: segments.length ? segments : [{
      airline: NOT_SPECIFIED,
      flightNumber: NOT_SPECIFIED,
      class: NOT_SPECIFIED,
      departureAirport: NOT_SPECIFIED,
      departureCity: NOT_SPECIFIED,
      departureDate: NOT_SPECIFIED,
      departureTime: NOT_SPECIFIED,
      arrivalAirport: NOT_SPECIFIED,
      arrivalCity: NOT_SPECIFIED,
      arrivalDate: NOT_SPECIFIED,
      arrivalTime: NOT_SPECIFIED,
      duration: NOT_SPECIFIED,
      terminal: NOT_SPECIFIED,
      gate: NOT_SPECIFIED,
      boardingTime: NOT_SPECIFIED
    }],
    baggage: {
      checkedBaggage: cleanText(baggage.checkedBaggage),
      cabinBaggage: cleanText(baggage.cabinBaggage)
    },
    importantNotes: normalizeNotes(input.importantNotes)
  };
}

function normalizeHotelData(input = {}) {
  const guests = asArray(input.guests)
    .map((guest) => ({ fullName: cleanText(guest?.fullName) }))
    .filter((guest) => guest.fullName !== NOT_SPECIFIED);

  return {
    type: "hotel",
    referenceNumber: cleanText(input.referenceNumber),
    hotelName: cleanText(input.hotelName),
    hotelAddress: cleanText(input.hotelAddress),
    hotelPhone: cleanText(input.hotelPhone),
    checkInDate: cleanText(input.checkInDate),
    checkInTime: cleanText(input.checkInTime),
    checkOutDate: cleanText(input.checkOutDate),
    checkOutTime: cleanText(input.checkOutTime),
    roomType: cleanText(input.roomType),
    bedding: cleanText(input.bedding),
    guests: guests.length ? guests : [{ fullName: NOT_SPECIFIED }],
    numberOfGuests: cleanText(input.numberOfGuests),
    mealType: cleanText(input.mealType),
    gps: cleanText(input.gps),
    placeId: cleanFreeText(input.placeId),
    mapUrl: cleanUrl(input.mapUrl),
    mapsTitle: cleanFreeText(input.mapsTitle),
    latitude: cleanFreeText(input.latitude),
    longitude: cleanFreeText(input.longitude),
    hotelPhotoUrl: cleanUrl(input.hotelPhotoUrl),
    photoAttribution: cleanFreeText(input.photoAttribution),
    photoAttributionUrl: cleanUrl(input.photoAttributionUrl),
    importantNotes: normalizeNotes(input.importantNotes),
    cancellationNotes: normalizeNotes(input.cancellationNotes)
  };
}

module.exports = {
  NOT_SPECIFIED,
  normalizeFlightData,
  normalizeHotelData,
  normalizeNotes
};
