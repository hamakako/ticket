const NOT_SPECIFIED = "Not specified";

function meaningful(value) {
  const text = String(value || "").trim();
  return text && text !== NOT_SPECIFIED ? text : "";
}

function locationKey(value) {
  return meaningful(value)
    .toUpperCase()
    .replace(/\b(INTERNATIONAL|INTL|AIRPORT)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function locationKeys(segment, side) {
  const values = side === "departure"
    ? [segment?.departureAirport, segment?.departureCity]
    : [segment?.arrivalAirport, segment?.arrivalCity];
  return values.map(locationKey).filter(Boolean);
}

function sameLocation(leftKeys, rightKeys) {
  return leftKeys.some((left) => rightKeys.some((right) => {
    if (left === right) return true;
    const shorter = left.length < right.length ? left : right;
    const longer = left.length < right.length ? right : left;
    return shorter.length >= 4 && longer.startsWith(`${shorter} `);
  }));
}

function parseDate(value) {
  const text = meaningful(value);
  if (!text) return null;

  let match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) return { year: Number(match[3]), month: Number(match[2]), day: Number(match[1]) };

  match = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return { year: parsed.getFullYear(), month: parsed.getMonth() + 1, day: parsed.getDate() };
}

function parseTime(value) {
  const text = meaningful(value).toUpperCase().replace(/\s+/g, " ");
  const match = text.match(/^(\d{1,2})(?::?(\d{2}))?\s*(AM|PM)?$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = match[3] || "";
  if (minute > 59 || hour > (period ? 12 : 23)) return null;
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

function explicitReturnStart(segments) {
  return segments.findIndex((segment, index) => {
    if (index === 0) return false;
    return /^(return|inbound)(?:\s+flight)?$/i.test(meaningful(segment?.journeyDirection));
  });
}

function longStayReturnStart(segments) {
  let returnIndex = -1;
  let longestGap = 48 * 60;

  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    const arrival = localTimestamp(previous?.arrivalDate, previous?.arrivalTime);
    const departure = localTimestamp(current?.departureDate, current?.departureTime);
    if (arrival === null || departure === null) continue;

    const gapMinutes = (departure - arrival) / 60000;
    if (gapMinutes > longestGap) {
      longestGap = gapMinutes;
      returnIndex = index;
    }
  }

  return returnIndex;
}

function routeReturnStart(segments) {
  const visited = locationKeys(segments[0], "departure");

  for (let index = 0; index < segments.length; index += 1) {
    const arrival = locationKeys(segments[index], "arrival");
    if (index > 0 && sameLocation(arrival, visited)) return index;
    visited.push(...arrival);
  }

  return -1;
}

function findReturnStartIndex(segments = []) {
  if (!Array.isArray(segments) || segments.length < 2) return -1;

  const explicit = explicitReturnStart(segments);
  if (explicit > 0) return explicit;

  const startsAt = locationKeys(segments[0], "departure");
  const endsAt = locationKeys(segments[segments.length - 1], "arrival");
  if (!sameLocation(startsAt, endsAt)) return -1;

  const afterLongStay = longStayReturnStart(segments);
  if (afterLongStay > 0) return afterLongStay;

  return routeReturnStart(segments);
}

function applyJourneyDirections(data = {}) {
  const sourceSegments = Array.isArray(data.segments) ? data.segments : [];
  const returnStart = findReturnStartIndex(sourceSegments);
  const segments = sourceSegments.map((segment, index) => ({
    ...segment,
    journeyDirection: returnStart > 0 && index >= returnStart ? "return" : "departure"
  }));
  return { ...data, segments };
}

module.exports = {
  applyJourneyDirections,
  findReturnStartIndex
};
