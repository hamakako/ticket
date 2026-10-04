const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyJourneyDirections,
  findReturnStartIndex
} = require("../src/flight-journeys");

function segment(from, to, dates = {}) {
  return {
    departureAirport: from,
    departureCity: from,
    departureDate: dates.departureDate || "01/10/2026",
    departureTime: dates.departureTime || "10:00",
    arrivalAirport: to,
    arrivalCity: to,
    arrivalDate: dates.arrivalDate || dates.departureDate || "01/10/2026",
    arrivalTime: dates.arrivalTime || "12:00",
    journeyDirection: dates.journeyDirection || "Not specified"
  };
}

test("finds the return flight in a direct round trip", () => {
  const segments = [
    segment("EBL", "IST", { departureDate: "01/10/2026" }),
    segment("IST", "EBL", { departureDate: "08/10/2026", arrivalDate: "08/10/2026" })
  ];
  assert.equal(findReturnStartIndex(segments), 1);
});

test("finds the return boundary in a multi-segment mirrored route", () => {
  const segments = [
    segment("CMN", "SAW"),
    segment("SAW", "TZX"),
    segment("TZX", "SAW"),
    segment("SAW", "CMN")
  ];
  assert.equal(findReturnStartIndex(segments), 2);
});

test("uses a destination stay to identify an open-jaw return", () => {
  const segments = [
    segment("EBL", "IST", { departureDate: "01/10/2026", arrivalDate: "01/10/2026" }),
    segment("IST", "LHR", { departureDate: "01/10/2026", departureTime: "14:00", arrivalDate: "01/10/2026", arrivalTime: "18:00" }),
    segment("LGW", "SAW", { departureDate: "10/10/2026", arrivalDate: "10/10/2026" }),
    segment("SAW", "EBL", { departureDate: "10/10/2026", departureTime: "16:00", arrivalDate: "10/10/2026", arrivalTime: "18:00" })
  ];
  assert.equal(findReturnStartIndex(segments), 2);
});

test("does not add a return section to a one-way itinerary", () => {
  const segments = [segment("EBL", "IST"), segment("IST", "LHR")];
  assert.equal(findReturnStartIndex(segments), -1);
});

test("does not mistake a long one-way stop for a return journey", () => {
  const segments = [
    segment("EBL", "IST", { departureDate: "01/10/2026", arrivalDate: "01/10/2026" }),
    segment("IST", "LHR", { departureDate: "05/10/2026", arrivalDate: "05/10/2026" })
  ];
  assert.equal(findReturnStartIndex(segments), -1);
});

test("prefers Gemini's explicit return classification", () => {
  const segments = [
    segment("EBL", "IST", { journeyDirection: "departure" }),
    segment("IST", "LHR", { journeyDirection: "departure" }),
    segment("CDG", "EBL", { journeyDirection: "return" })
  ];
  const result = applyJourneyDirections({ segments });
  assert.deepEqual(result.segments.map((item) => item.journeyDirection), ["departure", "departure", "return"]);
});
