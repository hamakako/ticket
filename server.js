require("dotenv").config();

const express = require("express");
const multer = require("multer");
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
  addGeneratedFile
} = require("./src/db");
const { extractDocument } = require("./src/gemini");
const { enrichHotelData } = require("./src/hotel-enrichment");
const { renderHtmlToPdf } = require("./src/pdf-generator");
const { normalizeFlightData, normalizeHotelData } = require("./src/schema");
const {
  generateFlightHtml,
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

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(HTML_DIR, { recursive: true });
fs.mkdirSync(PDF_DIR, { recursive: true });
initDatabase();

app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/assets", express.static(path.join(ROOT, "public", "assets")));
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

function runExpiredCleanup() {
  try {
    const result = purgeExpiredItineraries(RETENTION_DAYS);
    const generatedFiles = [...new Set(result.generatedFiles)];
    const sourceFiles = [...new Set(result.sourceFiles)];
    generatedFiles.forEach(deleteGeneratedFile);
    sourceFiles.forEach(deleteSourceFile);
    const oldOriginalUploads = cleanupOldOriginalUploads();

    const removedRecords = result.flightCount + result.hotelCount;
    if (removedRecords || generatedFiles.length || sourceFiles.length || oldOriginalUploads) {
      console.log(
        `Cleanup removed ${removedRecords} records, ${generatedFiles.length} generated files, ${sourceFiles.length + oldOriginalUploads} original uploads.`
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

app.post("/api/flight-itineraries/:id/generate", (req, res) => {
  const record = getFlightItinerary(Number(req.params.id));
  if (!record) {
    res.status(404).json({ error: "Flight itinerary not found." });
    return;
  }
  const generated = saveHtmlFile("flight", record, req.body?.design || "modern");
  res.json({ generated });
});

app.post("/api/flight-itineraries/:id/generate-pdf", asyncRoute(async (req, res) => {
  const record = getFlightItinerary(Number(req.params.id));
  if (!record) {
    res.status(404).json({ error: "Flight itinerary not found." });
    return;
  }
  const generated = await savePdfFile("flight", record, req.body?.design || "modern");
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
  const status = message.includes("GEMINI_API_KEY") || message.includes("Upload") ? 400 : 500;
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`MK Business and Travel app running at http://localhost:${PORT}`);
});
