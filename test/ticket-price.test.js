const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeTicketPriceRequest } = require("../src/ticket-price");
const { generateTicketPriceHtml } = require("../src/ticket-price-template");

function request() {
  return {
    customerName: "Hoshyar Ahmed",
    reference: "MKP-ABC123",
    preparedAt: "12 October 2026",
    options: [{
      title: "Best direct flight",
      price: "1,250.50",
      currency: "USD",
      notes: "Price includes 23 kg checked baggage.",
      itinerary: {
        segments: [{
          airline: "Turkish Airlines",
          flightNumber: "TK317",
          class: "Economy",
          departureAirport: "EBL",
          departureCity: "Erbil",
          departureDate: "20 October 2026",
          departureTime: "05:40",
          arrivalAirport: "IST",
          arrivalCity: "Istanbul",
          arrivalDate: "20 October 2026",
          arrivalTime: "08:25",
          duration: "2h 45m"
        }],
        baggage: { checkedBaggage: "23 kg", cabinBaggage: "7 kg" }
      }
    }]
  };
}

test("normalizes a customer flight-price quotation", () => {
  const quote = normalizeTicketPriceRequest(request());
  assert.equal(quote.customerName, "Hoshyar Ahmed");
  assert.equal(quote.options[0].price, 1250.5);
  assert.equal(quote.options[0].currency, "USD");
  assert.equal(quote.options[0].itinerary.segments[0].arrivalAirport, "IST");
});

test("renders branded comparison and option detail pages", () => {
  const quote = normalizeTicketPriceRequest(request());
  const html = generateTicketPriceHtml(quote);
  assert.match(html, /MK Business and Travel/);
  assert.match(html, /Hoshyar Ahmed/);
  assert.match(html, /Best direct flight/);
  assert.match(html, /\$1,250\.50/);
  assert.match(html, /EBL/);
  assert.match(html, /IST/);
  assert.match(html, /Price and availability can change until ticketing/);
});

test("continues long multi-flight options on additional A4 pages", () => {
  const input = request();
  input.options[0].itinerary.segments.push(
    { ...input.options[0].itinerary.segments[0], flightNumber: "TK318" },
    { ...input.options[0].itinerary.segments[0], flightNumber: "TK319" }
  );
  const html = generateTicketPriceHtml(normalizeTicketPriceRequest(input));
  assert.match(html, /Journey schedule · 1 of 2/);
  assert.match(html, /Journey schedule · 2 of 2/);
  assert.equal((html.match(/class="page /g) || []).length, 3);
});

test("rejects unsupported currencies and empty routes", () => {
  const invalidCurrency = request();
  invalidCurrency.options[0].currency = "AED";
  assert.throws(() => normalizeTicketPriceRequest(invalidCurrency), /unsupported currency/);

  const noRoute = request();
  noRoute.options[0].itinerary = { segments: [] };
  assert.throws(() => normalizeTicketPriceRequest(noRoute), /needs extracted or manually entered flight details/);
});
