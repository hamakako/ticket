const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateTripDayCount,
  deriveSmartTripPrefill,
  hotelMapLinks,
  normalizeSmartTripInput
} = require("../src/smart-trip");
const { generateSmartTripHtml } = require("../src/smart-trip-template");

const itinerary = {
  pnr: "ABC123",
  passengers: [{ fullName: "TEST PASSENGER" }],
  segments: [
    { journeyDirection: "departure", airline: "Pegasus", flightNumber: "PC1", departureAirport: "EBL", departureCity: "Erbil", departureDate: "01/10/2026", departureTime: "10:00", arrivalAirport: "SAW", arrivalCity: "Istanbul", arrivalDate: "01/10/2026", arrivalTime: "12:00" },
    { journeyDirection: "departure", airline: "Pegasus", flightNumber: "PC2", departureAirport: "SAW", departureCity: "Istanbul", departureDate: "01/10/2026", departureTime: "14:00", arrivalAirport: "TZX", arrivalCity: "Trabzon", arrivalDate: "01/10/2026", arrivalTime: "15:30" },
    { journeyDirection: "return", airline: "Pegasus", flightNumber: "PC3", departureAirport: "TZX", departureCity: "Trabzon", departureDate: "08/10/2026", departureTime: "11:00", arrivalAirport: "EBL", arrivalCity: "Erbil", arrivalDate: "08/10/2026", arrivalTime: "13:00" }
  ]
};

test("detects the final outbound city instead of a transit or return city", () => {
  const prefill = deriveSmartTripPrefill(itinerary);
  assert.equal(prefill.destinationCity, "Trabzon");
  assert.equal(prefill.returnDate, "08/10/2026");
  assert.equal(prefill.passengerName, "TEST PASSENGER");
  assert.equal(prefill.passengerFirstName, "TEST");
});

test("uses a reviewed English first name for the Smart Trip greeting", () => {
  const input = normalizeSmartTripInput({
    passengerFirstName: "Hoshyar",
    destinationCity: "Istanbul",
    sightseeingRequested: false
  }, {
    passengerName: "MR HOSHYAR ABDULRAZZAQ",
    departureDate: "2026-10-10",
    arrivalDate: "2026-10-10"
  });
  assert.equal(input.passengerFirstName, "Hoshyar");
  const kurdishInput = normalizeSmartTripInput({
    passengerFirstName: "هۆشیار",
    destinationCity: "Istanbul"
  }, {
    passengerName: "MR HOSHYAR ABDULRAZZAQ",
    departureDate: "2026-10-10"
  });
  assert.equal(kurdishInput.passengerFirstName, "هۆشیار");
});

test("cleans ticket punctuation before choosing the automatic English first name", () => {
  const prefill = deriveSmartTripPrefill({
    passengers: [{ fullName: "SHAWNM. ABDULLAH QADIR QADIR" }],
    segments: itinerary.segments
  });
  assert.equal(prefill.passengerFirstName, "SHAWNM");
});

test("keeps complete ticket details in the Smart Trip flight snapshot", () => {
  const { flightSnapshot } = require("../src/smart-trip");
  const snapshot = flightSnapshot({
    ...itinerary,
    passengers: [{ fullName: "TEST PASSENGER", ticketNumber: "2351234567890", passengerType: "Adult", seat: "12A" }],
    baggage: { checkedBaggage: "23 KG", cabinBaggage: "7 KG" },
    importantNotes: ["Arrive early"]
  });
  assert.equal(snapshot.passengers[0].ticketNumber, "2351234567890");
  assert.equal(snapshot.segments[0].class, "");
  assert.deepEqual(snapshot.importantNotes, ["Arrive early"]);
});

test("moves a yearless January return into the year after a December departure", () => {
  const now = Date.UTC(2026, 11, 1, 12);
  const input = normalizeSmartTripInput({ destinationCity: "Istanbul" }, {
    departureDate: "Dec 20",
    returnDate: "Jan 5"
  }, now);
  assert.equal(input.departureDate, "2026-12-20");
  assert.equal(input.returnDate, "2027-01-05");
});

test("defaults one-way Smart Trips to a seven-day plan", () => {
  const input = normalizeSmartTripInput({ destinationCity: "Istanbul" }, {
    departureDate: "2026-10-10",
    arrivalDate: "2026-10-10",
    returnDate: ""
  });
  assert.equal(input.tripDayCount, 7);
});

test("uses the selected plan length for one-way Smart Trips", () => {
  const input = normalizeSmartTripInput({ destinationCity: "Istanbul", tripDayCount: 12 }, {
    departureDate: "2026-10-10",
    arrivalDate: "2026-10-10",
    returnDate: ""
  });
  assert.equal(input.tripDayCount, 12);
});

test("uses ticket dates instead of the one-way field for return trips", () => {
  const input = normalizeSmartTripInput({ destinationCity: "Istanbul", tripDayCount: 30 }, {
    departureDate: "2026-10-10",
    arrivalDate: "2026-10-10",
    returnDate: "2026-10-14"
  });
  assert.equal(input.tripDayCount, 5);
});

test("creates one daily plan day for every inclusive destination date", () => {
  assert.equal(calculateTripDayCount("2026-10-01", "2026-10-10"), 10);
  assert.equal(calculateTripDayCount("2026-10-30", "2026-11-02"), 4);
});

test("uses hotel checkout to determine trip length when there is no return flight", () => {
  assert.equal(calculateTripDayCount("2026-10-01", "", [{ checkOutDate: "2026-10-05" }]), 5);
});

test("normalizes and sorts multiple optional hotels", () => {
  const input = normalizeSmartTripInput({
    destinationCity: "Istanbul",
    hotels: [
      { hotelName: "Second Hotel", checkInDate: "2026-10-05" },
      {
        referenceNumber: "HOTEL123",
        hotelName: "First Hotel",
        hotelCity: "",
        checkInDate: "2026-10-02",
        hotelDescriptionKurdish: "وەسفی هۆتێل",
        locationDescriptionKurdish: "وەسفی شوێن",
        nearbyPlacesKurdish: "شوێنە نزیکەکان"
      },
      { hotelName: "" }
    ]
  });
  assert.deepEqual(input.hotels.map((hotel) => hotel.hotelName), ["First Hotel", "Second Hotel"]);
  assert.equal(input.hotels[0].hotelCity, "Istanbul");
  assert.equal(input.hotels[0].referenceNumber, "HOTEL123");
  assert.equal(input.hotels[0].locationDescriptionKurdish, "وەسفی شوێن");
});

test("creates encoded Google Maps search and direction links", () => {
  const links = hotelMapLinks({ hotelName: "MK Hotel", hotelAddress: "Main Street", hotelCity: "Istanbul" });
  assert.match(links.searchUrl, /google\.com\/maps\/search/);
  assert.match(links.searchUrl, /MK%20Hotel%20Main%20Street%20Istanbul/);
  assert.match(links.directionsUrl, /google\.com\/maps\/dir/);
});

test("renders branded flight, hotel, sightseeing, services, and countdown sections", () => {
  const html = generateSmartTripHtml({
    passengerName: "TEST PASSENGER",
    passengerFirstNameEnglish: "Test",
    token: "abcdefghijklmnopqrstuvwxyz123456",
    passengerFirstNameKurdish: "تێست",
    destinationCity: "Trabzon",
    destinationCountry: "Türkiye",
    departureDate: "01/10/2026",
    departureTime: "10:00",
    returnDate: "08/10/2026",
    tripDayCount: 8,
    flight: { pnr: "ABC123", segments: itinerary.segments },
    hotels: [{
      referenceNumber: "HTL-7788",
      hotelName: "Test Hotel",
      hotelCity: "Trabzon",
      hotelAddress: "Center",
      checkInDate: "2026-10-01",
      checkOutDate: "2026-10-08",
      hotelPhone: "",
      hotelDescriptionKurdish: "هۆتێلێکی گونجاوە بۆ گەشتیاران.",
      locationDescriptionKurdish: "لە ناوچەیەکی ناوەندی شارە.",
      nearbyPlacesKurdish: "نزیکە لە شوێنە گەشتیارییە گرنگەکان.",
      notes: "ناسنامە لەگەڵ خۆت ببە."
    }],
    sightseeingRequested: true,
    sightseeingStatus: "ready",
    sightseeing: [{ name: "Atatürk Köşkü", description: "وەسفێکی کورت", mapUrl: "https://www.google.com/maps/search/?api=1&query=test", imageUrl: "https://upload.wikimedia.org/test.jpg", imageSourceUrl: "https://en.wikipedia.org/?curid=1" }],
    travelTip: "تێبینی",
    miniPlan: [{ title: "ڕۆژی یەکەم", items: ["گەشت"] }],
    notes: ""
  });
  assert.match(html, /MK Business and Travel/);
  assert.match(html, /Time until departure/);
  assert.match(html, /Print \/ Save as PDF/);
  assert.match(html, /Download PDF/);
  assert.match(html, /@page \{ size:A4/);
  assert.match(html, /8 day plan/);
  assert.match(html, /Test Hotel/);
  assert.match(html, /HTL-7788/);
  assert.match(html, /دەربارەی هۆتێل/);
  assert.match(html, /شوێنی هۆتێل/);
  assert.match(html, /شوێنە گرنگە نزیکەکان/);
  assert.match(html, /Direction to hotel/);
  assert.match(html, /زانیاریی کورت بە کوردی/);
  assert.match(html, /کورتەی زانیاریی فڕین/);
  assert.match(html, /Atatürk Köşkü/);
  assert.match(html, /بە هیوای گەشتێکی خۆش،/);
  assert.match(html, />Test</);
  assert.doesNotMatch(html, /تێست/);
  assert.match(html, /https:\/\/upload\.wikimedia\.org\/test\.jpg/);
  assert.match(html, /گەشتەکەت تەواو بکە/);
  assert.match(html, /ترانسفێری فڕۆکەخانە/);
  assert.match(html, /گەشتی ڕۆژانە/);
  assert.match(html, /eSIM/);
  assert.match(html, /assets\/services\/esim\.jpg/);
  assert.match(html, /assets\/services\/airport-transfer\.jpg/);
  assert.match(html, /assets\/services\/daily-tours\.jpg/);
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /تا کاتی سڕینەوەی لەلایەن MK Business and Travel/);
  assert.doesNotMatch(html, /Link expired|2026-10-22/);
});

test("renders the Kurdish fallback without breaking the Smart Trip when AI is unavailable", () => {
  const html = generateSmartTripHtml({
    passengerName: "TEST PASSENGER",
    destinationCity: "Istanbul",
    destinationCountry: "Türkiye",
    departureDate: "01/10/2026",
    departureTime: "10:00",
    returnDate: "",
    tripDayCount: 7,
    flight: { pnr: "ABC123", segments: itinerary.segments.slice(0, 1) },
    hotels: [],
    sightseeingRequested: true,
    sightseeingStatus: "unavailable",
    sightseeing: [],
    travelTip: "",
    miniPlan: [],
    notes: ""
  });
  assert.match(html, /ڕێنمایی AI لە کاتی دروستکردندا ئامادە نەبوو/);
  assert.match(html, /Flight information/);
});
