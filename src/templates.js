const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOGO_PATH = path.join(ROOT, "public", "assets", "mk-logo.png");
const FONT_PATH = path.join(ROOT, "public", "assets", "UniSIRWAN Noor Regular.ttf");

const company = {
  name: "MK Business and Travel",
  address: "Grand Swiss Hotel, Ground Floor, Pirmam",
  phone: "07500229292"
};

const designs = new Set(["modern", "executive", "minimal"]);

const airportNotesKu = [
  "تکایە بەر لە کاتی فڕین بە کەمترین ٢ کاتژمێر لە فڕۆکەخانە ئامادە بن بۆ فڕینی ناوخۆیی.",
  "بۆ فڕینی دەرەوەی وڵات، باشترە ٣ تا ٤ کاتژمێر بەر لە فڕین لە فڕۆکەخانە ئامادە بن.",
  "ناسنامە، پاسپۆرت، ڤیزا یان هەر بەڵگەنامەیەکی پێویست لەگەڵ خۆتان هەڵبگرن.",
  "دڵنیا بن لەوەی ناوەکەتان لەسەر بلیت و بەڵگەنامەکان وەک یەک نووسراوە.",
  "ئاگاداری قەبارە و کێشی باری کابین و باری گەورە بن، چونکە زیادەبار لە فڕۆکەخانە پارەی زیادەی دەوێت.",
  "شتە گرنگەکان وەک پاسپۆرت، پارە، مۆبایل، چارچەر، دەرمان و بەڵگەنامەکان لە باری دەستی/کابین دابنێن.",
  "شتە قەدەغەکراوەکان وەک شتی تیژ، مایعاتی زۆر، سپرەی قەدەغەکراو و ماددەی مەترسیدار لە باری دەستی دانەنێن.",
  "دوای وەرگرتنی boarding pass، ژمارەی gate و کاتی داخستنی gate بە وردی بپشکنن.",
  "لە کاتی گەشتدا هەر کێشەیەک ڕوویدا، پەیوەندی بە MK Business and Travel بکەن.",
  "هەمیشە وێنەی بلیت و پاسپۆرت لە مۆبایلەکەتان هەڵبگرن."
];

const hotelNotesKu = [
  "تکایە لە کاتی check-in پاسپۆرت یان ناسنامەی فەرمی لەگەڵ خۆتان هەڵبگرن.",
  "کاتی check-in و check-out بە وردی بپشکنن و پێش کاتی دیاریکراو خۆتان ئامادە بکەن.",
  "هەندێک هۆتێل دەتوانن داوای پارەی زیادە بکەن وەک city tax، deposit، یان خزمەتگوزارییە زیادەکان.",
  "ئەگەر دوای کاتژمێر ٦ی ئێوارە دەگەنە هۆتێل، پێشتر بە هۆتێل یان ئێمە ئاگاداری بدەنەوە.",
  "هۆتێل دەتوانێت لە کاتی دواکردنەوە یان نەگەیشتن، بە پێی یاساکانی خۆی سزا یان no-show fee بسەپێنێت.",
  "تکایە ژمارەی ڕیزەرفەیشن و ناوی میوانەکان لەگەڵ بەڵگەنامەکاندا بپشکنن.",
  "شتە نرخدارەکانتان لە شوێنی پارێزراو دابنێن و ئاگاداری سامانەکەتان بن.",
  "بۆ هەر کێشەیەک لە check-in یان check-out، پەیوەندی بە MK Business and Travel بکەن."
];

function assetDataUri(filePath, mimeType) {
  if (!fs.existsSync(filePath)) return "";
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function display(value) {
  const text = String(value ?? "").trim();
  return escapeHtml(text || "Not specified");
}

function normalizeDesign(design) {
  return designs.has(design) ? design : "modern";
}

function listItems(items) {
  if (!items || !items.length) {
    return "<p class=\"muted\">Not specified</p>";
  }
  return `<ul>${items.map((item) => `<li>${display(item)}</li>`).join("")}</ul>`;
}

function buildFileName(name, reference) {
  const safePart = (value, fallback) => {
    const raw = String(value || "").trim();
    const text = raw && raw !== "Not specified" ? raw : fallback;
    return text
      .replace(/\s+/g, "_")
      .replace(/[^\p{L}\p{N}_-]+/gu, "")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || fallback;
  };

  return `${safePart(name, "Passenger")}_${safePart(reference, "Reference")}.html`;
}

function sharedStyles() {
  const fontData = assetDataUri(FONT_PATH, "font/ttf");
  return `
    @font-face {
      font-family: "UniSIRWAN Noor";
      src: url("${fontData}") format("truetype");
      font-weight: 400;
      font-style: normal;
    }
    @page {
      size: 210mm 297mm;
      margin: 0;
    }
    :root {
      --navy: #170C79;
      --teal: #8ACBD0;
      --cream: #EFE3CA;
      --ink: #172033;
      --muted: #657084;
      --line: #dce8ea;
    }
    * {
      box-sizing: border-box;
    }
    html,
    body {
      margin: 0;
      padding: 0;
      background: #eef4f5;
      color: var(--ink);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .page {
      position: relative;
      width: 210mm;
      height: 297mm;
      margin: 0 auto;
      padding: 15mm 16mm 13mm;
      background: #fff;
      overflow: hidden;
      break-after: page;
      page-break-after: always;
    }
    .page:last-child {
      break-after: auto;
      page-break-after: auto;
    }
    .page::before {
      content: "";
      position: absolute;
      inset: 0 0 auto 0;
      height: 9mm;
      background: linear-gradient(90deg, var(--navy), var(--teal));
    }
    .page::after {
      content: "";
      position: absolute;
      right: -28mm;
      bottom: -42mm;
      width: 105mm;
      height: 105mm;
      border-radius: 999px;
      background: rgba(239, 227, 202, 0.45);
      z-index: 0;
    }
    .content {
      position: relative;
      z-index: 1;
    }
    .brand {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding-top: 8mm;
      margin-bottom: 9mm;
    }
    .brand-main {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand img {
      width: 36mm;
      height: auto;
      display: block;
    }
    .company h1 {
      margin: 0 0 2mm;
      color: var(--navy);
      font-size: 22px;
      line-height: 1.1;
      font-weight: 800;
    }
    .company p {
      margin: 0;
      color: var(--muted);
      font-size: 11px;
    }
    .doc-title {
      text-align: right;
    }
    .doc-title h2 {
      margin: 0;
      color: var(--navy);
      font-size: 26px;
      line-height: 1.1;
      font-weight: 800;
    }
    .doc-title p {
      margin: 2mm 0 0;
      color: var(--muted);
      font-size: 11px;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 92mm);
      gap: 5mm;
      align-items: start;
      justify-content: start;
      margin-bottom: 5mm;
    }
    .summary-card,
    .soft-card {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: linear-gradient(180deg, #fff 0%, #fbfdfd 100%);
      padding: 3.5mm 4mm;
      box-shadow: 0 1px 0 rgba(23, 12, 121, 0.05);
    }
    .summary-card {
      border-left: 3px solid var(--teal);
    }
    .summary-card h3 {
      margin: 0 0 2mm;
      color: var(--navy);
      font-size: 13px;
      line-height: 1.2;
    }
    .section h3 {
      margin: 0 0 3mm;
      color: var(--navy);
      font-size: 15px;
      line-height: 1.2;
    }
    .reference {
      color: var(--navy);
      font-size: 21px;
      font-weight: 800;
      line-height: 1.1;
      word-break: break-word;
    }
    .label {
      color: var(--muted);
      font-size: 9.5px;
      text-transform: uppercase;
      font-weight: 700;
    }
    .soft-card strong {
      display: block;
      margin-top: 1mm;
      color: var(--ink);
      line-height: 1.25;
    }
    .soft-card p {
      margin: 2.5mm 0 0;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4mm;
    }
    .section {
      margin-top: 6mm;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: #fff;
    }
    th {
      background: rgba(138, 203, 208, 0.28);
      color: var(--navy);
      font-size: 10.5px;
      text-align: left;
      text-transform: uppercase;
      letter-spacing: 0;
      padding: 8px;
    }
    td {
      border-top: 1px solid var(--line);
      padding: 8px;
      vertical-align: top;
    }
    .detail-stack {
      display: grid;
      gap: 1.5mm;
    }
    .route {
      color: var(--navy);
      font-weight: 800;
    }
    .muted {
      color: var(--muted);
    }
    ul,
    ol {
      margin: 0;
      padding-left: 18px;
    }
    li {
      margin-bottom: 2mm;
    }
    .footer {
      position: absolute;
      left: 16mm;
      right: 16mm;
      bottom: 9mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid var(--line);
      padding-top: 3mm;
      color: var(--muted);
      font-size: 10.5px;
      z-index: 2;
    }
    .rtl {
      direction: rtl;
      text-align: right;
      font-family: "UniSIRWAN Noor", Tahoma, Arial, sans-serif;
      font-size: 14px;
    }
    .rtl .brand,
    .rtl .brand-main {
      direction: rtl;
    }
    .rtl .doc-title {
      text-align: left;
    }
    .rtl .hero {
      justify-content: end;
    }
    .rtl th,
    .rtl td {
      text-align: right;
    }
    .rtl ul,
    .rtl ol {
      padding-left: 0;
      padding-right: 22px;
    }
    .rtl .company h1,
    .rtl .doc-title h2,
    .rtl .summary-card h3,
    .rtl .section h3,
    .rtl .reference,
    .rtl .route {
      color: var(--navy);
    }
    .rtl .summary-card {
      border-left: 1px solid var(--line);
      border-right: 3px solid var(--teal);
    }
    body.design-executive {
      --navy: #12085f;
      --teal: #62bfc8;
      --cream: #f4ecd9;
      --ink: #101828;
      --muted: #5c6577;
      --line: #d8e5e8;
    }
    body.design-executive .page {
      padding-left: 19mm;
    }
    body.design-executive .page::before {
      inset: 0 auto 0 0;
      width: 8mm;
      height: 100%;
      background: linear-gradient(180deg, var(--navy), var(--teal));
    }
    body.design-executive .page::after {
      display: none;
    }
    body.design-executive .brand {
      padding-top: 0;
      padding-bottom: 5mm;
      border-bottom: 2px solid var(--teal);
      margin-bottom: 7mm;
    }
    body.design-executive .summary-card,
    body.design-executive .soft-card,
    body.design-executive table {
      border-radius: 4px;
    }
    body.design-executive th {
      background: var(--navy);
      color: #fff;
    }
    body.design-executive.rtl .page,
    body.design-executive .rtl.page {
      padding-left: 16mm;
      padding-right: 19mm;
    }
    body.design-executive .rtl.page::before {
      inset: 0 0 0 auto;
    }
    body.design-minimal {
      --navy: #170C79;
      --teal: #8ACBD0;
      --cream: #fbf6ec;
      --ink: #141827;
      --muted: #687386;
      --line: #e2eaec;
    }
    body.design-minimal .page {
      padding-top: 13mm;
    }
    body.design-minimal .page::before {
      height: 2mm;
      background: var(--teal);
    }
    body.design-minimal .page::after {
      display: none;
    }
    body.design-minimal .brand {
      padding-top: 4mm;
      margin-bottom: 7mm;
    }
    body.design-minimal .summary-card,
    body.design-minimal .soft-card {
      background: #fff;
      border-radius: 4px;
      box-shadow: none;
    }
    body.design-minimal table {
      border-radius: 4px;
    }
    body.design-minimal th {
      background: #f6fbfb;
      border-bottom: 2px solid var(--teal);
    }
    @media print {
      html,
      body {
        background: #fff;
        width: 210mm;
        height: 297mm;
      }
      .page {
        width: 210mm;
        height: 297mm;
        margin: 0;
        box-shadow: none;
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  `;
}

function brandHeader(title, meta = "") {
  const logoData = assetDataUri(LOGO_PATH, "image/png");
  return `
    <header class="brand">
      <div class="brand-main">
        <img src="${logoData}" alt="MK Business and Travel logo">
        <div class="company">
          <h1>${escapeHtml(company.name)}</h1>
          <p>${escapeHtml(company.address)}</p>
          <p>Phone: ${escapeHtml(company.phone)}</p>
        </div>
      </div>
      <div class="doc-title">
        <h2>${escapeHtml(title)}</h2>
        ${meta ? `<p>${escapeHtml(meta)}</p>` : ""}
      </div>
    </header>
  `;
}

function footer() {
  return "";
}

function flightSegmentRows(segments) {
  return segments.map((segment) => `
    <tr>
      <td>
        <strong>${display(segment.airline)}</strong><br>
        <span class="muted">${display(segment.flightNumber)} · ${display(segment.class)}</span>
      </td>
      <td>
        <div class="route">${display(segment.departureCity)} → ${display(segment.arrivalCity)}</div>
        <span class="muted">${display(segment.departureAirport)} → ${display(segment.arrivalAirport)}</span>
      </td>
      <td>${display(segment.departureDate)}<br><span class="muted">${display(segment.departureTime)}</span></td>
      <td>${display(segment.arrivalDate)}<br><span class="muted">${display(segment.arrivalTime)}</span></td>
      <td>${display(segment.duration)}</td>
    </tr>
  `).join("");
}

function flightKurdishRows(segments) {
  return segments.map((segment) => `
    <tr>
      <td>${display(segment.airline)}<br><span class="muted">${display(segment.flightNumber)}</span></td>
      <td><span class="route">${display(segment.departureCity)} ← ${display(segment.arrivalCity)}</span><br><span class="muted">${display(segment.departureAirport)} ← ${display(segment.arrivalAirport)}</span></td>
      <td>${display(segment.departureDate)}<br><span class="muted">${display(segment.departureTime)}</span></td>
      <td>${display(segment.arrivalDate)}<br><span class="muted">${display(segment.arrivalTime)}</span></td>
      <td>${display(segment.duration)}</td>
    </tr>
  `).join("");
}

function generateFlightHtml(data, design = "modern") {
  const designName = normalizeDesign(design);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Flight Itinerary - ${display(data.pnr)}</title>
  <style>${sharedStyles()}</style>
</head>
<body class="design-${designName}">
  <section class="page">
    <div class="content">
      ${brandHeader("Flight Itinerary", "English")}
      <div class="hero">
        <div class="summary-card">
          <h3>PNR / Booking Reference</h3>
          <div class="reference">${display(data.pnr)}</div>
        </div>
      </div>

      <div class="section">
        <h3>Passengers</h3>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Ticket Number</th>
              <th>Passenger Type</th>
            </tr>
          </thead>
          <tbody>
            ${data.passengers.map((passenger) => `
              <tr>
                <td>${display(passenger.fullName)}</td>
                <td>${display(passenger.ticketNumber)}</td>
                <td>${display(passenger.passengerType)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="section">
        <h3>Flight Details</h3>
        <table>
          <thead>
            <tr>
              <th>Airline / Flight</th>
              <th>Route</th>
              <th>Departure</th>
              <th>Arrival</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>${flightSegmentRows(data.segments)}</tbody>
        </table>
      </div>

      <div class="section grid-2">
        <div class="soft-card">
          <div class="label">Checked Baggage</div>
          <strong>${display(data.baggage?.checkedBaggage)}</strong>
        </div>
        <div class="soft-card">
          <div class="label">Cabin Baggage</div>
          <strong>${display(data.baggage?.cabinBaggage)}</strong>
        </div>
      </div>
    </div>
    ${footer()}
  </section>

  <section class="page rtl" lang="ckb">
    <div class="content">
      ${brandHeader("وردەکاری گەشت", "Kurdish Sorani")}
      <div class="hero">
        <div class="summary-card">
          <h3>PNR</h3>
          <div class="reference">${display(data.pnr)}</div>
        </div>
      </div>

      <div class="section">
        <h3>ناوی گەشتیاران</h3>
        <table>
          <thead>
            <tr>
              <th>ناو</th>
              <th>ژمارەی بلیت</th>
              <th>جۆری گەشتیار</th>
            </tr>
          </thead>
          <tbody>
            ${data.passengers.map((passenger) => `
              <tr>
                <td>${display(passenger.fullName)}</td>
                <td>${display(passenger.ticketNumber)}</td>
                <td>${display(passenger.passengerType)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="section">
        <h3>پوختەی فڕین</h3>
        <table>
          <thead>
            <tr>
              <th>فڕۆکەوانی / فڕین</th>
              <th>ڕێڕەو</th>
              <th>ڕۆیشتن</th>
              <th>گەیشتن</th>
              <th>ماوە</th>
            </tr>
          </thead>
          <tbody>${flightKurdishRows(data.segments)}</tbody>
        </table>
      </div>

      <div class="section grid-2">
        <div class="soft-card">
          <h3>وردەکاری بار</h3>
          <p><strong>باری گەورە:</strong> ${display(data.baggage?.checkedBaggage)}</p>
          <p><strong>باری کابین:</strong> ${display(data.baggage?.cabinBaggage)}</p>
        </div>
        <div class="soft-card">
          <h3>تێبینی بەڵگەنامە</h3>
          <p class="muted">تکایە وردەکارییەکان لەگەڵ بلیت و پاسپۆرت بەراورد بکەن.</p>
        </div>
      </div>

    </div>
    ${footer()}
  </section>

  <section class="page rtl" lang="ckb">
    <div class="content">
      ${brandHeader("تێبینی گرنگی فڕۆکەخانە", "Kurdish Sorani")}
      <div class="hero">
        <div class="summary-card">
          <h3>PNR</h3>
          <div class="reference">${display(data.pnr)}</div>
        </div>
      </div>

      <div class="section">
        <h3>تێبینی گرنگی فڕۆکەخانە</h3>
        <ol>${airportNotesKu.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ol>
      </div>

      <div class="section grid-2">
        <div class="soft-card">
          <h3>پەیوەندی</h3>
          <p><strong>${escapeHtml(company.name)}</strong></p>
          <p class="muted">${escapeHtml(company.phone)}</p>
        </div>
        <div class="soft-card">
          <h3>ناونیشان</h3>
          <p class="muted">${escapeHtml(company.address)}</p>
        </div>
      </div>
    </div>
    ${footer()}
  </section>
</body>
</html>`;
}

function generateHotelHtml(data, design = "modern") {
  const designName = normalizeDesign(design);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hotel Itinerary - ${display(data.referenceNumber)}</title>
  <style>${sharedStyles()}</style>
</head>
<body class="design-${designName}">
  <section class="page">
    <div class="content">
      ${brandHeader("Hotel Itinerary", "English")}
      <div class="hero">
        <div class="summary-card">
          <h3>Reservation / Reference Number</h3>
          <div class="reference">${display(data.referenceNumber)}</div>
        </div>
      </div>

      <div class="section">
        <h3>Guest Names</h3>
        <table>
          <thead><tr><th>Name</th></tr></thead>
          <tbody>
            ${data.guests.map((guest) => `<tr><td>${display(guest.fullName)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>

      <div class="section grid-2">
        <div class="soft-card">
          <h3>Hotel Details</h3>
          <p><strong>${display(data.hotelName)}</strong></p>
          <p>${display(data.hotelAddress)}</p>
          <p class="muted">Phone: ${display(data.hotelPhone)}</p>
        </div>
        <div class="soft-card">
          <h3>Stay Details</h3>
          <p><strong>Check-in:</strong> ${display(data.checkInDate)} · ${display(data.checkInTime)}</p>
          <p><strong>Check-out:</strong> ${display(data.checkOutDate)} · ${display(data.checkOutTime)}</p>
          <p><strong>Guests:</strong> ${display(data.numberOfGuests)}</p>
        </div>
      </div>

      <div class="section">
        <h3>Room and Meal Details</h3>
        <table>
          <thead>
            <tr>
              <th>Room Type</th>
              <th>Bedding</th>
              <th>Meal Type</th>
              <th>GPS / Location</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${display(data.roomType)}</td>
              <td>${display(data.bedding)}</td>
              <td>${display(data.mealType)}</td>
              <td>${display(data.gps)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    ${footer()}
  </section>

  <section class="page rtl" lang="ckb">
    <div class="content">
      ${brandHeader("وردەکاری هۆتێل", "Kurdish Sorani")}
      <div class="hero">
        <div class="summary-card">
          <h3>ژمارەی ڕیزەرفەیشن / Reference</h3>
          <div class="reference">${display(data.referenceNumber)}</div>
        </div>
      </div>

      <div class="section">
        <h3>ناوی میوانەکان</h3>
        <table>
          <thead><tr><th>ناو</th></tr></thead>
          <tbody>${data.guests.map((guest) => `<tr><td>${display(guest.fullName)}</td></tr>`).join("")}</tbody>
        </table>
      </div>

      <div class="section grid-2">
        <div class="soft-card">
          <h3>ناوی هۆتێل و ناونیشان</h3>
          <p><strong>${display(data.hotelName)}</strong></p>
          <p>${display(data.hotelAddress)}</p>
          <p class="muted">${display(data.hotelPhone)}</p>
        </div>
        <div class="soft-card">
          <h3>کاتی check-in و check-out</h3>
          <p><strong>check-in:</strong> ${display(data.checkInDate)} · ${display(data.checkInTime)}</p>
          <p><strong>check-out:</strong> ${display(data.checkOutDate)} · ${display(data.checkOutTime)}</p>
        </div>
      </div>

      <div class="section">
        <h3>جۆری ژوور</h3>
        <table>
          <thead>
            <tr>
              <th>جۆری ژوور</th>
              <th>جۆری جێگا</th>
              <th>جۆری خواردن ئەگەر هەبێت</th>
              <th>شوێن / GPS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${display(data.roomType)}</td>
              <td>${display(data.bedding)}</td>
              <td>${display(data.mealType)}</td>
              <td>${display(data.gps)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="section">
        <h3>تێبینی گرنگ</h3>
        <ol>${hotelNotesKu.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ol>
      </div>
    </div>
    ${footer()}
  </section>
</body>
</html>`;
}

module.exports = {
  generateFlightHtml,
  generateHotelHtml,
  buildFileName
};
