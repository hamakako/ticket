const { normalizeFlightData, NOT_SPECIFIED } = require("./schema");

const CURRENCIES = new Set(["USD", "EUR", "GBP", "TRY", "IQD"]);

function compact(value, maxLength = 200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function customerName(value) {
  const name = compact(value, 120);
  if (!name) return "";
  if (name.length < 2) throw new Error("Customer name must contain at least two characters when provided.");
  if (!/^[\p{L}\p{M}\d'’ .-]+$/u.test(name)) {
    throw new Error("Customer name contains unsupported characters.");
  }
  return name;
}

function normalizePrice(value) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new Error("Each option needs a valid price with no more than two decimal places.");
  }
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000) {
    throw new Error("Each option price must be greater than zero.");
  }
  return amount;
}

function hasRoute(itinerary) {
  return (itinerary.segments || []).some((segment) => [
    segment.airline,
    segment.flightNumber,
    segment.departureAirport,
    segment.departureCity,
    segment.arrivalAirport,
    segment.arrivalCity
  ].some((value) => value && value !== NOT_SPECIFIED));
}

function normalizeTicketPriceRequest(input = {}) {
  const options = Array.isArray(input.options) ? input.options : [];
  if (!options.length) throw new Error("Please add at least one ticket option.");
  if (options.length > 10) throw new Error("A quotation can contain a maximum of 10 ticket options.");

  return {
    customerName: customerName(input.customerName),
    reference: compact(input.reference, 30),
    preparedAt: compact(input.preparedAt, 40),
    options: options.map((option, index) => {
      const itinerary = normalizeFlightData(option?.itinerary || {});
      if (!hasRoute(itinerary)) {
        throw new Error(`Option ${index + 1} needs extracted or manually entered flight details.`);
      }
      const currency = compact(option?.currency, 3).toUpperCase() || "USD";
      if (!CURRENCIES.has(currency)) throw new Error(`Option ${index + 1} uses an unsupported currency.`);
      return {
        title: compact(option?.title, 80) || `Option ${index + 1}`,
        price: normalizePrice(option?.price),
        currency,
        notes: compact(option?.notes, 500),
        itinerary
      };
    })
  };
}

module.exports = {
  CURRENCIES,
  normalizeTicketPriceRequest
};
