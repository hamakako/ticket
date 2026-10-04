const { parseDate, parseTime } = require("./flight-timings");
const { hotelMapLinks } = require("./smart-trip");

const COMPANY_WHATSAPP = "9647500229292";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function display(value, fallback = "Not specified") {
  const text = String(value || "").trim();
  return escapeHtml(text || fallback);
}

function whatsappUrl(message) {
  return `https://wa.me/${COMPANY_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

function passengerFirstName(trip) {
  if (String(trip.passengerFirstNameKurdish || "").trim()) return trip.passengerFirstNameKurdish.trim();
  const parts = String(trip.passengerName || "").trim().split(/\s+/).filter(Boolean);
  const titles = /^(mr|mrs|ms|miss|dr)\.?$/i;
  return parts.find((part) => !titles.test(part)) || parts[0] || "گەشتیار";
}

function countdownTimestamp(dateValue, timeValue) {
  const date = parseDate(dateValue);
  const time = parseTime(timeValue) || { hour: 0, minute: 0 };
  if (!date) return 0;
  return Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute);
}

function journeyLabel(segment) {
  return segment.journeyDirection === "return" ? "Return" : "Departure";
}

function flightCards(flight = {}) {
  let lastDirection = "";
  return (flight.segments || []).map((segment) => {
    const direction = journeyLabel(segment);
    const heading = direction !== lastDirection
      ? `<div class="journey-label">${escapeHtml(direction)} flight</div>`
      : "";
    lastDirection = direction;
    return `${heading}
      <article class="flight-card">
        <div class="flight-title">
          <strong>${display(segment.airline)} ${display(segment.flightNumber, "")}</strong>
          <span>${display(segment.duration, "")}</span>
        </div>
        <div class="route">
          <div><b>${display(segment.departureAirport || segment.departureCity)}</b><span>${display(segment.departureCity, "")}</span></div>
          <div class="route-line">→</div>
          <div><b>${display(segment.arrivalAirport || segment.arrivalCity)}</b><span>${display(segment.arrivalCity, "")}</span></div>
        </div>
        <div class="times">
          <span>${display(segment.departureDate)} · ${display(segment.departureTime)}</span>
          <span>${display(segment.arrivalDate)} · ${display(segment.arrivalTime)}</span>
        </div>
        ${segment.layoverAfter ? `<div class="transit">Transit: ${display(segment.layoverAfter)}</div>` : ""}
      </article>`;
  }).join("");
}

function hotelCards(trip) {
  return trip.hotels.map((hotel, index) => {
    const maps = hotelMapLinks(hotel, trip.destinationCity);
    return `
      <article class="hotel-card">
        <div class="number">${index + 1}</div>
        <div>
          <h3>${display(hotel.hotelName)}</h3>
          <p>${display(hotel.hotelCity, trip.destinationCity)}${hotel.hotelAddress ? ` · ${display(hotel.hotelAddress)}` : ""}</p>
          <div class="hotel-dates"><span>Check-in: <b>${display(hotel.checkInDate)}</b></span><span>Check-out: <b>${display(hotel.checkOutDate)}</b></span></div>
          ${hotel.hotelPhone ? `<p>Phone: ${display(hotel.hotelPhone)}</p>` : ""}
          ${hotel.notes ? `<p class="hotel-note">${display(hotel.notes)}</p>` : ""}
          <div class="button-row">
            <a class="button secondary" href="${escapeHtml(maps.searchUrl)}" target="_blank" rel="noreferrer">Open in Google Maps</a>
            <a class="button" href="${escapeHtml(maps.directionsUrl)}" target="_blank" rel="noreferrer">Direction to hotel</a>
          </div>
        </div>
      </article>`;
  }).join("");
}

function sightseeingCards(trip) {
  if (trip.sightseeingStatus === "ready" && trip.sightseeing.length) {
    return `
      <section class="section sightseeing" dir="rtl" lang="ckb">
        <div class="section-heading"><span>AI GUIDE</span><h2>شوێنە گەشتیارییە پێشنیارکراوەکان</h2></div>
        <div class="sight-grid">
          ${trip.sightseeing.map((place, index) => `
            <article class="sight-card">
              ${place.imageUrl ? `<a class="sight-photo" href="${escapeHtml(place.imageSourceUrl || place.mapUrl)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(place.imageUrl)}" alt="${display(place.imageAlt || place.name)}" loading="lazy" referrerpolicy="no-referrer"></a>` : ""}
              <span class="sight-number">${index + 1}</span>
              <h3>${display(place.name)}</h3>
              <p>${display(place.description, "")}</p>
              <a href="${escapeHtml(place.mapUrl)}" target="_blank" rel="noreferrer">کردنەوە لە Google Maps</a>
              ${place.imageSourceUrl ? `<a class="photo-credit" href="${escapeHtml(place.imageSourceUrl)}" target="_blank" rel="noreferrer">سەرچاوەی وێنە: Wikipedia / Wikimedia</a>` : ""}
            </article>
          `).join("")}
        </div>
        ${trip.travelTip ? `<div class="tip"><strong>تێبینی گەشت:</strong> ${display(trip.travelTip)}</div>` : ""}
        ${trip.miniPlan.length ? `
          <div class="mini-plan">
            ${trip.miniPlan.map((day) => `
              <article><h3>${display(day.title)}</h3><ul>${(day.items || []).map((item) => `<li>${display(item)}</li>`).join("")}</ul></article>
            `).join("")}
          </div>
        ` : ""}
      </section>`;
  }
  if (trip.sightseeingRequested) {
    return `
      <section class="section" dir="rtl" lang="ckb">
        <div class="section-heading"><span>AI GUIDE</span><h2>ڕێنمایی گەشتیاری</h2></div>
        <div class="fallback">شوێنە گەشتیارییەکانی ئەم شارە دواتر زیاد دەکرێن.</div>
      </section>`;
  }
  return "";
}

function smartTripStyles() {
  return `
    @font-face { font-family:UniSIRWAN; src:url('/assets/UniSIRWAN%20Noor%20Regular.ttf') format('truetype'); font-display:swap; }
    :root { --navy:#170C79; --teal:#8ACBD0; --cream:#EFE3CA; --ink:#172033; --muted:#657084; --line:#d8e7e9; }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; background:#f4f8f8; color:var(--ink); font-family:Arial,Helvetica,sans-serif; }
    a { color:inherit; }
    .header { background:#fff; border-bottom:1px solid var(--line); }
    .header-inner { width:min(1120px,calc(100% - 32px)); margin:auto; min-height:82px; display:flex; align-items:center; justify-content:space-between; gap:20px; }
    .brand { display:flex; align-items:center; gap:14px; }
    .brand img { width:90px; height:58px; object-fit:contain; }
    .brand strong,.brand span { display:block; }
    .brand strong { color:var(--navy); font-size:18px; }
    .brand span { margin-top:4px; color:var(--muted); font-size:12px; }
    .contact-top { color:var(--navy); font-weight:800; text-decoration:none; }
    .shell { width:min(1120px,calc(100% - 32px)); margin:auto; padding:28px 0 48px; }
    .hero { padding:32px; border-top:6px solid var(--teal); border-radius:8px; background:#fff; box-shadow:0 14px 36px rgba(23,12,121,.08); display:grid; grid-template-columns:minmax(0,1fr) auto; gap:24px; align-items:center; }
    .eyebrow,.section-heading span { color:var(--muted); font-size:11px; font-weight:800; text-transform:uppercase; }
    h1 { margin:6px 0 8px; color:var(--navy); font-size:clamp(30px,6vw,54px); line-height:1; }
    .hero p { margin:0; color:var(--muted); }
    .traveler-wish { margin-top:18px!important; color:var(--navy)!important; font-family:UniSIRWAN,Arial,sans-serif; font-size:clamp(23px,3.3vw,34px); line-height:1.5; }
    .traveler-wish strong { color:var(--navy); }
    .passenger-full { margin-top:2px!important; font-size:11px; letter-spacing:.03em; }
    .hero-meta { margin-top:18px; display:flex; flex-wrap:wrap; gap:8px; }
    .pill { padding:8px 11px; border:1px solid var(--line); border-radius:6px; background:#f8fbfb; font-size:12px; font-weight:700; }
    .countdown { min-width:270px; padding:20px; border-radius:8px; background:var(--navy); color:#fff; text-align:center; }
    .countdown > span { color:#c7edf0; font-size:11px; font-weight:800; text-transform:uppercase; }
    .count-grid { margin-top:10px; display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
    .count-grid b,.count-grid small { display:block; }
    .count-grid b { font-size:25px; }
    .count-grid small { margin-top:3px; color:#c7edf0; font-size:9px; }
    .section { margin-top:24px; padding:26px; border:1px solid var(--line); border-radius:8px; background:#fff; }
    .section-heading { margin-bottom:18px; }
    .section-heading h2 { margin:5px 0 0; color:var(--navy); font-size:22px; }
    .journey-label { margin:18px 0 8px; padding:8px 12px; border-left:4px solid var(--teal); background:rgba(239,227,202,.55); color:var(--navy); font-size:11px; font-weight:800; text-transform:uppercase; }
    .flight-card { padding:16px; border:1px solid var(--line); border-radius:7px; }
    .flight-card + .flight-card { margin-top:10px; }
    .flight-title,.times,.hotel-dates,.button-row { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .flight-title strong { color:var(--navy); }
    .flight-title span,.times { color:var(--muted); font-size:12px; }
    .route { margin:16px 0 8px; display:grid; grid-template-columns:1fr 60px 1fr; align-items:center; }
    .route > div:last-child { text-align:right; }
    .route b,.route span { display:block; }
    .route b { color:var(--navy); font-size:20px; }
    .route span { margin-top:3px; color:var(--muted); font-size:12px; }
    .route-line { color:var(--teal); font-size:24px; text-align:center!important; }
    .transit { margin-top:12px; padding:8px 10px; border-top:1px dashed var(--teal); color:var(--navy); font-size:12px; font-weight:700; }
    .hotel-list { display:grid; gap:12px; }
    .hotel-card { padding:18px; border:1px solid var(--line); border-radius:7px; display:grid; grid-template-columns:38px 1fr; gap:14px; }
    .number,.sight-number { width:34px; height:34px; border-radius:6px; display:grid; place-items:center; background:var(--cream); color:var(--navy); font-weight:800; }
    .hotel-card h3,.sight-card h3 { margin:0; color:var(--navy); }
    .hotel-card p { margin:7px 0; color:var(--muted); font-size:13px; }
    .hotel-dates { margin:12px 0; font-size:12px; }
    .hotel-note,.tip { padding:12px; border-left:3px solid var(--teal); background:#f5fafb; }
    .button { display:inline-flex; align-items:center; justify-content:center; min-height:40px; padding:9px 14px; border:1px solid var(--navy); border-radius:6px; background:var(--navy); color:#fff; font-size:12px; font-weight:800; text-decoration:none; }
    .button.secondary { border-color:var(--teal); background:#eef7f8; color:var(--navy); }
    .sight-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .sight-card { padding:16px; border:1px solid var(--line); border-radius:7px; position:relative; overflow:hidden; }
    .sight-photo { display:block; margin:-16px -16px 14px; background:#eef5f5; }
    .sight-photo img { display:block; width:100%; aspect-ratio:16/9; object-fit:cover; }
    .sight-number { margin-bottom:12px; }
    .sight-card p { color:var(--muted); line-height:1.8; }
    .sight-card a { color:var(--navy); font-size:12px; font-weight:800; }
    .sight-card .photo-credit { display:block; margin-top:8px; color:var(--muted); font-size:9px; font-weight:400; text-decoration:none; }
    .tip,.fallback { margin-top:16px; line-height:1.8; }
    .mini-plan { margin-top:14px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .mini-plan article { padding:14px; border:1px solid var(--line); border-radius:7px; }
    .mini-plan h3 { margin:0 0 8px; color:var(--navy); }
    .mini-plan li { margin:6px 0; line-height:1.7; }
    [lang="ckb"], [dir="rtl"] { font-family:UniSIRWAN,Arial,sans-serif; }
    .services-intro { margin:-8px 0 18px; color:var(--muted); font-family:UniSIRWAN,Arial,sans-serif; line-height:1.8; }
    .services { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
    .service { padding:20px; border:1px solid var(--line); border-top:4px solid var(--teal); border-radius:7px; background:#f8fbfb; text-decoration:none; }
    .service-mark { display:grid!important; place-items:center; width:34px; height:34px; margin:0 0 14px auto!important; border-radius:6px; background:var(--cream); color:var(--navy)!important; font-family:Arial,sans-serif; font-size:11px!important; font-weight:800; }
    .service strong { display:block; color:var(--navy); }
    .service span { display:block; margin-top:8px; color:var(--muted); font-size:13px; line-height:1.8; }
    .service b { display:block; margin-top:14px; color:var(--navy); font-size:11px; }
    .contact { margin-top:24px; padding:24px; border-radius:8px; background:var(--navy); color:#fff; display:flex; align-items:center; justify-content:space-between; gap:20px; }
    .contact h2 { margin:0 0 5px; }
    .contact p { margin:0; color:#c7edf0; }
    .contact .button { border-color:var(--teal); background:var(--teal); color:var(--navy); }
    .notes { white-space:pre-wrap; line-height:1.6; }
    .footer { padding:26px 16px; color:var(--muted); font-size:11px; text-align:center; }
    @media(max-width:760px) {
      .header-inner { min-height:70px; }
      .brand img { width:72px; height:48px; }
      .brand span,.contact-top { display:none; }
      .shell { width:min(100% - 20px,1120px); padding-top:14px; }
      .hero { padding:20px; grid-template-columns:1fr; }
      .countdown { min-width:0; width:100%; }
      .section { padding:18px; }
      .sight-grid,.mini-plan,.services { grid-template-columns:1fr; }
      .route { grid-template-columns:1fr 34px 1fr; }
      .hotel-card { grid-template-columns:1fr; }
      .contact { align-items:flex-start; flex-direction:column; }
      .button-row .button { flex:1 1 100%; }
    }
  `;
}

function generateSmartTripHtml(trip) {
  const destination = [trip.destinationCity, trip.destinationCountry].filter(Boolean).join(", ");
  const countdownAt = countdownTimestamp(trip.departureDate, trip.departureTime);
  const contactMessage = `Hello MK Business and Travel, I need help with my Smart Trip to ${destination}.`;
  const firstName = passengerFirstName(trip);
  const services = [
    ["01", "eSIM", "بۆ ئەوەی لە گەشتەکەتدا بێ ئینتەرنێت نەبیت، هەر ئێستا دەتوانیت eSIM ـی گونجاو بۆ وڵاتی مەبەست داوا بکەیت.", `سڵاو MK Business and Travel، دەمەوێت eSIM بۆ گەشتەکەم بۆ ${destination} داوا بکەم.`],
    ["02", "ترانسفێری فڕۆکەخانە", "بە ئارامی بگەڕێ؛ دەتوانین گواستنەوەت لە فڕۆکەخانە بۆ هۆتێل و لە هۆتێل بۆ فڕۆکەخانە بۆ ڕێک بخەین.", `سڵاو MK Business and Travel، دەمەوێت ترانسفێری فڕۆکەخانە بۆ گەشتەکەم بۆ ${destination} داوا بکەم.`],
    ["03", "گەشتی ڕۆژانە", "بۆ بینینی جوانترین شوێنەکانی شار، گەشتی ڕۆژانەی تایبەت یان گروپی بە پێی کات و حەزەکانت داوا بکە.", `سڵاو MK Business and Travel، دەمەوێت زانیاری گەشتی ڕۆژانە بۆ ${destination} وەربگرم.`]
  ];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Smart Trip to ${escapeHtml(destination)} | MK Business and Travel</title>
  <style>${smartTripStyles()}</style>
</head>
<body>
  <header class="header"><div class="header-inner">
    <div class="brand"><img src="/assets/mk-logo.png" alt="MK Business and Travel logo"><div><strong>MK Business and Travel</strong><span>Grand Swiss Hotel, Ground Floor, Pirmam</span></div></div>
    <a class="contact-top" href="${escapeHtml(whatsappUrl(contactMessage))}" target="_blank" rel="noreferrer">07500229292</a>
  </div></header>
  <main class="shell">
    <section class="hero">
      <div>
        <span class="eyebrow">YOUR SMART TRIP</span>
        <h1>${display(destination)}</h1>
        <p class="traveler-wish" dir="rtl" lang="ckb">بە هیوای گەشتێکی خۆش، <strong>${display(firstName)}</strong></p>
        <p class="passenger-full">${display(trip.passengerName)}</p>
        <div class="hero-meta"><span class="pill">PNR ${display(trip.flight?.pnr)}</span><span class="pill">Departure ${display(trip.departureDate)}</span>${trip.returnDate ? `<span class="pill">Return ${display(trip.returnDate)}</span>` : ""}</div>
      </div>
      <div class="countdown" data-countdown="${countdownAt}"><span>Time until departure</span><div class="count-grid"><div><b data-days>--</b><small>DAYS</small></div><div><b data-hours>--</b><small>HOURS</small></div><div><b data-minutes>--</b><small>MIN</small></div><div><b data-seconds>--</b><small>SEC</small></div></div></div>
    </section>

    <section class="section"><div class="section-heading"><span>FLIGHT</span><h2>Flight information</h2></div>${flightCards(trip.flight)}</section>
    ${trip.hotels.length ? `<section class="section"><div class="section-heading"><span>STAY</span><h2>Hotels</h2></div><div class="hotel-list">${hotelCards(trip)}</div></section>` : ""}
    ${sightseeingCards(trip)}
    ${trip.notes ? `<section class="section"><div class="section-heading"><span>NOTES</span><h2>Trip notes</h2></div><div class="notes">${display(trip.notes)}</div></section>` : ""}
    <section class="section" dir="rtl" lang="ckb"><div class="section-heading"><span>MK SERVICES</span><h2>گەشتەکەت تەواو بکە</h2></div><p class="services-intro">پێش گەشتەکەت ئەم خزمەتگوزارییانە ڕێک بخە بۆ ئەوەی بە ئارامی و بەبێ نیگەرانی گەشت بکەیت.</p><div class="services">${services.map(([number, name, description, message]) => `<a class="service" href="${escapeHtml(whatsappUrl(message))}" target="_blank" rel="noreferrer"><span class="service-mark">${number}</span><strong>${name}</strong><span>${description}</span><b>داواکاری لە WhatsApp</b></a>`).join("")}</div></section>
    <section class="contact" dir="rtl" lang="ckb"><div><h2>پێویستت بە یارمەتییە؟</h2><p>تیمی MK Business and Travel لە WhatsApp وەڵامت دەداتەوە.</p></div><a class="button" href="${escapeHtml(whatsappUrl(contactMessage))}" target="_blank" rel="noreferrer">پەیوەندی بە MK</a></section>
  </main>
  <footer class="footer" dir="rtl" lang="ckb">ئەم لینکە تایبەتە تا ${display(new Date(trip.expiresAt).toISOString().slice(0, 10))} بەردەستە.</footer>
  <script>
    (() => {
      const root = document.querySelector('[data-countdown]');
      const target = Number(root?.dataset.countdown || 0);
      const draw = () => {
        const remaining = Math.max(0, target - Date.now());
        const totalSeconds = Math.floor(remaining / 1000);
        const values = {
          days: Math.floor(totalSeconds / 86400),
          hours: Math.floor((totalSeconds % 86400) / 3600),
          minutes: Math.floor((totalSeconds % 3600) / 60),
          seconds: totalSeconds % 60
        };
        Object.entries(values).forEach(([key, value]) => {
          const node = root?.querySelector('[data-' + key + ']');
          if (node) node.textContent = String(value).padStart(2, '0');
        });
      };
      draw();
      setInterval(draw, 1000);
    })();
  </script>
</body>
</html>`;
}

function generateExpiredSmartTripHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Smart Trip expired</title><style>${smartTripStyles()}</style></head><body><header class="header"><div class="header-inner"><div class="brand"><img src="/assets/mk-logo.png" alt="MK logo"><div><strong>MK Business and Travel</strong><span>Grand Swiss Hotel, Ground Floor, Pirmam</span></div></div></div></header><main class="shell"><section class="hero"><div><span class="eyebrow">SMART TRIP</span><h1>Link expired</h1><p>This Smart Trip link is no longer available. Please contact MK Business and Travel for assistance.</p></div></section></main></body></html>`;
}

module.exports = {
  generateExpiredSmartTripHtml,
  generateSmartTripHtml
};
