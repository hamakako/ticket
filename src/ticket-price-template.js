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

function display(value, fallback = "—") {
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
  ].filter(Boolean).join(" → ") || "Route pending";
}

function airlinesSummary(itinerary) {
  return [...new Set((itinerary.segments || []).map((segment) => meaningful(segment.airline)).filter(Boolean))].join(" / ");
}

function datesSummary(itinerary) {
  const segments = itinerary.segments || [];
  const first = meaningful(segments[0]?.departureDate);
  const last = meaningful(segments.at(-1)?.arrivalDate);
  if (!first) return "Date pending";
  return last && last !== first ? `${first} – ${last}` : first;
}

function cabinSummary(itinerary) {
  return [...new Set((itinerary.segments || []).map((segment) => meaningful(segment.class)).filter(Boolean))].join(" / ");
}

function bilingualLabel(english, kurdish) {
  return `<span class="label-en">${escapeHtml(english)}</span><span class="label-ku" lang="ku" dir="rtl">${escapeHtml(kurdish)}</span>`;
}

function brandHeader(subtitle) {
  return `<header class="brand">
    <div class="brand-main">
      <div class="logo-frame"><img src="${dataUri(LOGO_PATH, "image/png")}" alt="MK Business and Travel logo"></div>
      <div><h1>${company.name}</h1><p>${company.address}</p><p>${company.phone}</p></div>
    </div>
    <div class="document-mark">
      <span>FLIGHT PRICE QUOTATION</span>
      <strong lang="ku" dir="rtl">پێشنیاری نرخی بلیت</strong>
      <small>${escapeHtml(subtitle)}</small>
    </div>
  </header>`;
}

function footer(reference) {
  return `<footer>
    <span><strong>MK</strong> ${company.name} · ${company.phone}</span>
    <span>Quotation ${escapeHtml(reference)} · <b lang="ku" dir="rtl">پێشنیاری نرخ</b></span>
  </footer>`;
}

function customerHero(quote, pageIndex, pageCount) {
  return `<div class="hero">
    <div class="hero-customer">
      ${bilingualLabel("PREPARED FOR", "ئامادەکراوە بۆ")}
      <h2>${escapeHtml(quote.customerName)}</h2>
      <p>Selected flight options, clearly compared for your journey.</p>
      <p class="ku-copy" lang="ku" dir="rtl">هەڵبژاردەکانی فڕین و نرخەکان بە ڕوونی بۆ گەشتەکەت بەراورد کراون.</p>
    </div>
    <div class="quote-meta">
      <div>${bilingualLabel("QUOTATION", "ژمارەی پێشنیار")}<strong>${escapeHtml(quote.reference)}</strong></div>
      <div>${bilingualLabel("PREPARED", "بەرواری ئامادەکردن")}<strong>${escapeHtml(quote.preparedAt)}</strong></div>
      ${pageCount > 1 ? `<div>${bilingualLabel("COMPARISON PAGE", "لاپەڕەی بەراورد")}<strong>${pageIndex + 1} / ${pageCount}</strong></div>` : ""}
    </div>
  </div>`;
}

function comparisonCard(option, index) {
  return `<article class="comparison-card">
    <span class="number">${String(index + 1).padStart(2, "0")}</span>
    <div class="comparison-main">
      <div class="comparison-title"><h4>${escapeHtml(option.title)}</h4><span>${escapeHtml(airlinesSummary(option.itinerary) || "Airline pending")}</span></div>
      <strong>${escapeHtml(routeSummary(option.itinerary))}</strong>
      <small>${escapeHtml(datesSummary(option.itinerary))} · ${escapeHtml(cabinSummary(option.itinerary) || "Cabin pending")}</small>
    </div>
    <div class="comparison-price">
      ${bilingualLabel("TOTAL PRICE", "نرخی کۆتایی")}
      <strong>${escapeHtml(formatPrice(option.price, option.currency))}</strong>
      <small>${escapeHtml(option.currency)}</small>
    </div>
  </article>`;
}

function summaryPage(quote, options, pageIndex, pageCount) {
  const offset = pageIndex * 5;
  return `<section class="page summary-page">
    <div class="content">
      ${brandHeader("Customer ticket comparison")}
      ${customerHero(quote, pageIndex, pageCount)}
      <div class="section-heading bilingual-heading">
        <div>${bilingualLabel("FLIGHT COMPARISON", "بەراوردی فڕینەکان")}<h3>Choose the option that suits you</h3></div>
        <h4 lang="ku" dir="rtl">هەڵبژاردەی گونجاو بۆ خۆت دیاری بکە</h4>
      </div>
      <div class="customer-guidance">
        <p>Compare the route, date, baggage, airline, and total price, then tell MK which option you prefer.</p>
        <p lang="ku" dir="rtl">ڕێگا، بەروار، بار، کۆمپانیای فڕۆکەوانی و نرخی کۆتایی بەراورد بکە، پاشان هەڵبژاردەی دڵخوازت بە MK بڵێ.</p>
      </div>
      <div class="comparison">${options.map((option, index) => comparisonCard(option, offset + index)).join("")}</div>
      <div class="notice bilingual-notice">
        <p><strong>Important:</strong> Prices and seats are subject to availability and can change until the reservation is confirmed and ticketed.</p>
        <p lang="ku" dir="rtl"><strong>تێبینی گرنگ:</strong> نرخ و شوێنی بەردەست دەتوانێت بگۆڕێت تا ئەو کاتەی ڕیزەرفەیشن پشتڕاست دەکرێتەوە و بلیت دەکرێت.</p>
      </div>
    </div>
    ${footer(quote.reference)}
  </section>`;
}

function summaryPages(quote) {
  const groups = [];
  for (let offset = 0; offset < quote.options.length; offset += 5) groups.push(quote.options.slice(offset, offset + 5));
  return groups.map((options, index) => summaryPage(quote, options, index, groups.length)).join("");
}

function airlineIdentity(segment) {
  const airline = meaningful(segment.airline) || "Airline pending";
  const flightMeta = [meaningful(segment.flightNumber), meaningful(segment.class)].filter(Boolean).join(" · ");
  return `<div class="airline">
    ${segment.airlineLogo ? `<img src="${escapeHtml(segment.airlineLogo)}" alt="${escapeHtml(airline)} logo">` : `<span>${escapeHtml((meaningful(segment.carrierCode) || airline).slice(0, 2).toUpperCase())}</span>`}
    <div><strong>${escapeHtml(airline)}</strong><small>${escapeHtml(flightMeta || "Flight details pending")}</small></div>
  </div>`;
}

function segmentCard(segment, flightNumber) {
  const departurePlace = meaningful(segment.departureAirport) || meaningful(segment.departureCity) || "From";
  const arrivalPlace = meaningful(segment.arrivalAirport) || meaningful(segment.arrivalCity) || "To";
  const duration = meaningful(segment.duration);
  return `<article class="segment">
    <div class="segment-top">
      ${airlineIdentity(segment)}
      <span class="flight-chip">FLIGHT ${flightNumber} · <b lang="ku" dir="rtl">فڕین ${flightNumber}</b></span>
    </div>
    <div class="route">
      <div class="route-stop">
        ${bilingualLabel("DEPARTURE", "بەڕێکەوتن")}
        <strong>${escapeHtml(departurePlace)}</strong>
        <span>${display(segment.departureCity, " ")}</span>
        <b>${display(segment.departureDate, "Date pending")} · ${display(segment.departureTime, "Time pending")}</b>
      </div>
      <div class="route-line"><i></i><span>→</span><i></i><small>${duration ? escapeHtml(duration) : "Duration pending"}<em lang="ku" dir="rtl">${duration ? "ماوەی فڕین" : "ماوە دیاری نەکراوە"}</em></small></div>
      <div class="route-stop arrival">
        ${bilingualLabel("ARRIVAL", "گەیشتن")}
        <strong>${escapeHtml(arrivalPlace)}</strong>
        <span>${display(segment.arrivalCity, " ")}</span>
        <b>${display(segment.arrivalDate, "Date pending")} · ${display(segment.arrivalTime, "Time pending")}</b>
      </div>
    </div>
    ${meaningful(segment.layoverAfter) ? `<div class="transit"><span>TRANSIT AFTER THIS FLIGHT</span><strong>${display(segment.layoverAfter)}</strong><b lang="ku" dir="rtl">ماوەی وەستان دوای ئەم فڕینە</b></div>` : ""}
  </article>`;
}

function detailCard(english, kurdish, value, missingKurdish = "لە کۆمپانیا بپرسە") {
  const actual = meaningful(value);
  return `<div class="detail-card">${bilingualLabel(english, kurdish)}<strong>${escapeHtml(actual || "Check with airline")}</strong>${actual ? "" : `<small lang="ku" dir="rtl">${escapeHtml(missingKurdish)}</small>`}</div>`;
}

function optionPage(quote, option, index, segments, pageIndex, pageCount) {
  const baggage = option.itinerary.baggage || {};
  const isLastPage = pageIndex === pageCount - 1;
  return `<section class="page option-page ${segments.length > 1 ? "multi-segment" : ""}">
    <div class="content">
      ${brandHeader(`Prepared for ${quote.customerName}`)}
      <div class="option-heading">
        <div class="option-copy">
          <span>OPTION ${String(index + 1).padStart(2, "0")} · <b lang="ku" dir="rtl">هەڵبژاردە ${String(index + 1).padStart(2, "0")}</b></span>
          <h2>${escapeHtml(option.title)}</h2>
          <p>${escapeHtml(routeSummary(option.itinerary))}</p>
        </div>
        <div class="price">
          ${bilingualLabel("TOTAL TICKET PRICE", "نرخی کۆتایی بلیت")}
          <strong>${escapeHtml(formatPrice(option.price, option.currency))}</strong>
          <small>${escapeHtml(option.currency)}</small>
        </div>
      </div>
      <div class="section-heading bilingual-heading journey-heading">
        <div>${bilingualLabel("FLIGHT DETAILS", "وردەکاری فڕین")}<h3>Journey schedule${pageCount > 1 ? ` · ${pageIndex + 1} of ${pageCount}` : ""}</h3></div>
        <h4 lang="ku" dir="rtl">خشتەی گەشت</h4>
      </div>
      <div class="segments">${segments.map((segment, segmentIndex) => segmentCard(segment, pageIndex * 2 + segmentIndex + 1)).join("")}</div>
      ${isLastPage ? `<div class="details-grid">
        ${detailCard("CHECKED BAGGAGE", "باری گەورە", baggage.checkedBaggage)}
        ${detailCard("CABIN BAGGAGE", "باری دەستی", baggage.cabinBaggage)}
        ${detailCard("CABIN / CLASS", "پۆلی گەشت", cabinSummary(option.itinerary))}
        ${detailCard("AIRLINE", "کۆمپانیای فڕۆکەوانی", airlinesSummary(option.itinerary))}
      </div>
      ${option.notes ? `<div class="option-note">${bilingualLabel("OPTION NOTES", "تێبینی ئەم هەڵبژاردەیە")}<p>${escapeHtml(option.notes)}</p></div>` : ""}
      <div class="notice bilingual-notice">
        <p><strong>Important:</strong> This is a price quotation, not a confirmed reservation or airline ticket. Price and availability can change until ticketing.</p>
        <p lang="ku" dir="rtl"><strong>تێبینی گرنگ:</strong> ئەمە تەنها پێشنیاری نرخە، نەک ڕیزەرفەیشنی پشتڕاستکراوە یان بلیتی فڕۆکە. نرخ و بەردەستبوون تا کاتی بلیتکردن دەتوانێت بگۆڕێت.</p>
      </div>` : `<div class="notice bilingual-notice"><p><strong>Continued:</strong> Remaining flights and fare details continue on the next page.</p><p lang="ku" dir="rtl"><strong>بەردەوامە:</strong> فڕینەکانی تر و وردەکاری نرخ لە لاپەڕەی داهاتوو بەردەوام دەبن.</p></div>`}
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
    @page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#e7eff1;color:#172033;font-family:Arial,UniSIRWAN,sans-serif;font-size:12px;line-height:1.45;print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .page{position:relative;width:210mm;height:297mm;margin:0 auto;padding:13mm 15mm 14mm;background:#fff;overflow:hidden;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}.page:before{content:"";position:absolute;inset:0 0 auto;height:8mm;background:#170c79;border-bottom:2mm solid #8acbd0}.page:after{content:"";position:absolute;right:-10mm;bottom:0;width:80mm;height:12mm;background:#efe3ca;clip-path:polygon(18% 0,100% 0,100% 100%,0 100%);opacity:.6}.content{position:relative;z-index:1}footer{position:absolute;z-index:2;left:15mm;right:15mm;bottom:6mm;display:flex;justify-content:space-between;padding-top:2.5mm;border-top:1px solid #d4e3e6;color:#657084;font-size:8.5px}footer strong{color:#170c79}
    [lang="ku"]{font-family:UniSIRWAN,Arial,sans-serif}.brand{display:flex;align-items:center;justify-content:space-between;gap:9mm;padding:5mm 0 4mm;margin-bottom:6mm;border-bottom:1px solid #dce8ea}.brand-main{display:flex;align-items:center;gap:4mm}.logo-frame{display:grid;place-items:center;width:29mm;height:19mm;border-radius:4px;background:#fff}.brand img{width:27mm;height:auto}.brand h1{margin:0 0 1mm;color:#170c79;font-size:18px}.brand p{margin:0;color:#657084;font-size:8.5px}.document-mark{text-align:right}.document-mark>span,.document-mark>strong,.document-mark>small{display:block}.document-mark>span{color:#657084;font-size:8px;font-weight:800;letter-spacing:.08em}.document-mark>strong{margin-top:1mm;color:#170c79;font-size:17px}.document-mark>small{margin-top:.5mm;color:#657084}
    .label-en,.label-ku{display:block;font-size:8px;font-weight:800}.label-en{letter-spacing:.05em}.label-ku{margin-top:.4mm;font-size:9px}.hero{display:grid;grid-template-columns:minmax(0,1fr) 56mm;gap:7mm;margin-bottom:5mm;padding:6mm 7mm;border-radius:5px;background:#170c79;color:#fff;box-shadow:inset 0 -2mm 0 #8acbd0}.hero .label-en{color:#8acbd0}.hero .label-ku{color:#efe3ca}.hero h2{margin:2mm 0 1mm;color:#fff;font-size:27px;line-height:1.1}.hero p{margin:0;color:#dce3ff}.hero .ku-copy{margin-top:1mm;color:#fff;text-align:left}.quote-meta{display:grid;align-content:center;gap:2mm}.quote-meta>div{padding:2.4mm 3mm;border-radius:4px;background:#fff;color:#170c79}.quote-meta .label-ku{color:#657084}.quote-meta strong{display:block;margin-top:1mm;font-size:11px}
    .bilingual-heading{display:flex;align-items:end;justify-content:space-between;gap:5mm;margin-bottom:3mm}.section-heading .label-en,.section-heading .label-ku{color:#657084}.section-heading h3{margin:1mm 0 0;color:#170c79;font-size:17px}.section-heading h4{margin:0;color:#170c79;font-size:15px;font-weight:400}.customer-guidance{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:3mm;padding:2.5mm 3mm;border-left:3px solid #8acbd0;background:#edf7f8;color:#4e5a70;font-size:9px}.customer-guidance p{margin:0}.customer-guidance p:last-child{text-align:right}
    .comparison{display:grid;gap:2.5mm}.comparison-card{position:relative;display:grid;grid-template-columns:11mm minmax(0,1fr) 40mm;gap:3.5mm;align-items:center;min-height:21mm;padding:3mm 3.5mm;border:1px solid #d6e4e7;border-left:4px solid #170c79;border-radius:5px;background:#fff;break-inside:avoid}.number{display:grid;place-items:center;width:9mm;height:9mm;border-radius:4px;background:#efe3ca;color:#170c79;font-weight:800}.comparison-title{display:flex;align-items:baseline;justify-content:space-between;gap:3mm}.comparison-main h4{margin:0;color:#170c79;font-size:13px}.comparison-title span{color:#657084;font-size:9px}.comparison-main>strong,.comparison-main>small{display:block}.comparison-main>strong{margin-top:1mm;font-size:12px}.comparison-main>small{margin-top:.5mm;color:#657084;font-size:9px}.comparison-price{align-self:stretch;padding:2mm 0 2mm 3mm;border-left:1px solid #dce8ea;text-align:right}.comparison-price .label-en,.comparison-price .label-ku{color:#657084}.comparison-price>strong{display:block;margin-top:1mm;color:#170c79;font-size:18px;line-height:1.1}.comparison-price>small{color:#657084;font-weight:800}
    .notice{margin-top:3mm;padding:2.5mm 3.5mm;border-left:3px solid #8acbd0;border-radius:0 4px 4px 0;background:#f8f2e5;color:#4d5668;font-size:9px}.bilingual-notice{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.bilingual-notice p{margin:0}.bilingual-notice p:last-child{text-align:right}.bilingual-notice strong{color:#170c79}
    .option-heading{display:grid;grid-template-columns:minmax(0,1fr) 52mm;overflow:hidden;margin-bottom:5mm;border:1px solid #d5e3e6;border-radius:5px;background:#f7fbfb}.option-copy{padding:4.5mm 5mm;border-top:3px solid #8acbd0}.option-copy>span{color:#657084;font-size:8.5px;font-weight:800}.option-copy>span b{color:#170c79;font-weight:400}.option-heading h2{margin:1.2mm 0 .6mm;color:#170c79;font-size:22px}.option-heading p{margin:0;color:#657084;font-size:11px}.price{display:grid;align-content:center;padding:4mm;background:#170c79;color:#fff;text-align:right}.price .label-en{color:#8acbd0}.price .label-ku{color:#efe3ca}.price>strong{display:block;margin-top:1.5mm;font-size:23px;line-height:1.05}.price>small{margin-top:1mm;color:#dbe1ff;font-weight:800}.journey-heading{margin-bottom:2.5mm}
    .segments{display:grid;gap:3mm}.segment{overflow:hidden;border:1px solid #d6e4e7;border-radius:5px;background:#fff;break-inside:avoid}.segment-top{display:flex;align-items:center;justify-content:space-between;padding:2.5mm 3.5mm;border-bottom:1px solid #dce8ea;background:#f8fbfb}.airline{display:flex;align-items:center;gap:3mm}.airline img,.airline>span{width:10mm;height:10mm;border:1px solid #dce8ea;border-radius:4px;background:#fff;object-fit:contain;padding:1mm}.airline>span{display:grid;place-items:center;color:#170c79;font-size:8px;font-weight:800}.airline strong,.airline small{display:block}.airline strong{color:#170c79;font-size:12px}.airline small{margin-top:.3mm;color:#657084;font-size:9px}.flight-chip{padding:1.3mm 2mm;border-radius:3px;background:#efe3ca;color:#170c79;font-size:8px;font-weight:800}.flight-chip b{font-weight:400}
    .route{display:grid;grid-template-columns:minmax(0,1fr) 42mm minmax(0,1fr);align-items:center;padding:3.5mm}.route-stop .label-en,.route-stop .label-ku{color:#657084}.route-stop>strong,.route-stop>span,.route-stop>b{display:block}.route-stop>strong{margin-top:1mm;color:#170c79;font-size:20px}.route-stop>span{color:#657084;min-height:4mm}.route-stop>b{margin-top:1mm;font-size:10.5px}.arrival{text-align:right}.route-line{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;text-align:center}.route-line i{height:1px;background:#8acbd0}.route-line>span{display:grid;place-items:center;width:7mm;height:7mm;border-radius:50%;background:#170c79;color:#fff;font-size:14px}.route-line small{grid-column:1/-1;margin-top:1mm;color:#657084;font-size:9px}.route-line em{display:block;color:#170c79;font-size:8.5px;font-style:normal}.transit{display:flex;align-items:center;gap:2mm;padding:2mm 3.5mm;border-top:1px dashed #8acbd0;background:#edf7f8;color:#657084}.transit span{font-size:8px;font-weight:800}.transit strong{color:#170c79}.transit b{margin-left:auto;color:#170c79;font-weight:400}
    .details-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2.5mm;margin-top:3.5mm}.detail-card,.option-note{padding:3mm;border:1px solid #d6e4e7;border-radius:5px;background:#f8fbfb}.detail-card .label-en,.detail-card .label-ku,.option-note .label-en,.option-note .label-ku{color:#657084}.detail-card strong{display:block;margin-top:1mm;color:#172033;font-size:11px}.detail-card small{display:block;margin-top:.6mm;color:#170c79;font-size:8.5px}.option-note{margin-top:2.5mm}.option-note p{margin:1mm 0 0}.multi-segment .brand{margin-bottom:4mm}.multi-segment .option-heading{margin-bottom:3mm}.multi-segment .option-copy{padding:3.5mm 4mm}.multi-segment .option-heading h2{font-size:19px}.multi-segment .segment-top{padding:2mm 3mm}.multi-segment .route{padding:2.5mm 3mm}.multi-segment .route-stop>strong{font-size:17px}.multi-segment .details-grid{margin-top:2.5mm}.multi-segment .detail-card{padding:2.3mm}.multi-segment .notice{margin-top:2.5mm}
    .print-button{position:fixed;right:18px;bottom:18px;padding:12px 18px;border:1px solid #8acbd0;border-radius:7px;background:#170c79;color:#fff;font-weight:800;cursor:pointer;box-shadow:0 10px 28px rgba(23,12,121,.24);z-index:20}
    @media print{html,body{background:#fff}.print-button{display:none}}@media screen and (max-width:820px){.page{width:100%;height:auto;min-height:297mm;padding:12mm 7mm 16mm}.brand{align-items:flex-start;flex-direction:column}.document-mark{text-align:left}.hero,.option-heading{grid-template-columns:1fr}.hero{box-shadow:inset 0 -1.5mm 0 #8acbd0}.customer-guidance,.bilingual-notice{grid-template-columns:1fr}.customer-guidance p:last-child,.bilingual-notice p:last-child{text-align:right}.comparison-card{grid-template-columns:10mm minmax(0,1fr)}.comparison-price{grid-column:2;border-left:0;border-top:1px solid #dce8ea;padding:2mm 0 0;text-align:left}.price{text-align:left}.route{grid-template-columns:1fr}.arrival{text-align:left}.route-line{margin:2mm 0}.details-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.bilingual-heading{align-items:flex-start;flex-direction:column}}
  `;
}

function generateTicketPriceHtml(quote) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flight Quotation - ${escapeHtml(quote.customerName)}</title><style>${styles()}</style></head><body><button class="print-button" onclick="window.print()">Print / Save PDF</button>${summaryPages(quote)}${quote.options.map((option, index) => optionPages(quote, option, index)).join("")}</body></html>`;
}

module.exports = { generateTicketPriceHtml };
