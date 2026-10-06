const test = require("node:test");
const assert = require("node:assert/strict");

const { generateFlightHtml } = require("../src/templates");

const itinerary = {
  pnr: "ABC123",
  passengers: [{
    fullName: "TEST PASSENGER",
    ticketNumber: "2351234567890",
    passengerType: "Adult"
  }],
  segments: [{
    airline: "Turkish Airlines",
    flightNumber: "TK317",
    class: "Economy",
    departureAirport: "EBL",
    departureCity: "Erbil",
    departureDate: "2026-10-10",
    departureTime: "10:00",
    arrivalAirport: "IST",
    arrivalCity: "Istanbul",
    arrivalDate: "2026-10-10",
    arrivalTime: "12:30",
    duration: "2h 30m",
    layoverAfter: "Not specified",
    journeyDirection: "departure"
  }],
  baggage: { checkedBaggage: "23 KG", cabinBaggage: "7 KG" },
  importantNotes: []
};

test("keeps ordinary flight tickets free of Smart Trip controls", () => {
  const html = generateFlightHtml(itinerary, "modern");
  assert.doesNotMatch(html, /<aside class="smart-trip-access">/);
  assert.doesNotMatch(html, />Open Smart Trip</);
});

test("adds a linked QR card only to a Smart Trip ticket", () => {
  const html = generateFlightHtml({
    ...itinerary,
    smartTrip: {
      url: "https://example.com/smart-trip/customer-token",
      qrDataUri: "data:image/png;base64,QRDATA"
    }
  }, "executive");

  assert.match(html, /class="hero smart-trip-hero"/);
  assert.match(html, /src="data:image\/png;base64,QRDATA"/);
  assert.match(html, /href="https:\/\/example\.com\/smart-trip\/customer-token"/);
  assert.match(html, />Open Smart Trip</);
  assert.equal((html.match(/class="smart-trip-access"/g) || []).length, 1);
});
