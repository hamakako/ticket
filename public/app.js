const emptyFlight = () => ({
  type: "flight",
  pnr: "",
  passengers: [{ fullName: "", ticketNumber: "", passengerType: "", seat: "" }],
  segments: [{
    airline: "",
    flightNumber: "",
    class: "",
    departureAirport: "",
    departureCity: "",
    departureDate: "",
    departureTime: "",
    arrivalAirport: "",
    arrivalCity: "",
    arrivalDate: "",
    arrivalTime: "",
    duration: "",
    layoverAfter: "",
    journeyDirection: "departure",
    terminal: "",
    gate: "",
    boardingTime: ""
  }],
  baggage: { checkedBaggage: "", cabinBaggage: "" },
  importantNotes: []
});

const emptyHotel = () => ({
  type: "hotel",
  referenceNumber: "",
  hotelName: "",
  hotelAddress: "",
  hotelPhone: "",
  checkInDate: "",
  checkInTime: "",
  checkOutDate: "",
  checkOutTime: "",
  roomType: "",
  bedding: "",
  guests: [{ fullName: "" }],
  numberOfGuests: "",
  mealType: "",
  gps: "",
  placeId: "",
  mapUrl: "",
  mapsTitle: "",
  latitude: "",
  longitude: "",
  importantNotes: [],
  cancellationNotes: []
});

const state = {
  flight: { data: emptyFlight(), recordId: null, sourceFile: "", generated: null, generatedPdf: null, boardingPass: null, design: "modern" },
  hotel: { data: emptyHotel(), recordId: null, sourceFile: "", generated: null, generatedPdf: null, boardingPass: null, design: "modern" }
};

const smartTripState = {
  recordId: null,
  smartTripId: null,
  prefill: null,
  hotels: []
};

document.addEventListener("DOMContentLoaded", () => {
  bindSmartTripDialog();
  ["flight", "hotel"].forEach((type) => {
    renderForm(type);
    loadHistory(type);
    bindControls(type);
  });
});

function bindControls(type) {
  document.querySelector(`[data-process="${type}"]`).addEventListener("click", () => processDocument(type));
  document.querySelector(`[data-process-text="${type}"]`).addEventListener("click", () => processPastedText(type));
  document.querySelector(`[data-save="${type}"]`).addEventListener("click", () => saveRecord(type));
  document.querySelector(`[data-generate="${type}"]`).addEventListener("click", () => generateHtml(type));
  document.querySelector(`[data-generate-pdf="${type}"]`).addEventListener("click", () => generatePdf(type));
  if (type === "flight") {
    document.querySelector('[data-generate-boarding="flight"]').addEventListener("click", generateBoardingPass);
    document.querySelector('[data-smart-trip="flight"]').addEventListener("click", () => openSmartTrip(state.flight.recordId));
  } else {
    document.querySelector("[data-enrich-hotel]").addEventListener("click", enrichHotel);
  }
  document.querySelector(`[data-reset="${type}"]`).addEventListener("click", () => resetRecord(type));
  document.querySelector(`[data-design="${type}"]`).addEventListener("change", (event) => {
    state[type].design = event.target.value;
  });
  const search = document.querySelector(`[data-search="${type}"]`);
  search.addEventListener("input", debounce(() => loadHistory(type), 250));
}

function debounce(fn, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

function setStatus(type, message, tone = "") {
  const node = document.querySelector(`[data-status="${type}"]`);
  node.textContent = message || "";
  node.className = `status ${tone}`.trim();
}

function setBusy(type, isBusy) {
  document.querySelectorAll(`[data-process="${type}"], [data-process-text="${type}"], [data-save="${type}"], [data-generate="${type}"], [data-generate-pdf="${type}"], [data-generate-boarding="${type}"]`)
    .forEach((button) => {
      button.disabled = isBusy;
    });
  if (type === "hotel") {
    const enrichButton = document.querySelector("[data-enrich-hotel]");
    if (enrichButton) enrichButton.disabled = isBusy;
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

async function processDocument(type) {
  const input = document.querySelector(`[data-file="${type}"]`);
  const file = input.files[0];
  if (!file) {
    setStatus(type, "Please choose a PDF or image first.", "error");
    return;
  }

  const form = new FormData();
  form.append("document", file);

  setBusy(type, true);
  const started = Date.now();
  const timer = setInterval(() => {
    const seconds = Math.round((Date.now() - started) / 1000);
    setStatus(type, `Processing with Gemini... ${seconds}s. Most tickets finish in 15-30 seconds.`);
  }, 1000);
  setStatus(type, "Processing with Gemini... Most tickets finish in 15-30 seconds.");
  try {
    const payload = await api(`/api/process/${type}`, {
      method: "POST",
      body: form
    });
    applyExtractedData(type, payload);
    setStatus(type, "Extracted data is ready for review.", "ok");
  } catch (error) {
    setStatus(type, error.message, "error");
  } finally {
    clearInterval(timer);
    setBusy(type, false);
  }
}

async function processPastedText(type) {
  const input = document.querySelector(`[data-pasted-text="${type}"]`);
  const text = input.value.trim();
  if (text.length < 10) {
    setStatus(type, "Please paste the ticket or hotel details first.", "error");
    return;
  }

  setBusy(type, true);
  const started = Date.now();
  const timer = setInterval(() => {
    const seconds = Math.round((Date.now() - started) / 1000);
    setStatus(type, `Extracting pasted text with Gemini... ${seconds}s.`);
  }, 1000);
  setStatus(type, "Extracting pasted text with Gemini...");

  try {
    const payload = await api(`/api/process-text/${type}`, {
      method: "POST",
      body: JSON.stringify({ text })
    });
    applyExtractedData(type, payload);
    setStatus(type, "Pasted text extracted and ready for review.", "ok");
  } catch (error) {
    setStatus(type, error.message, "error");
  } finally {
    clearInterval(timer);
    setBusy(type, false);
  }
}

function applyExtractedData(type, payload) {
  state[type].data = payload.data;
  state[type].sourceFile = payload.sourceFile || "";
  state[type].recordId = null;
  state[type].generated = null;
  state[type].generatedPdf = null;
  state[type].boardingPass = null;
  renderForm(type);
  updateRecordLabel(type);
  updateGeneratedLinks(type);
}

async function saveRecord(type) {
  syncForm(type);
  setBusy(type, true);
  setStatus(type, "Saving...");

  const id = state[type].recordId;
  const method = id ? "PUT" : "POST";
  const path = id ? `/api/${type}-itineraries/${id}` : `/api/${type}-itineraries`;

  try {
    const payload = await api(path, {
      method,
      body: JSON.stringify({
        data: state[type].data,
        sourceFile: state[type].sourceFile
      })
    });
    state[type].data = payload.record;
    state[type].recordId = payload.record.id;
    state[type].sourceFile = payload.record.sourceFile || "";
    state[type].generated = payload.record.generated || null;
    state[type].generatedPdf = payload.record.generatedPdf || null;
    state[type].boardingPass = payload.record.boardingPass || null;
    renderForm(type);
    updateRecordLabel(type);
    updateGeneratedLinks(type);
    await loadHistory(type);
    setStatus(type, "Saved to database.", "ok");
    return payload.record;
  } catch (error) {
    setStatus(type, error.message, "error");
    throw error;
  } finally {
    setBusy(type, false);
  }
}

async function generateHtml(type) {
  try {
    if (!state[type].recordId) {
      await saveRecord(type);
    } else {
      await saveRecord(type);
    }

    setBusy(type, true);
    setStatus(type, "Generating HTML...");
    const payload = await api(`/api/${type}-itineraries/${state[type].recordId}/generate`, {
      method: "POST",
      body: JSON.stringify({ design: getSelectedDesign(type) })
    });
    state[type].generated = payload.generated;
    updateGeneratedLinks(type);
    await loadHistory(type);
    setStatus(type, "HTML itinerary generated.", "ok");
  } catch (error) {
    setStatus(type, error.message, "error");
  } finally {
    setBusy(type, false);
  }
}

async function generatePdf(type) {
  try {
    await saveRecord(type);
    setBusy(type, true);
    setStatus(type, "Generating A4 PDF...");
    const payload = await api(`/api/${type}-itineraries/${state[type].recordId}/generate-pdf`, {
      method: "POST",
      body: JSON.stringify({ design: getSelectedDesign(type) })
    });
    state[type].generatedPdf = payload.generated;
    updateGeneratedLinks(type);
    await loadHistory(type);
    setStatus(type, "A4 PDF itinerary generated.", "ok");
  } catch (error) {
    setStatus(type, error.message, "error");
  } finally {
    setBusy(type, false);
  }
}

async function generateBoardingPass() {
  const type = "flight";
  try {
    await saveRecord(type);
    setBusy(type, true);
    setStatus(type, "Generating boarding pass HTML...");
    const payload = await api(`/api/flight-itineraries/${state.flight.recordId}/generate-boarding-pass`, {
      method: "POST",
      body: JSON.stringify({})
    });
    state.flight.boardingPass = payload.generated;
    updateGeneratedLinks(type);
    await loadHistory(type);
    setStatus(type, "Boarding pass HTML generated.", "ok");
  } catch (error) {
    setStatus(type, error.message, "error");
  } finally {
    setBusy(type, false);
  }
}

async function enrichHotel() {
  const type = "hotel";
  syncForm(type);
  setBusy(type, true);
  setStatus(type, "Creating the hotel map link...");
  try {
    const payload = await api("/api/hotel-enrich", {
      method: "POST",
      body: JSON.stringify({ data: state.hotel.data })
    });
    state.hotel.data = payload.data;
    renderForm(type);
    setStatus(type, payload.data.mapUrl
      ? "Hotel map link created."
      : "Enter the hotel name or address first.", payload.data.mapUrl ? "ok" : "error");
  } catch (error) {
    setStatus(type, error.message, "error");
  } finally {
    setBusy(type, false);
  }
}

async function loadHistory(type) {
  const search = document.querySelector(`[data-search="${type}"]`)?.value || "";
  const payload = await api(`/api/${type}-itineraries?search=${encodeURIComponent(search)}`);
  renderHistory(type, payload.records);
}

async function loadRecord(type, id) {
  setStatus(type, "Loading record...");
  const payload = await api(`/api/${type}-itineraries/${id}`);
  state[type].data = payload.record;
  state[type].recordId = payload.record.id;
  state[type].sourceFile = payload.record.sourceFile || "";
  state[type].generated = payload.record.generated || null;
  state[type].generatedPdf = payload.record.generatedPdf || null;
  state[type].boardingPass = payload.record.boardingPass || null;
  renderForm(type);
  updateRecordLabel(type);
  updateGeneratedLinks(type);
  setStatus(type, "Record loaded.", "ok");
  document.getElementById(type).scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteRecord(type, id) {
  if (!confirm("Delete this record?")) return;
  await api(`/api/${type}-itineraries/${id}`, { method: "DELETE" });
  if (state[type].recordId === id) resetRecord(type);
  await loadHistory(type);
}

async function generateExisting(type, id) {
  const payload = await api(`/api/${type}-itineraries/${id}/generate`, {
    method: "POST",
    body: JSON.stringify({ design: getSelectedDesign(type) })
  });
  await loadHistory(type);
  if (state[type].recordId === id) {
    state[type].generated = payload.generated;
    updateGeneratedLinks(type);
  }
}

function resetRecord(type) {
  const design = getSelectedDesign(type);
  state[type] = {
    data: type === "flight" ? emptyFlight() : emptyHotel(),
    recordId: null,
    sourceFile: "",
    generated: null,
    generatedPdf: null,
    boardingPass: null,
    design
  };
  const file = document.querySelector(`[data-file="${type}"]`);
  if (file) file.value = "";
  const pastedText = document.querySelector(`[data-pasted-text="${type}"]`);
  if (pastedText) pastedText.value = "";
  renderForm(type);
  updateRecordLabel(type);
  updateGeneratedLinks(type);
  setStatus(type, "");
}

function getSelectedDesign(type) {
  return document.querySelector(`[data-design="${type}"]`)?.value || state[type].design || "modern";
}

function updateRecordLabel(type) {
  const label = document.querySelector(`[data-record-label="${type}"]`);
  label.textContent = state[type].recordId ? `Record #${state[type].recordId}` : "Unsaved";
}

function updateGeneratedLinks(type) {
  updateOutputLinks(type, "", state[type].generated);
  updateOutputLinks(type, "pdf", state[type].generatedPdf);
  if (type === "flight") updateOutputLinks(type, "boarding", state[type].boardingPass);
  if (type === "flight") updateSmartTripButton();
}

function updateSmartTripButton() {
  const button = document.querySelector('[data-smart-trip="flight"]');
  if (!button) return;
  button.disabled = !(state.flight.recordId && (state.flight.generated || state.flight.generatedPdf));
}

function updateOutputLinks(type, suffix, generated) {
  const dataSuffix = suffix ? `-${suffix}` : "";
  const download = document.querySelector(`[data-download${dataSuffix}="${type}"]`);
  const open = document.querySelector(`[data-open${dataSuffix}="${type}"]`);
  if (!download || !open) return;

  [download, open].forEach((link) => {
    link.href = generated?.url || "#";
    link.classList.toggle("hidden", !generated?.url);
  });
  if (generated?.fileName) download.setAttribute("download", generated.fileName);
}

function renderHistory(type, records) {
  const list = document.querySelector(`[data-list="${type}"]`);
  if (!records.length) {
    list.innerHTML = `<div class="history-item"><p>No records yet.</p></div>`;
    return;
  }

  list.innerHTML = records.map((record) => {
    const title = type === "flight"
      ? record.passengers?.[0]?.fullName || "Passenger"
      : record.guests?.[0]?.fullName || "Guest";
    const reference = type === "flight" ? record.pnr : record.referenceNumber;
    const subtitle = type === "flight"
      ? `${reference} · ${record.segments?.[0]?.airline || ""} ${record.segments?.[0]?.flightNumber || ""}`
      : `${reference} · ${record.hotelName || ""}`;
    const generatedUrl = record.generated?.fileName ? `/generated/${encodeURIComponent(record.generated.fileName)}` : "";
    const generatedPdfUrl = record.generatedPdf?.fileName ? `/generated-pdf/${encodeURIComponent(record.generatedPdf.fileName)}` : "";
    const boardingPassUrl = record.boardingPass?.fileName ? `/generated/${encodeURIComponent(record.boardingPass.fileName)}` : "";
    const canMakeSmartTrip = Boolean(generatedUrl || generatedPdfUrl);
    return `
      <div class="history-item">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(subtitle)}<br>${escapeHtml(record.createdAt || "")}</p>
        <div class="inline-actions">
          <button class="small-button" type="button" data-load-record="${type}:${record.id}">Load</button>
          <button class="small-button" type="button" data-generate-existing="${type}:${record.id}">Generate</button>
          ${generatedUrl ? `<a class="small-button download-link" href="${generatedUrl}" target="_blank" rel="noreferrer">Open</a>` : ""}
          ${generatedUrl ? `<a class="small-button download-link" href="${generatedUrl}" download="${escapeHtml(record.generated.fileName)}">Download</a>` : ""}
          ${generatedPdfUrl ? `<a class="small-button download-link" href="${generatedPdfUrl}" target="_blank" rel="noreferrer">PDF</a>` : ""}
          ${boardingPassUrl ? `<a class="small-button download-link" href="${boardingPassUrl}" target="_blank" rel="noreferrer">Boarding Pass</a>` : ""}
          ${type === "flight" && canMakeSmartTrip ? `<button class="small-button" type="button" data-make-smart-trip="${record.id}">Make Smart Trip</button>` : ""}
          <button class="danger-button" type="button" data-delete-record="${type}:${record.id}">Delete</button>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-load-record]").forEach((button) => {
    button.addEventListener("click", () => {
      const [recordType, id] = button.dataset.loadRecord.split(":");
      loadRecord(recordType, Number(id));
    });
  });
  list.querySelectorAll("[data-delete-record]").forEach((button) => {
    button.addEventListener("click", () => {
      const [recordType, id] = button.dataset.deleteRecord.split(":");
      deleteRecord(recordType, Number(id));
    });
  });
  list.querySelectorAll("[data-generate-existing]").forEach((button) => {
    button.addEventListener("click", () => {
      const [recordType, id] = button.dataset.generateExisting.split(":");
      generateExisting(recordType, Number(id));
    });
  });
  list.querySelectorAll("[data-make-smart-trip]").forEach((button) => {
    button.addEventListener("click", () => openSmartTrip(Number(button.dataset.makeSmartTrip)));
  });
}

function bindSmartTripDialog() {
  const dialog = document.querySelector("[data-smart-trip-dialog]");
  const form = document.querySelector("[data-smart-trip-form]");
  document.querySelector("[data-smart-trip-close]").addEventListener("click", () => dialog.close());
  document.querySelector("[data-smart-trip-cancel]").addEventListener("click", () => dialog.close());
  document.querySelector("[data-add-smart-hotel]").addEventListener("click", () => {
    syncSmartTripHotels();
    smartTripState.hotels.push({
      hotelName: "",
      hotelCity: smartTripState.prefill?.destinationCity || "",
      hotelAddress: "",
      checkInDate: "",
      checkOutDate: "",
      hotelPhone: "",
      notes: ""
    });
    renderSmartTripHotels();
  });
  document.querySelector("[data-smart-trip-copy]").addEventListener("click", async () => {
    const input = document.querySelector("[data-smart-trip-url]");
    await navigator.clipboard.writeText(input.value);
    setSmartTripStatus("Smart Trip link copied.", "ok");
  });
  document.querySelector("[data-smart-trip-ticket]").addEventListener("click", generateSmartTripTicket);
  form.addEventListener("submit", createSmartTrip);
}

function setSmartTripStatus(message = "", tone = "") {
  const node = document.querySelector("[data-smart-trip-status]");
  node.textContent = message;
  node.className = `status ${tone}`.trim();
}

async function openSmartTrip(recordId) {
  if (!recordId) {
    setStatus("flight", "Generate the ticket before making a Smart Trip.", "error");
    return;
  }
  const dialog = document.querySelector("[data-smart-trip-dialog]");
  const form = document.querySelector("[data-smart-trip-form]");
  smartTripState.recordId = recordId;
  smartTripState.smartTripId = null;
  smartTripState.prefill = null;
  smartTripState.hotels = [];
  form.reset();
  form.elements.sightseeingRequested.checked = true;
  document.querySelector("[data-smart-trip-result]").classList.add("hidden");
  document.querySelector("[data-smart-trip-ticket-html]").classList.add("hidden");
  document.querySelector("[data-smart-trip-ticket-pdf]").classList.add("hidden");
  document.querySelector("[data-smart-trip-summary]").innerHTML = "";
  document.querySelector("[data-smart-trip-detection]").textContent = "Reading the ticket and detecting the destination...";
  document.querySelector("[data-smart-trip-create]").disabled = true;
  renderSmartTripHotels();
  setSmartTripStatus("");
  dialog.showModal();

  try {
    const payload = await api(`/api/flight-itineraries/${recordId}/smart-trip-preview`);
    smartTripState.prefill = payload.prefill;
    form.elements.destinationCity.value = payload.prefill.destinationCity || "";
    form.elements.destinationCountry.value = payload.prefill.destinationCountry || "";
    document.querySelector("[data-smart-trip-detection]").textContent = payload.detection.message;
    renderSmartTripSummary(payload.prefill);
    document.querySelector("[data-smart-trip-create]").disabled = false;
  } catch (error) {
    document.querySelector("[data-smart-trip-detection]").textContent = "Destination detection could not be completed.";
    setSmartTripStatus(error.message, "error");
  }
}

function renderSmartTripSummary(prefill) {
  const items = [
    ["Passenger", prefill.passengerName],
    ["PNR", prefill.pnr],
    ["Airline / Flight", `${prefill.airline || ""} ${prefill.flightNumber || ""}`.trim()],
    ["Route", `${prefill.departureCity || prefill.departureAirport || ""} → ${prefill.arrivalCity || prefill.arrivalAirport || ""}`],
    ["Departure", `${prefill.departureDate || ""} ${prefill.departureTime || ""}`.trim()],
    ["Arrival", `${prefill.arrivalDate || ""} ${prefill.arrivalTime || ""}`.trim()],
    ["Return", prefill.returnDate || "One way"]
  ];
  document.querySelector("[data-smart-trip-summary]").innerHTML = items.map(([label, value]) => `
    <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Not specified")}</strong></div>
  `).join("");
}

function renderSmartTripHotels() {
  const root = document.querySelector("[data-smart-trip-hotels]");
  root.innerHTML = smartTripState.hotels.map((hotel, index) => `
    <div class="smart-trip-hotel" data-smart-hotel="${index}">
      <div class="smart-trip-hotel-heading"><strong>Hotel ${index + 1}</strong><button class="danger-button" type="button" data-remove-smart-hotel="${index}">Remove</button></div>
      <div class="smart-trip-hotel-upload">
        <label>Hotel voucher PDF or image<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" data-smart-hotel-file></label>
        <button class="secondary-button" type="button" data-extract-smart-hotel="${index}">Extract Hotel with AI</button>
        <small data-smart-hotel-extract-status></small>
      </div>
      <div class="smart-trip-hotel-grid">
        <label>Hotel name<input type="text" maxlength="160" data-smart-hotel-field="hotelName" value="${escapeAttribute(hotel.hotelName)}" required></label>
        <label>Hotel city<input type="text" maxlength="120" data-smart-hotel-field="hotelCity" value="${escapeAttribute(hotel.hotelCity)}"></label>
        <label class="full-span">Hotel address, optional<input type="text" maxlength="300" data-smart-hotel-field="hotelAddress" value="${escapeAttribute(hotel.hotelAddress)}"></label>
        <label>Check-in date<input type="date" data-smart-hotel-field="checkInDate" value="${escapeAttribute(hotel.checkInDate)}"></label>
        <label>Check-out date<input type="date" data-smart-hotel-field="checkOutDate" value="${escapeAttribute(hotel.checkOutDate)}"></label>
        <label>Hotel phone, optional<input type="tel" maxlength="80" data-smart-hotel-field="hotelPhone" value="${escapeAttribute(hotel.hotelPhone)}"></label>
        <label class="full-span">Notes, optional<textarea maxlength="500" data-smart-hotel-field="notes">${escapeHtml(hotel.notes)}</textarea></label>
      </div>
    </div>
  `).join("");
  root.querySelectorAll("[data-remove-smart-hotel]").forEach((button) => {
    button.addEventListener("click", () => {
      syncSmartTripHotels();
      smartTripState.hotels.splice(Number(button.dataset.removeSmartHotel), 1);
      renderSmartTripHotels();
    });
  });
  root.querySelectorAll("[data-extract-smart-hotel]").forEach((button) => {
    button.addEventListener("click", () => extractSmartTripHotel(Number(button.dataset.extractSmartHotel), button));
  });
  const addButton = document.querySelector("[data-add-smart-hotel]");
  addButton.textContent = smartTripState.hotels.length ? "+ Add another hotel" : "+ Add hotel";
}

async function extractSmartTripHotel(index, button) {
  syncSmartTripHotels();
  const card = button.closest("[data-smart-hotel]");
  const file = card.querySelector("[data-smart-hotel-file]").files[0];
  const status = card.querySelector("[data-smart-hotel-extract-status]");
  if (!file) {
    status.textContent = "Please choose a hotel PDF or image first.";
    status.className = "error";
    return;
  }

  const form = new FormData();
  form.append("hotel", file);
  button.disabled = true;
  status.textContent = "Extracting hotel details with Gemini...";
  status.className = "";
  try {
    const payload = await api("/api/smart-trip/hotel-extract", { method: "POST", body: form });
    const current = smartTripState.hotels[index];
    Object.entries(payload.hotel || {}).forEach(([key, value]) => {
      if (value) current[key] = value;
    });
    if (!current.hotelCity) current.hotelCity = smartTripState.prefill?.destinationCity || "";
    renderSmartTripHotels();
    setSmartTripStatus(`Hotel ${index + 1} details extracted. Please review them before creating the link.`, "ok");
  } catch (error) {
    status.textContent = error.message;
    status.className = "error";
    button.disabled = false;
  }
}

function syncSmartTripHotels() {
  document.querySelectorAll("[data-smart-hotel]").forEach((card) => {
    const hotel = smartTripState.hotels[Number(card.dataset.smartHotel)];
    card.querySelectorAll("[data-smart-hotel-field]").forEach((input) => {
      hotel[input.dataset.smartHotelField] = input.value;
    });
  });
}

async function createSmartTrip(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const createButton = document.querySelector("[data-smart-trip-create]");
  syncSmartTripHotels();
  createButton.disabled = true;
  setSmartTripStatus(form.elements.sightseeingRequested.checked
    ? "Creating the Smart Trip with high-quality AI reasoning and a complete daily plan. This may take 1-2 minutes..."
    : "Creating Smart Trip link...");
  try {
    const payload = await api(`/api/flight-itineraries/${smartTripState.recordId}/smart-trips`, {
      method: "POST",
      body: JSON.stringify({
        destinationCity: form.elements.destinationCity.value,
        destinationCountry: form.elements.destinationCountry.value,
        customerWhatsapp: form.elements.customerWhatsapp.value,
        notes: form.elements.notes.value,
        sightseeingRequested: form.elements.sightseeingRequested.checked,
        ticketDesign: state.flight.design,
        hotels: smartTripState.hotels
      })
    });
    smartTripState.smartTripId = payload.smartTrip.id;
    const absoluteUrl = new URL(payload.smartTrip.url, window.location.origin).toString();
    document.querySelector("[data-smart-trip-url]").value = absoluteUrl;
    document.querySelector("[data-smart-trip-open]").href = absoluteUrl;
    document.querySelector("[data-smart-trip-result]").classList.remove("hidden");
    setSmartTripStatus(payload.smartTrip.sightseeingStatus === "unavailable"
      ? "Smart Trip created. AI sightseeing was unavailable, so the fallback message is shown."
      : "Smart Trip link created successfully.", "ok");
  } catch (error) {
    setSmartTripStatus(error.message, "error");
  } finally {
    createButton.disabled = false;
  }
}

async function generateSmartTripTicket() {
  if (!smartTripState.smartTripId) {
    setSmartTripStatus("Create the Smart Trip link before generating the QR ticket.", "error");
    return;
  }
  const button = document.querySelector("[data-smart-trip-ticket]");
  button.disabled = true;
  setSmartTripStatus("Regenerating the same ticket design with the Smart Trip QR code...");
  try {
    const payload = await api(`/api/smart-trips/${smartTripState.smartTripId}/ticket`, { method: "POST" });
    const htmlLink = document.querySelector("[data-smart-trip-ticket-html]");
    const pdfLink = document.querySelector("[data-smart-trip-ticket-pdf]");
    htmlLink.href = payload.generated.html.url;
    pdfLink.href = payload.generated.pdf.url;
    htmlLink.classList.remove("hidden");
    pdfLink.classList.remove("hidden");
    setSmartTripStatus("QR ticket generated. The printed QR and the small ticket button both open this Smart Trip.", "ok");
  } catch (error) {
    setSmartTripStatus(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

function renderForm(type) {
  const root = document.querySelector(`[data-form="${type}"]`);
  root.innerHTML = type === "flight" ? flightForm(state.flight.data) : hotelForm(state.hotel.data);
  bindFormEvents(type);
}

function bindFormEvents(type) {
  const root = document.querySelector(`[data-form="${type}"]`);
  root.querySelectorAll("input, textarea").forEach((input) => {
    input.addEventListener("input", () => syncForm(type));
  });

  root.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      syncForm(type);
      const target = button.dataset.add;
      if (target === "flight-passengers") state.flight.data.passengers.push({ fullName: "", ticketNumber: "", passengerType: "", seat: "" });
      if (target === "flight-segments") state.flight.data.segments.push({
        airline: "",
        flightNumber: "",
        class: "",
        departureAirport: "",
        departureCity: "",
        departureDate: "",
        departureTime: "",
        arrivalAirport: "",
        arrivalCity: "",
        arrivalDate: "",
        arrivalTime: "",
        duration: "",
        layoverAfter: "",
        journeyDirection: "departure",
        terminal: "",
        gate: "",
        boardingTime: ""
      });
      if (target === "hotel-guests") state.hotel.data.guests.push({ fullName: "" });
      renderForm(type);
    });
  });

  root.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      syncForm(type);
      const [arrayName, index] = button.dataset.remove.split(":");
      const array = state[type].data[arrayName];
      if (array.length > 1) array.splice(Number(index), 1);
      renderForm(type);
    });
  });
}

function syncForm(type) {
  const root = document.querySelector(`[data-form="${type}"]`);
  root.querySelectorAll("[data-field]").forEach((input) => {
    setPath(state[type].data, input.dataset.field, input.value);
  });
  root.querySelectorAll("[data-array-field]").forEach((input) => {
    const [arrayName, index, field] = input.dataset.arrayField.split(".");
    state[type].data[arrayName][Number(index)][field] = input.value;
  });
}

function setPath(target, path, value) {
  const parts = path.split(".");
  let current = target;
  parts.slice(0, -1).forEach((part) => {
    if (!current[part]) current[part] = {};
    current = current[part];
  });
  current[parts[parts.length - 1]] = value;
}

function field(label, path, value, span = "") {
  return `
    <label class="${span}">
      ${label}
      <input type="text" data-field="${path}" value="${escapeAttribute(value)}">
    </label>
  `;
}

function arrayField(label, arrayName, index, key, value) {
  return `
    <label>
      ${label}
      <input type="text" data-array-field="${arrayName}.${index}.${key}" value="${escapeAttribute(value)}">
    </label>
  `;
}

function flightForm(data) {
  return `
    <div class="form-grid">
      ${field("PNR / Booking Reference", "pnr", data.pnr)}
      ${field("Checked Baggage", "baggage.checkedBaggage", data.baggage?.checkedBaggage)}
      ${field("Cabin Baggage", "baggage.cabinBaggage", data.baggage?.cabinBaggage)}
    </div>

    <h4 class="form-subtitle">Passengers</h4>
    <div class="repeater">
      ${(data.passengers || []).map((passenger, index) => `
        <div class="repeater-item">
          <div class="form-grid">
            ${arrayField("Full Name", "passengers", index, "fullName", passenger.fullName)}
            ${arrayField("Ticket Number", "passengers", index, "ticketNumber", passenger.ticketNumber)}
            ${arrayField("Passenger Type", "passengers", index, "passengerType", passenger.passengerType)}
            ${arrayField("Seat", "passengers", index, "seat", passenger.seat)}
            <div class="inline-actions">
              <button class="danger-button" type="button" data-remove="passengers:${index}">Remove</button>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
    <button class="secondary-button" type="button" data-add="flight-passengers">Add Passenger</button>

    <h4 class="form-subtitle">Flight Segments</h4>
    <div class="repeater">
      ${(data.segments || []).map((segment, index) => `
        <div class="repeater-item">
          <div class="form-grid">
            ${arrayField("Airline Name", "segments", index, "airline", segment.airline)}
            ${arrayField("Flight Number", "segments", index, "flightNumber", segment.flightNumber)}
            ${arrayField("Cabin / Class", "segments", index, "class", segment.class)}
            ${arrayField("Duration", "segments", index, "duration", segment.duration)}
            ${index < data.segments.length - 1 ? arrayField("Transit Stop After This Flight", "segments", index, "layoverAfter", segment.layoverAfter) : ""}
            ${arrayField("Departure Airport", "segments", index, "departureAirport", segment.departureAirport)}
            ${arrayField("Departure City", "segments", index, "departureCity", segment.departureCity)}
            ${arrayField("Departure Date", "segments", index, "departureDate", segment.departureDate)}
            ${arrayField("Departure Time", "segments", index, "departureTime", segment.departureTime)}
            ${arrayField("Arrival Airport", "segments", index, "arrivalAirport", segment.arrivalAirport)}
            ${arrayField("Arrival City", "segments", index, "arrivalCity", segment.arrivalCity)}
            ${arrayField("Arrival Date", "segments", index, "arrivalDate", segment.arrivalDate)}
            ${arrayField("Arrival Time", "segments", index, "arrivalTime", segment.arrivalTime)}
            ${arrayField("Terminal", "segments", index, "terminal", segment.terminal)}
            ${arrayField("Gate", "segments", index, "gate", segment.gate)}
            ${arrayField("Boarding Time", "segments", index, "boardingTime", segment.boardingTime)}
            <div class="inline-actions full-span">
              <button class="danger-button" type="button" data-remove="segments:${index}">Remove</button>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
    <button class="secondary-button" type="button" data-add="flight-segments">Add Segment</button>
  `;
}

function hotelForm(data) {
  return `
    <div class="form-grid">
      ${field("Reservation / Reference Number", "referenceNumber", data.referenceNumber)}
      ${field("Hotel Name", "hotelName", data.hotelName)}
      ${field("Hotel Address", "hotelAddress", data.hotelAddress, "full-span")}
      ${field("Hotel Phone", "hotelPhone", data.hotelPhone)}
      ${field("Number of Guests / Adults", "numberOfGuests", data.numberOfGuests)}
      ${field("Check-in Date", "checkInDate", data.checkInDate)}
      ${field("Check-in Time", "checkInTime", data.checkInTime)}
      ${field("Check-out Date", "checkOutDate", data.checkOutDate)}
      ${field("Check-out Time", "checkOutTime", data.checkOutTime)}
      ${field("Room Type", "roomType", data.roomType)}
      ${field("Bedding Type", "bedding", data.bedding)}
      ${field("Meal Type", "mealType", data.mealType)}
      ${field("GPS / Location", "gps", data.gps)}
      ${field("Map Link", "mapUrl", data.mapUrl, "full-span")}
    </div>

    ${data.mapUrl ? `
      <div class="hotel-preview">
        <a class="download-link secondary-button" href="${escapeAttribute(data.mapUrl)}" target="_blank" rel="noreferrer">Open Hotel Location</a>
      </div>
    ` : ""}

    <h4 class="form-subtitle">Guests</h4>
    <div class="repeater">
      ${(data.guests || []).map((guest, index) => `
        <div class="repeater-item">
          <div class="form-grid">
            ${arrayField("Full Name", "guests", index, "fullName", guest.fullName)}
            <div class="inline-actions">
              <button class="danger-button" type="button" data-remove="guests:${index}">Remove</button>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
    <button class="secondary-button" type="button" data-add="hotel-guests">Add Guest</button>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
