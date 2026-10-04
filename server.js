require("dotenv").config();

const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const {
  initDatabase,
  createFlightItinerary,
  updateFlightItinerary,
  getFlightItinerary,
  listFlightItineraries,
  deleteFlightItinerary,
  createHotelItinerary,
  updateHotelItinerary,
  getHotelItinerary,
  listHotelItineraries,
  deleteHotelItinerary,
  purgeExpiredItineraries,
  addGeneratedFile,
  createSmartTrip,
  deleteSmartTrip,
  getSmartTripById,
  getSmartTripByToken,
  listSmartTrips,
  purgeExpiredSmartTrips,
  updateSmartTrip
} = require("./src/db");
const {
  detectSmartTripDestination,
  extractDocument,
  extractPassportName,
  extractSmartTripHotel,
  extractText,
  generateSmartTripGuide,
  transliteratePassengerFirstName
} = require("./src/gemini");
const { enrichHotelData } = require("./src/hotel-enrichment");
const { bookingLinks, getSelection, searchAirports, searchFlights } = require("./src/ignav");
const { airlineLogo, normalizedCode, withAirlineLogos } = require("./src/airline-logos");
const { renderHtmlToPdf } = require("./src/pdf-generator");
const { enrichSightseeingImages } = require("./src/place-images");
const { normalizeFlightData, normalizeHotelData } = require("./src/schema");
const {
  calculateTripDayCount,
  calculateSmartTripExpiry,
  deriveSmartTripPrefill,
  flightSnapshot,
  normalizeSmartTripInput
} = require("./src/smart-trip");
const { generateExpiredSmartTripHtml, generateSmartTripHtml } = require("./src/smart-trip-template");
const {
  generateFlightHtml,
  generateFlightProposalHtml,
  generateHotelHtml,
  generateBoardingPassHtml,
  buildFileName
} = require("./src/templates");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, "uploads", "originals");
const OUTPUT_DIR = path.join(ROOT, "outputs");
const HTML_DIR = path.join(ROOT, "outputs", "html");
const PDF_DIR = path.join(ROOT, "outputs", "pdf");
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS || 7);
const PROPOSAL_RETENTION_DAYS = Number(process.env.PROPOSAL_RETENTION_DAYS || 15);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(HTML_DIR, { recursive: true });
fs.mkdirSync(PDF_DIR, { recursive: true });
initDatabase();

app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/assets", express.static(path.join(ROOT, "public", "assets")));
app.use("/vendor/flatpickr", express.static(path.join(ROOT, "node_modules", "flatpickr", "dist")));
app.use("/generated", express.static(HTML_DIR, {
  setHeaders(res) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
  }
}));
app.use("/generated-pdf", express.static(PDF_DIR, {
  setHeaders(res) {
    res.setHeader("Content-Type", "application/pdf");
  }
}));
app.use(express.static(path.join(ROOT, "public")));

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
]);
const allowedExtensions = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeBase = path
        .basename(file.originalname, ext)
        .replace(/[^\p{L}\p{N}_-]+/gu, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80) || "document";
      cb(null, `${Date.now()}-${safeBase}${ext}`);
    }
  }),
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(ext)) {
      cb(new Error("Upload must be a PDF, JPG, JPEG, PNG, or WebP file."));
      return;
    }
    cb(null, true);
  }
});

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function prepareSmartTripGuide(input, passengerName) {
  let guide = { passengerFirstNameKurdish: "", sightseeing: [], travelTip: "", miniPlan: [] };
  let sightseeingStatus = input.sightseeingRequested ? "unavailable" : "disabled";

  if (input.sightseeingRequested) {
    try {
      guide = await generateSmartTripGuide(
        input.destinationCity,
        input.destinationCountry,
        passengerName,
        {
          dayCount: input.tripDayCount,
          startDate: input.arrivalDate || input.departureDate,
          endDate: input.returnDate
        }
      );
      if (guide.sightseeing.length >= 5 && guide.miniPlan.length) {
        sightseeingStatus = "ready";
        guide.sightseeing = await enrichSightseeingImages(
          guide.sightseeing,
          [input.destinationCity, input.destinationCountry].filter(Boolean).join(" ")
        );
      } else {
        guide = { ...guide, sightseeing: [], travelTip: "", miniPlan: [] };
      }
    } catch (error) {
      console.error(`Smart Trip sightseeing unavailable: ${error.message}`);
    }
  }

  if (!guide.passengerFirstNameKurdish) {
    try {
      guide.passengerFirstNameKurdish = await transliteratePassengerFirstName(passengerName);
    } catch (error) {
      console.error(`Smart Trip Kurdish passenger name unavailable: ${error.message}`);
    }
  }

  return { guide, sightseeingStatus };
}

function itineraryHtml(type, itinerary, design = "modern") {
  return type === "flight" ? generateFlightHtml(itinerary, design) : generateHotelHtml(itinerary, design);
}

function primaryName(type, itinerary) {
  return type === "flight" ? itinerary.passengers?.[0]?.fullName : itinerary.guests?.[0]?.fullName;
}

function referenceFor(type, itinerary) {
  return type === "flight" ? itinerary.pnr : itinerary.referenceNumber;
}

function saveHtmlFile(type, itinerary, design = "modern") {
  const html = itineraryHtml(type, itinerary, design);
  const fileName = type === "flight"
    ? buildFileName(primaryName(type, itinerary), referenceFor(type, itinerary))
    : buildFileName(primaryName(type, itinerary), referenceFor(type, itinerary));
  const filePath = path.join(HTML_DIR, fileName);

  fs.writeFileSync(filePath, html, "utf8");
  addGeneratedFile({
    itineraryType: type,
    itineraryId: itinerary.id,
    fileName,
    filePath,
    fileKind: "itinerary-html"
  });

  return {
    fileName,
    url: `/generated/${encodeURIComponent(fileName)}`
  };
}

async function savePdfFile(type, itinerary, design = "modern") {
  const html = itineraryHtml(type, itinerary, design);
  const fileName = buildFileName(primaryName(type, itinerary), referenceFor(type, itinerary), "pdf");
  const filePath = path.join(PDF_DIR, fileName);
  await renderHtmlToPdf(html, filePath);
  addGeneratedFile({
    itineraryType: type,
    itineraryId: itinerary.id,
    fileName,
    filePath,
    fileKind: "itinerary-pdf"
  });
  return {
    fileName,
    url: `/generated-pdf/${encodeURIComponent(fileName)}`
  };
}

function proposalReference() {
  return `MKQ-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function passengerName(value) {
  const name = String(value || "")
    .replace(/[^\p{L}\p{M}' -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (name.length < 2 || name === "Not specified") {
    throw new Error("Please enter or extract the passenger name.");
  }
  return name;
}

function manualBookingIdentifier(value, label, maxLength) {
  const identifier = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, maxLength);
  if (identifier && !/^[A-Z0-9][A-Z0-9 /-]*$/.test(identifier)) {
    throw new Error(`${label} may contain only letters, numbers, spaces, hyphens, or slashes.`);
  }
  return identifier;
}

async function saveFlightProposalFiles(proposal, design = "modern") {
  const html = generateFlightProposalHtml(proposal, design);
  const htmlName = buildFileName(proposal.passengerName, proposal.reference, "html", "Flight_Proposal");
  const pdfName = buildFileName(proposal.passengerName, proposal.reference, "pdf", "Flight_Proposal");
  const htmlPath = path.join(HTML_DIR, htmlName);
  const pdfPath = path.join(PDF_DIR, pdfName);

  try {
    fs.writeFileSync(htmlPath, html, "utf8");
    await renderHtmlToPdf(html, pdfPath);
  } catch (error) {
    deleteGeneratedFile(htmlPath);
    deleteGeneratedFile(pdfPath);
    throw error;
  }

  return {
    reference: proposal.reference,
    html: { fileName: htmlName, url: `/generated/${encodeURIComponent(htmlName)}` },
    pdf: { fileName: pdfName, url: `/generated-pdf/${encodeURIComponent(pdfName)}` }
  };
}

async function saveBoardingPassFile(itinerary) {
  const passes = [];
  for (const segment of itinerary.segments || []) {
    for (const passenger of itinerary.passengers || []) {
      const qrPayload = JSON.stringify({
        notice: "MK travel summary - not valid for boarding",
        pnr: itinerary.pnr,
        passenger: passenger.fullName,
        ticketNumber: passenger.ticketNumber,
        flight: `${segment.airline} ${segment.flightNumber}`.trim(),
        from: segment.departureAirport,
        to: segment.arrivalAirport,
        date: segment.departureDate,
        departureTime: segment.departureTime
      });
      const qrDataUri = await QRCode.toDataURL(qrPayload, {
        width: 260,
        margin: 1,
        color: { dark: "#170C79", light: "#FFFFFF" }
      });
      passes.push({ passenger, segment, qrDataUri });
    }
  }

  const html = generateBoardingPassHtml(itinerary, passes);
  const fileName = buildFileName(
    itinerary.passengers?.[0]?.fullName,
    itinerary.pnr,
    "html",
    "Boarding_Pass"
  );
  const filePath = path.join(HTML_DIR, fileName);
  fs.writeFileSync(filePath, html, "utf8");
  addGeneratedFile({
    itineraryType: "flight",
    itineraryId: itinerary.id,
    fileName,
    filePath,
    fileKind: "boarding-pass-html"
  });
  return {
    fileName,
    url: `/generated/${encodeURIComponent(fileName)}`
  };
}

function deleteGeneratedFile(filePath) {
  deleteLocalFile(filePath, OUTPUT_DIR);
}

function deleteSourceFile(filePath) {
  deleteLocalFile(filePath, UPLOAD_DIR);
}

function deleteLocalFile(filePath, allowedDir) {
  if (!filePath) return;
  const absolutePath = path.resolve(filePath);
  if (absolutePath !== allowedDir && !absolutePath.startsWith(`${allowedDir}${path.sep}`)) return;
  if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
}

function cleanupOldOriginalUploads() {
  const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  if (!fs.existsSync(UPLOAD_DIR)) return 0;

  let removed = 0;
  for (const entry of fs.readdirSync(UPLOAD_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const filePath = path.join(UPLOAD_DIR, entry.name);
    const stats = fs.statSync(filePath);
    if (stats.mtimeMs < cutoffMs) {
      deleteSourceFile(filePath);
      removed += 1;
    }
  }
  return removed;
}

function cleanupOldFilesIn(directory) {
  if (!fs.existsSync(directory)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const filePath = path.join(directory, entry.name);
    const retentionDays = /_Flight_Proposal\.(?:html|pdf)$/i.test(entry.name)
      ? PROPOSAL_RETENTION_DAYS
      : RETENTION_DAYS;
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    if (fs.statSync(filePath).mtimeMs < cutoffMs) {
      deleteGeneratedFile(filePath);
      removed += 1;
    }
  }
  return removed;
}

function runExpiredCleanup() {
  try {
    const result = purgeExpiredItineraries(RETENTION_DAYS);
    const expiredSmartTrips = purgeExpiredSmartTrips();
    const generatedFiles = [...new Set(result.generatedFiles)];
    const sourceFiles = [...new Set(result.sourceFiles)];
    generatedFiles.forEach(deleteGeneratedFile);
    sourceFiles.forEach(deleteSourceFile);
    const oldOriginalUploads = cleanupOldOriginalUploads();
    const oldUntrackedOutputs = cleanupOldFilesIn(HTML_DIR) + cleanupOldFilesIn(PDF_DIR);

    const removedRecords = result.flightCount + result.hotelCount;
    if (removedRecords || expiredSmartTrips || generatedFiles.length || sourceFiles.length || oldOriginalUploads || oldUntrackedOutputs) {
      console.log(
        `Cleanup removed ${removedRecords} records, ${expiredSmartTrips} Smart Trips, ${generatedFiles.length + oldUntrackedOutputs} generated files, ${sourceFiles.length + oldOriginalUploads} original uploads.`
      );
    }
  } catch (error) {
    console.error(`Cleanup failed: ${error.message}`);
  }
}

runExpiredCleanup();
setInterval(runExpiredCleanup, 24 * 60 * 60 * 1000);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/smart-trip/:token", (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const token = String(req.params.token || "");
  const trip = /^[A-Za-z0-9_-]{20,80}$/.test(token) ? getSmartTripByToken(token) : null;
  if (!trip || Date.parse(trip.expiresAt) <= Date.now()) {
    res.status(410).type("html").send(generateExpiredSmartTripHtml());
    return;
  }
  res.type("html").send(generateSmartTripHtml(trip));
});

app.get("/smart-trip/:token/pdf", asyncRoute(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const token = String(req.params.token || "");
  const trip = /^[A-Za-z0-9_-]{20,80}$/.test(token) ? getSmartTripByToken(token) : null;
  if (!trip || Date.parse(trip.expiresAt) <= Date.now()) {
    res.status(410).json({ error: "This Smart Trip link has expired or is no longer available." });
    return;
  }

  const forwardedProtocol = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const baseUrl = `${forwardedProtocol || req.protocol}://${req.get("host")}`;
  const fileName = buildFileName(trip.passengerName, trip.destinationCity, "pdf", "Smart_Trip");
  const filePath = path.join(PDF_DIR, `${crypto.randomBytes(8).toString("hex")}-${fileName}`);
  try {
    await renderHtmlToPdf(generateSmartTripHtml(trip, { baseUrl, printMode: true }), filePath);
    res.download(filePath, fileName, (downloadError) => {
      deleteGeneratedFile(filePath);
      if (downloadError && !res.headersSent) {
        res.status(500).json({ error: "The Smart Trip PDF could not be downloaded." });
      }
    });
  } catch (error) {
    deleteGeneratedFile(filePath);
    throw error;
  }
}));

app.get("/api/smart-trips", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const records = listSmartTrips().map((trip) => ({
    id: trip.id,
    passengerName: trip.passengerName,
    destinationCity: trip.destinationCity,
    destinationCountry: trip.destinationCountry,
    url: `/smart-trip/${trip.token}`,
    pdfUrl: `/smart-trip/${trip.token}/pdf`,
    tripDayCount: calculateTripDayCount(
      trip.flight?.segments?.findLast?.((segment) => segment.journeyDirection !== "return")?.arrivalDate || trip.departureDate,
      trip.returnDate,
      trip.hotels
    ),
    createdAt: trip.createdAt,
    expiresAt: trip.expiresAt,
    sightseeingStatus: trip.sightseeingStatus
  }));
  res.json({ records });
});

app.delete("/api/smart-trips/:id", (req, res) => {
  const deleted = deleteSmartTrip(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ error: "Smart Trip link not found." });
    return;
  }
  res.json({ ok: true });
});

app.post("/api/smart-trips/:id/update-ticket", upload.single("document"), asyncRoute(async (req, res) => {
  const trip = getSmartTripById(Number(req.params.id));
  if (!trip) {
    res.status(404).json({ error: "Smart Trip link not found." });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "Please upload the replacement ticket PDF or image first." });
    return;
  }

  try {
    const record = await extractDocument("flight", {
      path: req.file.path,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname
    });
    const prefill = deriveSmartTripPrefill(record);
    let detected = {
      city: prefill.destinationCity || trip.destinationCity,
      country: trip.destinationCountry
    };
    try {
      detected = await detectSmartTripDestination(record, detected.city);
    } catch (error) {
      console.error(`Replacement ticket destination confirmation unavailable: ${error.message}`);
    }

    const newDestination = detected.city || prefill.destinationCity || trip.destinationCity;
    const sameDestination = newDestination.localeCompare(trip.destinationCity, undefined, { sensitivity: "base" }) === 0;
    const input = normalizeSmartTripInput({
      destinationCity: newDestination,
      destinationCountry: detected.country || (sameDestination ? trip.destinationCountry : ""),
      customerWhatsapp: trip.customerWhatsapp,
      notes: trip.notes,
      sightseeingRequested: trip.sightseeingRequested,
      hotels: sameDestination ? trip.hotels : []
    }, prefill);
    const passengerName = prefill.passengerName || trip.passengerName;
    const { guide, sightseeingStatus } = await prepareSmartTripGuide(input, passengerName);
    const updated = updateSmartTrip(trip.id, {
      passengerName,
      passengerFirstNameKurdish: guide.passengerFirstNameKurdish,
      destinationCity: input.destinationCity,
      destinationCountry: input.destinationCountry,
      customerWhatsapp: trip.customerWhatsapp,
      notes: trip.notes,
      departureDate: input.departureDate,
      departureTime: prefill.departureTime,
      returnDate: input.returnDate,
      flight: flightSnapshot(record),
      hotels: input.hotels,
      sightseeingRequested: input.sightseeingRequested,
      sightseeingStatus,
      sightseeing: guide.sightseeing,
      travelTip: guide.travelTip,
      miniPlan: guide.miniPlan,
      expiresAt: calculateSmartTripExpiry(input.returnDate, input.hotels, input.departureDate)
    });
    res.json({
      smartTrip: {
        id: updated.id,
        url: `/smart-trip/${updated.token}`,
        pdfUrl: `/smart-trip/${updated.token}/pdf`,
        passengerName: updated.passengerName,
        destinationCity: updated.destinationCity,
        destinationCountry: updated.destinationCountry,
        tripDayCount: input.tripDayCount,
        expiresAt: updated.expiresAt
      }
    });
  } finally {
    deleteSourceFile(req.file.path);
  }
}));

app.post("/api/process/:type", upload.single("document"), asyncRoute(async (req, res) => {
  const type = req.params.type;
  if (type !== "flight" && type !== "hotel") {
    res.status(400).json({ error: "Unknown document type." });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "Please upload a PDF or image first." });
    return;
  }

  let data = await extractDocument(type, {
    path: req.file.path,
    mimetype: req.file.mimetype,
    originalname: req.file.originalname
  });

  if (type === "hotel") {
    data = normalizeHotelData(await enrichHotelData(data));
  }

  res.json({
    data,
    sourceFile: req.file.path
  });
}));

app.post("/api/smart-trip/hotel-extract", upload.single("hotel"), asyncRoute(async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Please upload a hotel PDF or image first." });
    return;
  }

  try {
    const hotel = await extractSmartTripHotel({
      path: req.file.path,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname
    });
    res.json({ hotel });
  } finally {
    deleteSourceFile(req.file.path);
  }
}));

app.post("/api/process-text/:type", asyncRoute(async (req, res) => {
  const type = req.params.type;
  if (type !== "flight" && type !== "hotel") {
    res.status(400).json({ error: "Unknown document type." });
    return;
  }

  let data = await extractText(type, req.body?.text);
  if (type === "hotel") {
    data = normalizeHotelData(await enrichHotelData(data));
  }

  res.json({ data, sourceFile: "" });
}));

app.get("/api/flight-search/airports", asyncRoute(async (req, res) => {
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.json({ airports: await searchAirports(req.query.q) });
}));

app.get("/api/airline-logo/:code", asyncRoute(async (req, res) => {
  const code = normalizedCode(req.params.code);
  if (!code) {
    res.status(400).end();
    return;
  }
  const logo = await airlineLogo(code);
  if (!logo) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", logo.mimeType);
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  res.send(logo.buffer);
}));

app.post("/api/flight-search", asyncRoute(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await searchFlights(req.body));
}));

app.post("/api/flight-search/booking-links", asyncRoute(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const links = await bookingLinks(req.body?.searchId, req.body?.resultIndex);
  res.json({ links });
}));

app.post("/api/passport-name", upload.single("passport"), asyncRoute(async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Please upload a passport image or PDF first." });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  try {
    const data = await extractPassportName({
      path: req.file.path,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname
    });
    res.json(data);
  } finally {
    deleteSourceFile(req.file.path);
  }
}));

app.post("/api/flight-proposals/generate", asyncRoute(async (req, res) => {
  const selection = getSelection(req.body?.searchId, req.body?.resultIndex);
  const proposal = {
    reference: proposalReference(),
    passengerName: passengerName(req.body?.passengerName),
    airlinePnr: manualBookingIdentifier(req.body?.airlinePnr, "Airline PNR", 20),
    ticketNumber: manualBookingIdentifier(req.body?.ticketNumber, "Ticket number", 30),
    tripType: selection.entry.tripType,
    cabinClass: selection.itinerary.cabinClass,
    bags: selection.itinerary.bags,
    passengers: selection.entry.passengers,
    outbound: selection.itinerary.outbound,
    inbound: selection.itinerary.inbound
  };
  const generated = await saveFlightProposalFiles(await withAirlineLogos(proposal), req.body?.design || "modern");
  res.json({ generated });
}));

app.post("/api/hotel-enrich", asyncRoute(async (req, res) => {
  const normalized = normalizeHotelData(req.body?.data || {});
  const data = normalizeHotelData(await enrichHotelData(normalized));
  res.json({ data });
}));

app.get("/api/flight-itineraries", (req, res) => {
  res.json({ records: listFlightItineraries(String(req.query.search || "")) });
});

app.post("/api/flight-itineraries", (req, res) => {
  const record = createFlightItinerary(normalizeFlightData(req.body.data), req.body.sourceFile || "");
  res.status(201).json({ record });
});

app.get("/api/flight-itineraries/:id", (req, res) => {
  const record = getFlightItinerary(Number(req.params.id));
  if (!record) {
    res.status(404).json({ error: "Flight itinerary not found." });
    return;
  }
  res.json({ record });
});

app.put("/api/flight-itineraries/:id", (req, res) => {
  const record = updateFlightItinerary(Number(req.params.id), normalizeFlightData(req.body.data), req.body.sourceFile || "");
  res.json({ record });
});

app.post("/api/flight-itineraries/:id/generate", asyncRoute(async (req, res) => {
  const record = getFlightItinerary(Number(req.params.id));
  if (!record) {
    res.status(404).json({ error: "Flight itinerary not found." });
    return;
  }
  const generated = saveHtmlFile("flight", await withAirlineLogos(record), req.body?.design || "modern");
  res.json({ generated });
}));

app.post("/api/flight-itineraries/:id/generate-pdf", asyncRoute(async (req, res) => {
  const record = getFlightItinerary(Number(req.params.id));
  if (!record) {
    res.status(404).json({ error: "Flight itinerary not found." });
    return;
  }
  const generated = await savePdfFile("flight", await withAirlineLogos(record), req.body?.design || "modern");
  res.json({ generated });
}));

app.post("/api/flight-itineraries/:id/generate-boarding-pass", asyncRoute(async (req, res) => {
  const record = getFlightItinerary(Number(req.params.id));
  if (!record) {
    res.status(404).json({ error: "Flight itinerary not found." });
    return;
  }
  const generated = await saveBoardingPassFile(record);
  res.json({ generated });
}));

app.get("/api/flight-itineraries/:id/smart-trip-preview", asyncRoute(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const record = getFlightItinerary(Number(req.params.id));
  if (!record) {
    res.status(404).json({ error: "Flight itinerary not found." });
    return;
  }
  if (!record.generated && !record.generatedPdf) {
    res.status(400).json({ error: "Generate the ticket HTML or PDF before making a Smart Trip." });
    return;
  }

  const prefill = deriveSmartTripPrefill(record);
  let detection = { status: "fallback", message: "Please confirm the destination city." };
  try {
    const detected = await detectSmartTripDestination(record, prefill.destinationCity);
    prefill.destinationCity = detected.city || prefill.destinationCity;
    prefill.destinationCountry = detected.country || "";
    prefill.needsConfirmation = !detected.confident;
    detection = {
      status: detected.confident ? "confirmed" : "review",
      message: detected.confident ? "Destination detected from the ticket." : "Please confirm the detected destination."
    };
  } catch (error) {
    detection.message = "AI destination confirmation is unavailable. Please confirm the destination manually.";
  }
  res.json({ prefill, detection });
}));

app.post("/api/flight-itineraries/:id/smart-trips", asyncRoute(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const record = getFlightItinerary(Number(req.params.id));
  if (!record) {
    res.status(404).json({ error: "Flight itinerary not found." });
    return;
  }
  if (!record.generated && !record.generatedPdf) {
    res.status(400).json({ error: "Generate the ticket HTML or PDF before making a Smart Trip." });
    return;
  }

  const prefill = deriveSmartTripPrefill(record);
  const input = normalizeSmartTripInput(req.body, prefill);
  const { guide, sightseeingStatus } = await prepareSmartTripGuide(input, prefill.passengerName);

  const trip = createSmartTrip({
    token: crypto.randomBytes(24).toString("base64url"),
    flightItineraryId: record.id,
    passengerName: prefill.passengerName,
    passengerFirstNameKurdish: guide.passengerFirstNameKurdish,
    destinationCity: input.destinationCity,
    destinationCountry: input.destinationCountry,
    customerWhatsapp: input.customerWhatsapp,
    notes: input.notes,
    departureDate: input.departureDate,
    departureTime: prefill.departureTime,
    returnDate: input.returnDate,
    flight: flightSnapshot(record),
    hotels: input.hotels,
    sightseeingRequested: input.sightseeingRequested,
    sightseeingStatus,
    sightseeing: guide.sightseeing,
    travelTip: guide.travelTip,
    miniPlan: guide.miniPlan,
    expiresAt: calculateSmartTripExpiry(input.returnDate, input.hotels, input.departureDate)
  });
  res.status(201).json({
    smartTrip: {
      url: `/smart-trip/${trip.token}`,
      expiresAt: trip.expiresAt,
      sightseeingStatus: trip.sightseeingStatus
    }
  });
}));

app.delete("/api/flight-itineraries/:id", (req, res) => {
  const removedFiles = deleteFlightItinerary(Number(req.params.id));
  removedFiles.generatedFiles.forEach(deleteGeneratedFile);
  removedFiles.sourceFiles.forEach(deleteSourceFile);
  res.json({ ok: true });
});

app.get("/api/hotel-itineraries", (req, res) => {
  res.json({ records: listHotelItineraries(String(req.query.search || "")) });
});

app.post("/api/hotel-itineraries", (req, res) => {
  const record = createHotelItinerary(normalizeHotelData(req.body.data), req.body.sourceFile || "");
  res.status(201).json({ record });
});

app.get("/api/hotel-itineraries/:id", (req, res) => {
  const record = getHotelItinerary(Number(req.params.id));
  if (!record) {
    res.status(404).json({ error: "Hotel itinerary not found." });
    return;
  }
  res.json({ record });
});

app.put("/api/hotel-itineraries/:id", (req, res) => {
  const record = updateHotelItinerary(Number(req.params.id), normalizeHotelData(req.body.data), req.body.sourceFile || "");
  res.json({ record });
});

app.post("/api/hotel-itineraries/:id/generate", (req, res) => {
  const record = getHotelItinerary(Number(req.params.id));
  if (!record) {
    res.status(404).json({ error: "Hotel itinerary not found." });
    return;
  }
  const generated = saveHtmlFile("hotel", record, req.body?.design || "modern");
  res.json({ generated });
});

app.post("/api/hotel-itineraries/:id/generate-pdf", asyncRoute(async (req, res) => {
  const record = getHotelItinerary(Number(req.params.id));
  if (!record) {
    res.status(404).json({ error: "Hotel itinerary not found." });
    return;
  }
  const generated = await savePdfFile("hotel", record, req.body?.design || "modern");
  res.json({ generated });
}));

app.delete("/api/hotel-itineraries/:id", (req, res) => {
  const removedFiles = deleteHotelItinerary(Number(req.params.id));
  removedFiles.generatedFiles.forEach(deleteGeneratedFile);
  removedFiles.sourceFiles.forEach(deleteSourceFile);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  const message = err.message || "Something went wrong.";
  const status = /GEMINI_API_KEY|Upload|Please|must be|cannot be|must be different|expired|no longer available/i.test(message)
    ? 400
    : 500;
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`MK Business and Travel app running at http://localhost:${PORT}`);
});
