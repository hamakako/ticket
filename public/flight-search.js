const state = {
  searchId: "",
  results: [],
  selectedIndex: null,
  selected: null
};

const searchForm = document.querySelector("[data-search-form]");
const resultsPanel = document.querySelector("[data-results-panel]");
const resultsContainer = document.querySelector("[data-results]");
const resultCount = document.querySelector("[data-result-count]");
const searchStatus = document.querySelector("[data-search-status]");
const selectedSummary = document.querySelector("[data-selected-summary]");
const passengerName = document.querySelector("[data-passenger-name]");
const passportInput = document.querySelector("[data-passport]");
const extractPassportButton = document.querySelector("[data-extract-passport]");
const bookingLinksButton = document.querySelector("[data-booking-links]");
const bookingLinksList = document.querySelector("[data-booking-links-list]");
const generateButton = document.querySelector("[data-generate-proposal]");
const proposalStatus = document.querySelector("[data-proposal-status]");
const downloads = document.querySelector("[data-proposal-downloads]");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: options.body instanceof FormData
      ? options.headers
      : { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed with HTTP ${response.status}.`);
  return payload;
}

function setStatus(element, message, kind = "") {
  element.textContent = message || "";
  element.className = element === searchStatus ? "search-status" : "proposal-status";
  if (kind) element.classList.add(kind);
}

function setBusy(button, busy, busyText) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.label;
}

function formatDuration(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "Duration unavailable";
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return `${hours ? `${hours}h ` : ""}${mins ? `${mins}m` : ""}`.trim();
}

function formatDateTime(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return "Not specified";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${match[3]} ${months[Number(match[2]) - 1]} ${match[1]} · ${match[4]}:${match[5]}`;
}

function flightCode(segment) {
  return `${segment.carrierCode || ""}${segment.flightNumber || ""}` || "Flight";
}

function legHtml(title, leg) {
  if (!leg?.segments?.length) return "";
  return `
    <div class="result-leg">
      <div class="result-leg-title">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(leg.carrier || "Airline")} · ${escapeHtml(formatDuration(leg.durationMinutes))}</span>
      </div>
      ${leg.segments.map((segment, index) => `
        <div class="result-segment">
          <div class="segment-flight">
            <strong>${escapeHtml(flightCode(segment))}</strong>
            <span>${escapeHtml(segment.airline || leg.carrier || "")}</span>
          </div>
          <div class="segment-airport">
            <strong>${escapeHtml(segment.departureAirport)}</strong>
            <span>${escapeHtml(formatDateTime(segment.departureTime))}</span>
          </div>
          <div class="segment-line"><span>${index < leg.segments.length - 1 ? "Connection" : "Flight"}</span></div>
          <div class="segment-airport">
            <strong>${escapeHtml(segment.arrivalAirport)}</strong>
            <span>${escapeHtml(formatDateTime(segment.arrivalTime))}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderResults() {
  resultsContainer.innerHTML = state.results.map((result) => {
    const selected = result.resultIndex === state.selectedIndex;
    const stops = Math.max(0, (result.outbound?.segments?.length || 1) - 1);
    return `
      <article class="flight-result ${selected ? "selected" : ""}">
        <div class="result-topline">
          <div>
            <span class="result-carrier">${escapeHtml(result.outbound?.carrier || "Flight option")}</span>
            <span class="result-meta">${escapeHtml(result.cabinClass.replace(/_/g, " "))} · ${stops ? `${stops} stop${stops > 1 ? "s" : ""}` : "Nonstop"}</span>
          </div>
          <button class="${selected ? "selected-button" : "secondary-button"}" type="button" data-select-result="${result.resultIndex}">${selected ? "Selected" : "Select"}</button>
        </div>
        ${legHtml("Outbound", result.outbound)}
        ${legHtml("Return", result.inbound)}
        ${result.requiresSelfTransfer ? '<p class="transfer-warning">This option may require a self-transfer.</p>' : ""}
      </article>
    `;
  }).join("");

  document.querySelectorAll("[data-select-result]").forEach((button) => {
    button.addEventListener("click", () => selectResult(Number(button.dataset.selectResult)));
  });
}

function selectResult(resultIndex) {
  state.selectedIndex = resultIndex;
  state.selected = state.results.find((result) => result.resultIndex === resultIndex) || null;
  renderResults();
  bookingLinksList.classList.add("hidden");
  bookingLinksList.innerHTML = "";
  downloads.classList.add("hidden");
  setStatus(proposalStatus, "Flight selected. Add the passenger name to generate the proposal.", "ok");
  bookingLinksButton.disabled = !state.selected;
  generateButton.disabled = !state.selected;

  if (!state.selected) {
    selectedSummary.textContent = "Select a flight result to continue.";
    return;
  }
  const first = state.selected.outbound.segments[0];
  const last = state.selected.outbound.segments[state.selected.outbound.segments.length - 1];
  selectedSummary.innerHTML = `
    <span>Selected itinerary</span>
    <strong>${escapeHtml(first.departureAirport)} → ${escapeHtml(last.arrivalAirport)}</strong>
    <small>${escapeHtml(first.airline || state.selected.outbound.carrier)} · ${escapeHtml(formatDateTime(first.departureTime))}</small>
  `;
}

function airportCode(value) {
  const match = String(value || "").toUpperCase().match(/\b([A-Z]{3})\b/);
  return match ? match[1] : String(value || "").trim().toUpperCase();
}

async function search(event) {
  event.preventDefault();
  const submit = searchForm.querySelector('button[type="submit"]');
  const form = new FormData(searchForm);
  const tripType = form.get("tripType");
  const body = {
    tripType,
    origin: airportCode(form.get("origin")),
    destination: airportCode(form.get("destination")),
    departureDate: form.get("departureDate"),
    returnDate: tripType === "round-trip" ? form.get("returnDate") : "",
    adults: form.get("adults"),
    cabinClass: form.get("cabinClass"),
    maxStops: form.get("maxStops")
  };

  try {
    setBusy(submit, true, "Searching live flights...");
    setStatus(searchStatus, "Contacting Ignav...");
    const payload = await api("/api/flight-search", { method: "POST", body: JSON.stringify(body) });
    state.searchId = payload.searchId;
    state.results = payload.itineraries || [];
    state.selectedIndex = null;
    state.selected = null;
    bookingLinksButton.disabled = true;
    generateButton.disabled = true;
    selectedSummary.textContent = "Select a flight result to continue.";
    downloads.classList.add("hidden");
    resultCount.textContent = `${state.results.length} result${state.results.length === 1 ? "" : "s"}`;
    resultsPanel.classList.remove("hidden");
    renderResults();
    setStatus(searchStatus, state.results.length ? "Live results ready." : "No matching flights were found.", state.results.length ? "ok" : "");
  } catch (error) {
    setStatus(searchStatus, error.message, "error");
  } finally {
    setBusy(submit, false, "Searching live flights...");
  }
}

async function extractPassport() {
  const file = passportInput.files[0];
  if (!file) {
    setStatus(proposalStatus, "Choose a passport image or PDF first.", "error");
    return;
  }
  const body = new FormData();
  body.append("passport", file);
  try {
    setBusy(extractPassportButton, true, "Extracting name...");
    setStatus(proposalStatus, "Gemini is reading the passenger name only...");
    const payload = await api("/api/passport-name", { method: "POST", body });
    passengerName.value = payload.fullName === "Not specified" ? "" : payload.fullName;
    setStatus(proposalStatus, passengerName.value ? "Passenger name extracted. Please review it before generating." : "The name could not be read. Enter it manually.", passengerName.value ? "ok" : "error");
  } catch (error) {
    setStatus(proposalStatus, error.message, "error");
  } finally {
    setBusy(extractPassportButton, false, "Extracting name...");
    passportInput.value = "";
  }
}

async function loadBookingLinks() {
  if (!state.selected) return;
  try {
    setBusy(bookingLinksButton, true, "Loading booking options...");
    const payload = await api("/api/flight-search/booking-links", {
      method: "POST",
      body: JSON.stringify({ searchId: state.searchId, resultIndex: state.selectedIndex })
    });
    const links = payload.links || [];
    bookingLinksList.classList.remove("hidden");
    bookingLinksList.innerHTML = links.length
      ? links.map((link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">Continue with ${escapeHtml(link.providerName)}</a>`).join("")
      : "<p>No direct booking links are available for this result.</p>";
  } catch (error) {
    setStatus(proposalStatus, error.message, "error");
  } finally {
    setBusy(bookingLinksButton, false, "Loading booking options...");
  }
}

async function generateProposal() {
  if (!state.selected) return;
  const name = passengerName.value.trim();
  if (!name) {
    setStatus(proposalStatus, "Enter or extract the passenger name first.", "error");
    passengerName.focus();
    return;
  }
  try {
    setBusy(generateButton, true, "Generating A4 files...");
    setStatus(proposalStatus, "Creating branded HTML and PDF proposals...");
    const payload = await api("/api/flight-proposals/generate", {
      method: "POST",
      body: JSON.stringify({
        searchId: state.searchId,
        resultIndex: state.selectedIndex,
        passengerName: name,
        design: document.querySelector("[data-proposal-design]").value
      })
    });
    document.querySelector("[data-proposal-html]").href = payload.generated.html.url;
    document.querySelector("[data-proposal-pdf]").href = payload.generated.pdf.url;
    document.querySelector("[data-proposal-open]").href = payload.generated.html.url;
    downloads.classList.remove("hidden");
    setStatus(proposalStatus, `Proposal ${payload.generated.reference} is ready.`, "ok");
  } catch (error) {
    setStatus(proposalStatus, error.message, "error");
  } finally {
    setBusy(generateButton, false, "Generating A4 files...");
  }
}

function debounce(callback, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

function bindAirportLookup(input, datalist) {
  input.addEventListener("input", debounce(async () => {
    const query = input.value.trim();
    if (query.length < 2) return;
    try {
      const payload = await api(`/api/flight-search/airports?q=${encodeURIComponent(query)}`);
      datalist.innerHTML = (payload.airports || []).map((airport) => (
        `<option value="${escapeHtml(airport.code)}">${escapeHtml(`${airport.city} · ${airport.name} (${airport.country})`)}</option>`
      )).join("");
    } catch {
      datalist.innerHTML = "";
    }
  }));
}

function initialize() {
  const today = new Date().toISOString().slice(0, 10);
  const departureInput = searchForm.elements.departureDate;
  const returnInput = searchForm.elements.returnDate;
  departureInput.min = today;
  returnInput.min = today;
  departureInput.addEventListener("change", () => {
    returnInput.min = departureInput.value || today;
    if (returnInput.value && returnInput.value < returnInput.min) returnInput.value = returnInput.min;
  });

  searchForm.querySelectorAll('input[name="tripType"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const roundTrip = searchForm.elements.tripType.value === "round-trip";
      document.querySelector("[data-return-field]").classList.toggle("hidden", !roundTrip);
      returnInput.required = roundTrip;
      if (!roundTrip) returnInput.value = "";
    });
  });

  bindAirportLookup(searchForm.elements.origin, document.querySelector("#origin-airports"));
  bindAirportLookup(searchForm.elements.destination, document.querySelector("#destination-airports"));
  searchForm.addEventListener("submit", search);
  extractPassportButton.addEventListener("click", extractPassport);
  bookingLinksButton.addEventListener("click", loadBookingLinks);
  generateButton.addEventListener("click", generateProposal);
}

initialize();
