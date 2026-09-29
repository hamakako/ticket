const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOGO_DIR = path.join(ROOT, "public", "assets", "airlines");
const LOGO_SOURCE = "https://www.gstatic.com/flights/airline_logos/70px";
const memoryCache = new Map();

const airlineCodes = new Map([
  ["turkish airlines", "TK"],
  ["ajet", "VF"],
  ["pegasus", "PC"],
  ["pegasus airlines", "PC"],
  ["iraqi airways", "IA"],
  ["qatar airways", "QR"],
  ["emirates", "EK"],
  ["flydubai", "FZ"],
  ["air arabia", "G9"],
  ["royal jordanian", "RJ"],
  ["lufthansa", "LH"],
  ["british airways", "BA"],
  ["air france", "AF"],
  ["klm", "KL"],
  ["egyptair", "MS"],
  ["saudia", "SV"],
  ["etihad airways", "EY"],
  ["kuwait airways", "KU"]
]);

fs.mkdirSync(LOGO_DIR, { recursive: true });

function normalizedCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9]{2,3}$/.test(code) ? code : "";
}

function carrierCodeFor(segment = {}) {
  const direct = normalizedCode(segment.carrierCode);
  if (direct) return direct;

  const flightNumber = String(segment.flightNumber || "").trim().toUpperCase();
  const separatedMatch = flightNumber.match(/^([A-Z0-9]{2,3})(?:\s*[-/]\s*|\s+)\d/);
  const compactIataMatch = flightNumber.match(/^([A-Z][A-Z0-9]|[0-9][A-Z])\d/);
  const compactIcaoMatch = flightNumber.match(/^([A-Z]{3})\d/);
  const flightCode = separatedMatch?.[1] || compactIataMatch?.[1] || compactIcaoMatch?.[1] || "";
  if (/[A-Z]/.test(flightCode)) return normalizedCode(flightCode);

  return airlineCodes.get(String(segment.airline || "").trim().toLowerCase()) || "";
}

async function airlineLogo(code) {
  const safeCode = normalizedCode(code);
  if (!safeCode) return null;
  if (memoryCache.has(safeCode)) return memoryCache.get(safeCode);

  const filePath = path.join(LOGO_DIR, `${safeCode}.png`);
  if (fs.existsSync(filePath)) {
    const logo = { buffer: fs.readFileSync(filePath), mimeType: "image/png" };
    memoryCache.set(safeCode, logo);
    return logo;
  }

  try {
    const response = await fetch(`${LOGO_SOURCE}/${encodeURIComponent(safeCode)}.png`, {
      signal: AbortSignal.timeout(8000)
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.startsWith("image/")) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 500 * 1024) return null;
    fs.writeFileSync(filePath, buffer);
    const logo = { buffer, mimeType: contentType.split(";")[0] || "image/png" };
    memoryCache.set(safeCode, logo);
    return logo;
  } catch {
    return null;
  }
}

async function airlineLogoDataUri(code) {
  const logo = await airlineLogo(code);
  return logo ? `data:${logo.mimeType};base64,${logo.buffer.toString("base64")}` : "";
}

async function withAirlineLogos(data) {
  const copy = structuredClone(data);
  const segmentGroups = [copy.segments, copy.outbound?.segments, copy.inbound?.segments]
    .filter(Array.isArray);

  await Promise.all(segmentGroups.flat().map(async (segment) => {
    const code = carrierCodeFor(segment);
    segment.carrierCode = segment.carrierCode || code;
    segment.airlineLogo = await airlineLogoDataUri(code);
  }));

  return copy;
}

module.exports = {
  airlineLogo,
  carrierCodeFor,
  normalizedCode,
  withAirlineLogos
};
