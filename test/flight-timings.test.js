const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateLayover, enrichFlightTimings } = require("../src/flight-timings");

test("calculates a same-day transit stop", () => {
  const result = calculateLayover(
    { arrivalAirport: "SAW", arrivalCity: "Istanbul", arrivalDate: "26/09/2026", arrivalTime: "06:45" },
    { departureAirport: "SAW", departureCity: "Istanbul", departureDate: "26/09/2026", departureTime: "08:30" }
  );
  assert.equal(result, "1h 45m");
});

test("calculates an overnight transit stop", () => {
  const result = calculateLayover(
    { arrivalAirport: "IST", arrivalCity: "Istanbul", arrivalDate: "2026-10-04", arrivalTime: "23:40" },
    { departureAirport: "IST", departureCity: "Istanbul", departureDate: "2026-10-05", departureTime: "02:10" }
  );
  assert.equal(result, "2h 30m");
});

test("preserves a printed layover and fills a missing layover", () => {
  const enriched = enrichFlightTimings({
    segments: [
      { arrivalAirport: "IST", arrivalCity: "Istanbul", arrivalDate: "04 Oct 2026", arrivalTime: "10:00", layoverAfter: "3h printed" },
      { departureAirport: "IST", departureCity: "Istanbul", departureDate: "04 Oct 2026", departureTime: "12:00", arrivalAirport: "TZX", arrivalCity: "Trabzon", arrivalDate: "04 Oct 2026", arrivalTime: "15:00" },
      { departureAirport: "TZX", departureCity: "Trabzon", departureDate: "04 Oct 2026", departureTime: "16:15" }
    ]
  });

  assert.equal(enriched.segments[0].layoverAfter, "3h printed");
  assert.equal(enriched.segments[1].layoverAfter, "1h 15m");
  assert.equal(enriched.segments[2].layoverAfter, "Not specified");
});

test("does not invent a layover when dates or times are missing", () => {
  const result = calculateLayover(
    { arrivalAirport: "IST", arrivalDate: "Not specified", arrivalTime: "10:00" },
    { departureAirport: "IST", departureDate: "04/10/2026", departureTime: "12:00" }
  );
  assert.equal(result, "");
});

test("does not label a long destination stay as transit", () => {
  const result = calculateLayover(
    { arrivalAirport: "TZX", arrivalCity: "Trabzon", arrivalDate: "27/09/2026", arrivalTime: "10:10" },
    { departureAirport: "TZX", departureCity: "Trabzon", departureDate: "04/10/2026", departureTime: "21:25" }
  );
  assert.equal(result, "");
});
