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

function dataUri(filePath, mimeType) {
  return fs.existsSync(filePath) ? `data:${mimeType};base64,${fs.readFileSync(filePath).toString("base64")}` : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function meaningful(value) {
  const text = String(value || "").trim();
  return text && text !== "Not specified" ? text : "";
}

function display(value, fallback = "Not specified") {
  return escapeHtml(meaningful(value) || fallback);
}

function formatPrice(amount, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: currency === "IQD" ? 0 : 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function routeSummary(itinerary) {
  const segments = itinerary.segments || [];
  const first = segments[0] || {};
  const last = segments.at(-1) || {};
  return [
    meaningful(first.departureAirport) || meaningful(first.departureCity),
    meaningful(last.arrivalAirport) || meaningful(last.arrivalCity)
  ].filter(Boolean).join(" → ") || "Route not specified";
}

function airlinesSummary(itinerary) {
  return [...new Set((itinerary.segments || []).map((segment) => meaningful(segment.airline)).filter(Boolean))].join(" / ") || "Airline not specified";
}

function datesSummary(itinerary) {
  const segments = itinerary.segments || [];
  const first = meaningful(segments[0]?.departureDate);
  const last = meaningful(segments.at(-1)?.arrivalDate);
  if (!first) return "Date not specified";
  return last && last !== first ? `${first} – ${last}` : first;
}

function cabinSummary(itinerary) {
  return [...new Set((itinerary.segments || []).map((segment) => meaningful(segment.class)).filter(Boolean))].join(" / ") || "Not specified";
}

function brandHeader(subtitle) {
  return `<header class="brand">
    <div class="brand-main">
      <img src="${dataUri(LOGO_PATH, "image/png")}" alt="MK Business and Travel logo">
      <div><h1>${company.name}</h1><p>${company.address}</p><p>${company.phone}</p></div>
    </div>
    <div class="document-mark"><strong>FLIGHT QUOTATION</strong><span>${escapeHtml(subtitle)}</span></div>
  </header>`;
}

function footer(reference) {
  return `<footer><span>${company.name} · ${company.phone}</span><span>Quotation ${escapeHtml(reference)}</span></footer>`;
}

function summaryPage(quote) {
  return `<section class="page summary-page">
    <div class="content">
      ${brandHeader("Customer ticket prices")}
      <div class="hero">
        <div><span>PREPARED FOR</span><h2>${escapeHtml(quote.customerName)}</h2><p>Carefully selected flight options for your journey.</p></div>
        <div class="quote-meta"><span>QUOTATION</span><strong>${escapeHtml(quote.reference)}</strong><span>PREPARED</span><strong>${escapeHtml(quote.preparedAt)}</strong></div>
      </div>
      <div class="section-heading"><span>COMPARISON</span><h3>Available Flight Options</h3></div>
      <div class="comparison">
        ${quote.options.map((option, index) => `<article>
          <span class="number">${String(index + 1).padStart(2, "0")}</span>
          <div class="comparison-main"><h4>${escapeHtml(option.title)}</h4><p>${escapeHtml(airlinesSummary(option.itinerary))}</p><strong>${escapeHtml(routeSummary(option.itinerary))}</strong><small>${escapeHtml(datesSummary(option.itinerary))} · ${escapeHtml(cabinSummary(option.itinerary))}</small></div>
          <div class="comparison-price"><span>${escapeHtml(option.currency)}</span><strong>${escapeHtml(formatPrice(option.price, option.currency))}</strong></div>
        </article>`).join("")}
      </div>
      <div class="notice"><strong>Important:</strong> Prices and seats are subject to availability and can change until the reservation is confirmed and ticketed.</div>
    </div>
    ${footer(quote.reference)}
  </section>`;
}

function airlineIdentity(segment) {
  const airline = meaningful(segment.airline) || "Airline";
  return `<div class="airline">
    ${segment.airlineLogo ? `<img src="${escapeHtml(segment.airlineLogo)}" alt="${escapeHtml(airline)} logo">` : `<span>${escapeHtml((meaningful(segment.carrierCode) || airline).slice(0, 2).toUpperCase())}</span>`}
    <div><strong>${escapeHtml(airline)}</strong><small>${display(segment.flightNumber, "Flight number not specified")} · ${display(segment.class)}</small></div>
  </div>`;
}

function optionPage(quote, option, index, segments, pageIndex, pageCount) {
  const baggage = option.itinerary.baggage || {};
  const isLastPage = pageIndex === pageCount - 1;
  return `<section class="page option-page ${segments.length > 1 ? "multi-segment" : ""}">
    <div class="content">
      ${brandHeader(`Prepared for ${quote.customerName}`)}
      <div class="option-heading">
        <div><span>OPTION ${String(index + 1).padStart(2, "0")}</span><h2>${escapeHtml(option.title)}</h2><p>${escapeHtml(routeSummary(option.itinerary))}</p></div>
        <div class="price"><span>${escapeHtml(option.currency)}</span><strong>${escapeHtml(formatPrice(option.price, option.currency))}</strong><small>Total ticket price</small></div>
      </div>
      <div class="section-heading"><span>FLIGHT DETAILS</span><h3>Journey Schedule${pageCount > 1 ? ` · ${pageIndex + 1} of ${pageCount}` : ""}</h3></div>
      <div class="segments">
        ${segments.map((segment, segmentIndex) => `<article class="segment">
          <div class="segment-top">${airlineIdentity(segment)}<span>Flight ${pageIndex * 2 + segmentIndex + 1}</span></div>
          <div class="route">
            <div><strong>${display(segment.departureAirport, meaningful(segment.departureCity) || "From")}</strong><span>${display(segment.departureCity, "")}</span><b>${display(segment.departureDate, "Date not specified")} · ${display(segment.departureTime, "Time not specified")}</b></div>
            <div class="route-line"><span>→</span><small>${display(segment.duration, "Duration not specified")}</small></div>
            <div class="arrival"><strong>${display(segment.arrivalAirport, meaningful(segment.arrivalCity) || "To")}</strong><span>${display(segment.arrivalCity, "")}</span><b>${display(segment.arrivalDate, "Date not specified")} · ${display(segment.arrivalTime, "Time not specified")}</b></div>
          </div>
          ${meaningful(segment.layoverAfter) ? `<div class="transit">Transit after this flight: <strong>${display(segment.layoverAfter)}</strong></div>` : ""}
        </article>`).join("")}
      </div>
      ${isLastPage ? `<div class="details-grid">
        <div><span>CHECKED BAGGAGE</span><strong>${display(baggage.checkedBaggage)}</strong></div>
        <div><span>CABIN BAGGAGE</span><strong>${display(baggage.cabinBaggage)}</strong></div>
        <div><span>CABIN / CLASS</span><strong>${escapeHtml(cabinSummary(option.itinerary))}</strong></div>
        <div><span>AIRLINE</span><strong>${escapeHtml(airlinesSummary(option.itinerary))}</strong></div>
      </div>
      ${option.notes ? `<div class="option-note"><span>OPTION NOTES</span><p>${escapeHtml(option.notes)}</p></div>` : ""}
      <div class="notice"><strong>Important:</strong> This document is a price quotation, not a confirmed reservation or airline ticket. Price and availability can change until ticketing.</div>` : `<div class="notice"><strong>Continued:</strong> The remaining flights and fare details continue on the next page.</div>`}
    </div>
    ${footer(quote.reference)}
  </section>`;
}

function optionPages(quote, option, index) {
  const segments = option.itinerary.segments || [];
  const groups = [];
  for (let offset = 0; offset < segments.length; offset += 2) groups.push(segments.slice(offset, offset + 2));
  return groups.map((group, pageIndex) => optionPage(quote, option, index, group, pageIndex, groups.length)).join("");
}

function styles() {
  const font = dataUri(FONT_PATH, "font/ttf");
  return `
    @font-face{font-family:UniSIRWAN;src:url("${font}") format("truetype");font-weight:400}
    @page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#edf4f5;color:#172033;font-family:Arial,UniSIRWAN,sans-serif;font-size:12px;line-height:1.45;print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .page{position:relative;width:210mm;height:297mm;margin:0 auto;padding:14mm 16mm 14mm;background:#fff;overflow:hidden;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}.page:before{content:"";position:absolute;inset:0 0 auto;height:7mm;background:#170c79;border-bottom:2mm solid #8acbd0}.content{position:relative;z-index:1}footer{position:absolute;left:16mm;right:16mm;bottom:7mm;display:flex;justify-content:space-between;padding-top:3mm;border-top:1px solid #dce8ea;color:#657084;font-size:9px}
    .brand{display:flex;align-items:center;justify-content:space-between;gap:10mm;padding-top:5mm;margin-bottom:8mm}.brand-main{display:flex;align-items:center;gap:4mm}.brand img{width:31mm;height:auto}.brand h1{margin:0 0 1mm;color:#170c79;font-size:19px}.brand p{margin:0;color:#657084;font-size:9px}.document-mark{text-align:right}.document-mark strong,.document-mark span{display:block}.document-mark strong{color:#170c79;font-size:17px}.document-mark span{margin-top:1mm;color:#657084}
    .hero{display:grid;grid-template-columns:minmax(0,1fr) 58mm;gap:8mm;align-items:stretch;margin-bottom:8mm;padding:7mm;border-left:4px solid #8acbd0;background:#f4f9fa;border-radius:6px}.hero span,.section-heading span,.details-grid span,.option-note span{color:#657084;font-size:9px;font-weight:800}.hero h2{margin:2mm 0 1mm;color:#170c79;font-size:28px;line-height:1.1}.hero p{margin:0;color:#657084}.quote-meta{display:grid;grid-template-columns:1fr;align-content:center;gap:1mm;padding-left:6mm;border-left:1px solid #dce8ea}.quote-meta strong{margin-bottom:2mm;color:#170c79}
    .section-heading{margin-bottom:4mm}.section-heading h3{margin:1mm 0 0;color:#170c79;font-size:18px}.comparison{display:grid;gap:3mm}.comparison article{display:grid;grid-template-columns:12mm minmax(0,1fr) 38mm;gap:4mm;align-items:center;padding:4mm;border:1px solid #dce8ea;border-radius:6px;break-inside:avoid}.number{display:grid;place-items:center;width:10mm;height:10mm;border-radius:5px;background:#efe3ca;color:#170c79;font-weight:800}.comparison-main h4{margin:0;color:#170c79;font-size:14px}.comparison-main p{margin:0;color:#657084;font-size:10px}.comparison-main>strong,.comparison-main>small{display:block}.comparison-main>strong{margin-top:1mm}.comparison-main>small{margin-top:1mm;color:#657084}.comparison-price{text-align:right}.comparison-price span,.comparison-price strong{display:block}.comparison-price span{color:#657084;font-size:9px;font-weight:800}.comparison-price strong{color:#170c79;font-size:17px}
    .notice{margin-top:5mm;padding:3mm 4mm;border-left:3px solid #8acbd0;background:#f8f2e5;color:#4d5668;font-size:10px}.option-heading{display:flex;align-items:center;justify-content:space-between;gap:8mm;margin-bottom:7mm;padding:6mm;border:1px solid #dce8ea;border-top:4px solid #8acbd0;border-radius:6px}.option-heading>div:first-child>span{color:#657084;font-size:9px;font-weight:800}.option-heading h2{margin:1mm 0;color:#170c79;font-size:23px}.option-heading p{margin:0;color:#657084}.price{min-width:45mm;text-align:right}.price span,.price strong,.price small{display:block}.price span{color:#657084;font-weight:800}.price strong{color:#170c79;font-size:24px}.price small{color:#657084}
    .segments{display:grid;gap:4mm}.segment{padding:4mm;border:1px solid #dce8ea;border-radius:6px;break-inside:avoid}.segment-top{display:flex;align-items:center;justify-content:space-between;padding-bottom:3mm;border-bottom:1px solid #dce8ea}.segment-top>span{color:#657084;font-size:9px;font-weight:800}.airline{display:flex;align-items:center;gap:3mm}.airline img,.airline>span{width:10mm;height:10mm;border:1px solid #dce8ea;border-radius:5px;object-fit:contain;padding:1mm}.airline>span{display:grid;place-items:center;color:#170c79;font-size:9px;font-weight:800}.airline strong,.airline small{display:block}.airline strong{color:#170c79}.airline small{color:#657084}
    .route{display:grid;grid-template-columns:minmax(0,1fr) 34mm minmax(0,1fr);align-items:center;padding-top:4mm}.route>div>strong,.route>div>span,.route>div>b{display:block}.route>div>strong{color:#170c79;font-size:20px}.route>div>span{color:#657084}.route>div>b{margin-top:2mm;font-size:11px}.arrival{text-align:right}.route-line{text-align:center}.route-line span{display:block;color:#52b1ba;font-size:22px}.route-line small{color:#657084}.transit{margin-top:3mm;padding-top:2mm;border-top:1px dashed #8acbd0;color:#657084}.transit strong{color:#170c79}
    .details-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3mm;margin-top:5mm}.details-grid>div,.option-note{padding:3.5mm;border:1px solid #dce8ea;border-radius:6px;background:#fbfdfd}.details-grid strong{display:block;margin-top:1mm}.option-note{margin-top:4mm}.option-note p{margin:1mm 0 0}.multi-segment .brand{margin-bottom:5mm}.multi-segment .option-heading{margin-bottom:4mm;padding:4mm}.multi-segment .section-heading{margin-bottom:2mm}.multi-segment .segments{gap:2.5mm}.multi-segment .segment{padding:3mm}.multi-segment .segment-top{padding-bottom:2mm}.multi-segment .route{padding-top:2.5mm}.multi-segment .route>div>strong{font-size:18px}.multi-segment .route>div>b{margin-top:1mm}.multi-segment .transit{margin-top:2mm;padding-top:1.5mm}.multi-segment .details-grid{gap:2mm;margin-top:3mm}.multi-segment .details-grid>div,.multi-segment .option-note{padding:2.5mm}.multi-segment .option-note{margin-top:2mm}.multi-segment .notice{margin-top:2.5mm}.print-button{position:fixed;right:18px;bottom:18px;padding:12px 18px;border:0;border-radius:7px;background:#170c79;color:#fff;font-weight:800;cursor:pointer;z-index:20}
    @media print{html,body{background:#fff}.print-button{display:none}}@media screen and (max-width:820px){.page{width:100%;height:auto;min-height:297mm;padding:12mm 7mm 16mm}.brand,.option-heading{align-items:flex-start;flex-direction:column}.document-mark,.price{text-align:left}.hero{grid-template-columns:1fr}.quote-meta{padding:4mm 0 0;border-left:0;border-top:1px solid #dce8ea}.comparison article{grid-template-columns:11mm minmax(0,1fr)}.comparison-price{grid-column:2;text-align:left}.route{grid-template-columns:1fr}.arrival{text-align:left}.route-line{text-align:left}.route-line span{transform:rotate(90deg);width:max-content}.details-grid{grid-template-columns:1fr}}
  `;
}

function generateTicketPriceHtml(quote) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flight Quotation - ${escapeHtml(quote.customerName)}</title><style>${styles()}</style></head><body><button class="print-button" onclick="window.print()">Print / Save PDF</button>${summaryPage(quote)}${quote.options.map((option, index) => optionPages(quote, option, index)).join("")}</body></html>`;
}

module.exports = { generateTicketPriceHtml };
