const NOT_SPECIFIED = "Not specified";
const { applyJourneyDirections } = require("./flight-journeys");

function meaningful(value) {
  const text = String(value || "").trim();
  return text && text !== NOT_SPECIFIED ? text : "";
}

function validDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day };
}

function parseDate(value) {
  const text = meaningful(value);
  if (!text) return null;

  let match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) return validDate(Number(match[3]), Number(match[2]), Number(match[1]));

  match = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return validDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

function parseTime(value) {
  const text = meaningful(value).toUpperCase().replace(/\s+/g, " ");
  if (!text) return null;

  const match = text.match(/^(\d{1,2})(?::?(\d{2}))?\s*(AM|PM)?$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = match[3] || "";
  if (minute > 59 || hour > (period ? 12 : 23) || hour < 0) return null;
  if (period === "AM" && hour === 12) hour = 0;
  if (period === "PM" && hour !== 12) hour += 12;
  return { hour, minute };
}

function localTimestamp(dateValue, timeValue) {
  const date = parseDate(dateValue);
  const time = parseTime(timeValue);
  if (!date || !time) return null;
  return Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute);
}

function durationLabel(minutes) {
  const total = Math.round(Number(minutes));
  if (!Number.isFinite(total) || total < 0) return "";
  const hours = Math.floor(total / 60);
  const remaining = total % 60;
  return `${hours ? `${hours}h` : ""}${hours && remaining ? " " : ""}${remaining || !hours ? `${remaining}m` : ""}`;
}

function locationKey(value) {
  return meaningful(value)
    .toUpperCase()
    .replace(/\b(INTERNATIONAL|INTL|AIRPORT)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameConnectionPoint(currentSegment, nextSegment) {
  const arrivalAirport = locationKey(currentSegment?.arrivalAirport);
  const departureAirport = locationKey(nextSegment?.departureAirport);
  if (arrivalAirport && departureAirport && arrivalAirport === departureAirport) return true;

  const arrivalCity = locationKey(currentSegment?.arrivalCity);
  const departureCity = locationKey(nextSegment?.departureCity);
  if (!arrivalCity || !departureCity) return false;
  if (arrivalCity === departureCity) return true;
  const shorter = arrivalCity.length < departureCity.length ? arrivalCity : departureCity;
  const longer = arrivalCity.length < departureCity.length ? departureCity : arrivalCity;
  return shorter.length >= 4 && longer.startsWith(`${shorter} `);
}

function parsedDurationMinutes(value) {
  const text = meaningful(value).toLowerCase();
  if (!text) return null;

  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  const minutes = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (hours || minutes) return Math.round(Number(hours?.[1] || 0) * 60 + Number(minutes?.[1] || 0));

  const clock = text.match(/^(\d{1,2}):(\d{2})$/);
  if (clock && Number(clock[2]) < 60) return Number(clock[1]) * 60 + Number(clock[2]);
  return null;
}

function calculateLayover(currentSegment, nextSegment) {
  if (!sameConnectionPoint(currentSegment, nextSegment)) return "";
  const arrival = localTimestamp(currentSegment?.arrivalDate, currentSegment?.arrivalTime);
  const departure = localTimestamp(nextSegment?.departureDate, nextSegment?.departureTime);
  if (arrival === null || departure === null) return "";

  const minutes = (departure - arrival) / 60000;
  if (minutes < 0 || minutes > 48 * 60) return "";
  return durationLabel(minutes);
}

function enrichFlightTimings(data = {}) {
  const sourceSegments = Array.isArray(data.segments) ? data.segments : [];
  const segments = sourceSegments.map((segment, index) => {
    const providedLayover = meaningful(segment?.layoverAfter);
    const providedMinutes = parsedDurationMinutes(providedLayover);
    const validProvidedLayover = providedMinutes === null || providedMinutes <= 48 * 60
      ? providedLayover
      : "";
    const calculatedLayover = index < sourceSegments.length - 1
      ? calculateLayover(segment, sourceSegments[index + 1])
      : "";
    return {
      ...segment,
      layoverAfter: validProvidedLayover || calculatedLayover || NOT_SPECIFIED
    };
  });

  return applyJourneyDirections({ ...data, segments });
}

module.exports = {
  calculateLayover,
  durationLabel,
  enrichFlightTimings,
  parseDate,
  parseTime,
  sameConnectionPoint
};
