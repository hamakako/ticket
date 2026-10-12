const NOT_SPECIFIED = "Not specified";
const MAX_OPTIONS = 10;

const optionsRoot = document.querySelector("[data-options]");
const customerNameInput = document.querySelector("[data-customer-name]");
const generateButton = document.querySelector("[data-generate-prices]");
const generateStatus = document.querySelector("[data-generate-status]");
const downloads = document.querySelector("[data-price-downloads]");

const state = { options: [blankOption(0)] };

function blankSegment() {
  return {
    airline: "",
    flightNumber: "",
    class: "Economy",
    departureAirport: "",
    departureCity: "",
    departureDate: "",
    departureTime: "",
    arrivalAirport: "",
    arrivalCity: "",
    arrivalDate: "",
    arrivalTime: "",
    duration: "",
    layoverAfter: ""
  };
}

function blankOption(index) {
  return {
    title: `Option ${index + 1}`,
    price: "",
    currency: "USD",
    notes: "",
    pastedText: "",
    itinerary: {
      segments: [blankSegment()],
      baggage: { checkedBaggage: "", cabinBaggage: "" }
    },
    status: "",
    statusKind: ""
  };
}

function cleanExtractedValue(value) {
  const text = String(value ?? "").trim();
  return text === NOT_SPECIFIED ? "" : text;
}

function normalizeExtractedItinerary(data = {}) {
  const segments = Array.isArray(data.segments) && data.segments.length
    ? data.segments.map((segment) => {
      const normalized = blankSegment();
      Object.keys(normalized).forEach((key) => {
        normalized[key] = cleanExtractedValue(segment?.[key]);
      });
      return normalized;
    })
    : [blankSegment()];
  return {
    segments,
    baggage: {
      checkedBaggage: cleanExtractedValue(data.baggage?.checkedBaggage),
      cabinBaggage: cleanExtractedValue(data.baggage?.cabinBaggage)
    }
  };
}

function extractionStatus(itinerary, sourceLabel) {
  const requiredFields = [
    "airline",
    "flightNumber",
    "class",
    "departureAirport",
    "departureCity",
    "departureDate",
    "departureTime",
    "arrivalAirport",
    "arrivalCity",
    "arrivalDate",
    "arrivalTime",
    "duration"
  ];
  const missingCount = (itinerary.segments || []).reduce((total, segment) => (
    total + requiredFields.filter((field) => !String(segment?.[field] || "").trim()).length
  ), 0) + ["checkedBaggage", "cabinBaggage"].filter((field) => (
    !String(itinerary.baggage?.[field] || "").trim()
  )).length;
  if (!missingCount) {
    return `${sourceLabel} extracted and all essential flight details were filled. Please review them below.`;
  }
  return `${sourceLabel} extracted. AI filled every supported detail; ${missingCount} field${missingCount === 1 ? " was" : "s were"} not shown clearly in the source and should be reviewed.`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function input(label, field, value, optionIndex, extra = "") {
  return `<label>${label}<input type="text" value="${escapeHtml(value)}" data-option-index="${optionIndex}" data-option-field="${field}" ${extra}></label>`;
}

function segmentInput(label, field, value, optionIndex, segmentIndex, extra = "") {
  return `<label>${label}<input type="text" value="${escapeHtml(value)}" data-option-index="${optionIndex}" data-segment-index="${segmentIndex}" data-segment-field="${field}" ${extra}></label>`;
}

function renderOptions() {
  optionsRoot.innerHTML = state.options.map((option, optionIndex) => `
    <article class="ticket-price-option" data-option-card="${optionIndex}">
      <div class="ticket-price-option-heading">
        <div class="step-number-heading">
          <span>2</span>
          <div><p>Ticket option ${optionIndex + 1}</p><h3>${escapeHtml(option.title || `Option ${optionIndex + 1}`)}</h3></div>
        </div>
        ${state.options.length > 1 ? `<button class="danger-button" type="button" data-remove-option="${optionIndex}">Remove Option</button>` : ""}
      </div>

      <div class="ticket-price-core-grid">
        ${input("Option title", "title", option.title, optionIndex, 'maxlength="80" placeholder="Example: Best direct flight"')}
        <label>Ticket price<input type="text" inputmode="decimal" value="${escapeHtml(option.price)}" data-option-index="${optionIndex}" data-option-field="price" placeholder="0.00"></label>
        <label>Currency<select data-option-index="${optionIndex}" data-option-field="currency">
          ${["USD", "EUR", "GBP", "TRY", "IQD"].map((currency) => `<option value="${currency}" ${option.currency === currency ? "selected" : ""}>${currency}</option>`).join("")}
        </select></label>
      </div>

      <div class="ticket-price-source-grid">
        <div class="ticket-price-source">
          <h4>Upload ticket screenshot, image, or PDF</h4>
          <input type="file" data-option-file="${optionIndex}" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp">
          <button class="secondary-button" type="button" data-extract-file="${optionIndex}">Extract Uploaded Ticket</button>
        </div>
        <div class="ticket-price-source">
          <h4>Or paste route / ticket text</h4>
          <textarea maxlength="100000" data-option-index="${optionIndex}" data-option-field="pastedText" placeholder="Paste the airline option, email, or route details here...">${escapeHtml(option.pastedText)}</textarea>
          <button class="secondary-button" type="button" data-extract-text="${optionIndex}">Extract Pasted Text</button>
        </div>
      </div>
      <p class="status ${escapeHtml(option.statusKind)}" data-option-status="${optionIndex}" aria-live="polite">${escapeHtml(option.status)}</p>

      <div class="ticket-price-editor">
        <div class="ticket-price-editor-heading">
          <div><p class="eyebrow">Review Details</p><h4>Editable flight information</h4></div>
          <button class="secondary-button small-button" type="button" data-add-segment="${optionIndex}">+ Add Flight</button>
        </div>
        <div class="ticket-price-segments">
          ${option.itinerary.segments.map((segment, segmentIndex) => `
            <section class="ticket-price-segment">
              <div class="ticket-price-segment-heading"><strong>Flight ${segmentIndex + 1}</strong>${option.itinerary.segments.length > 1 ? `<button class="danger-button" type="button" data-remove-segment="${optionIndex}:${segmentIndex}">Remove</button>` : ""}</div>
              <details class="ticket-price-segment-ai" data-segment-ai="${optionIndex}:${segmentIndex}">
                <summary>Extract this flight with AI</summary>
                <div class="ticket-price-segment-ai-grid">
                  <div>
                    <label for="segment-file-${optionIndex}-${segmentIndex}">Upload screenshot, image, or PDF</label>
                    <input id="segment-file-${optionIndex}-${segmentIndex}" type="file" data-segment-file-source="${optionIndex}:${segmentIndex}" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp">
                    <button class="secondary-button small-button" type="button" data-extract-segment-file="${optionIndex}:${segmentIndex}">Extract Uploaded Route</button>
                  </div>
                  <div>
                    <label for="segment-text-${optionIndex}-${segmentIndex}">Or paste this flight / route</label>
                    <textarea id="segment-text-${optionIndex}-${segmentIndex}" maxlength="100000" data-segment-text-source="${optionIndex}:${segmentIndex}" placeholder="Paste only this new flight or route here..."></textarea>
                    <button class="secondary-button small-button" type="button" data-extract-segment-text="${optionIndex}:${segmentIndex}">Extract Pasted Route</button>
                  </div>
                </div>
              </details>
              <div class="ticket-price-segment-grid">
                ${segmentInput("Airline", "airline", segment.airline, optionIndex, segmentIndex, 'placeholder="Airline name"')}
                ${segmentInput("Flight number", "flightNumber", segment.flightNumber, optionIndex, segmentIndex, 'placeholder="TK317"')}
                ${segmentInput("Cabin / class", "class", segment.class, optionIndex, segmentIndex, 'placeholder="Economy"')}
                ${segmentInput("Duration", "duration", segment.duration, optionIndex, segmentIndex, 'placeholder="2h 45m"')}
                ${segmentInput("Departure airport", "departureAirport", segment.departureAirport, optionIndex, segmentIndex, 'placeholder="EBL"')}
                ${segmentInput("Departure city", "departureCity", segment.departureCity, optionIndex, segmentIndex, 'placeholder="Erbil"')}
                ${segmentInput("Departure date", "departureDate", segment.departureDate, optionIndex, segmentIndex, 'placeholder="20 October 2026"')}
                ${segmentInput("Departure time", "departureTime", segment.departureTime, optionIndex, segmentIndex, 'placeholder="05:40"')}
                ${segmentInput("Arrival airport", "arrivalAirport", segment.arrivalAirport, optionIndex, segmentIndex, 'placeholder="IST"')}
                ${segmentInput("Arrival city", "arrivalCity", segment.arrivalCity, optionIndex, segmentIndex, 'placeholder="Istanbul"')}
                ${segmentInput("Arrival date", "arrivalDate", segment.arrivalDate, optionIndex, segmentIndex, 'placeholder="20 October 2026"')}
                ${segmentInput("Arrival time", "arrivalTime", segment.arrivalTime, optionIndex, segmentIndex, 'placeholder="08:25"')}
                ${segmentInput("Transit after this flight", "layoverAfter", segment.layoverAfter, optionIndex, segmentIndex, 'placeholder="Optional, example: 3h 10m"')}
              </div>
            </section>`).join("")}
        </div>
        <div class="ticket-price-baggage-grid">
          <label>Checked baggage<input type="text" value="${escapeHtml(option.itinerary.baggage.checkedBaggage)}" data-option-index="${optionIndex}" data-baggage-field="checkedBaggage" placeholder="Example: 23 kg"></label>
          <label>Cabin baggage<input type="text" value="${escapeHtml(option.itinerary.baggage.cabinBaggage)}" data-option-index="${optionIndex}" data-baggage-field="cabinBaggage" placeholder="Example: 7 kg"></label>
        </div>
        <label class="ticket-price-notes">Option notes<textarea maxlength="500" data-option-index="${optionIndex}" data-option-field="notes" placeholder="Optional price or fare notes">${escapeHtml(option.notes)}</textarea></label>
      </div>
    </article>`).join("");
}

function setOptionStatus(index, message, kind = "") {
  const option = state.options[index];
  if (!option) return;
  option.status = message;
  option.statusKind = kind;
  const element = document.querySelector(`[data-option-status="${index}"]`);
  if (element) {
    element.textContent = message;
    element.className = `status ${kind}`.trim();
  }
}

function setGenerateStatus(message, kind = "") {
  generateStatus.textContent = message;
  generateStatus.className = `status ${kind}`.trim();
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The request could not be completed.");
  return body;
}

async function extractFile(index) {
  const fileInput = document.querySelector(`[data-option-file="${index}"]`);
  const file = fileInput?.files?.[0];
  if (!file) {
    setOptionStatus(index, "Please choose a screenshot, image, or PDF first.", "error");
    return;
  }
  setOptionStatus(index, "Gemini is extracting this ticket option...");
  const formData = new FormData();
  formData.append("document", file);
  const body = await api("/api/ticket-prices/extract", { method: "POST", body: formData });
  state.options[index].itinerary = normalizeExtractedItinerary(body.data);
  state.options[index].status = extractionStatus(state.options[index].itinerary, "Uploaded ticket");
  state.options[index].statusKind = "ok";
  renderOptions();
}

async function extractText(index) {
  const text = state.options[index]?.pastedText?.trim();
  if (!text) {
    setOptionStatus(index, "Paste the route or ticket text first.", "error");
    return;
  }
  setOptionStatus(index, "Gemini is extracting this pasted option...");
  const body = await api("/api/ticket-prices/extract-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  state.options[index].itinerary = normalizeExtractedItinerary(body.data);
  state.options[index].status = extractionStatus(state.options[index].itinerary, "Pasted ticket text");
  state.options[index].statusKind = "ok";
  renderOptions();
}

function applySegmentExtraction(optionIndex, segmentIndex, data, sourceLabel) {
  const option = state.options[optionIndex];
  if (!option) return;
  const extracted = normalizeExtractedItinerary(data);
  option.itinerary.segments.splice(segmentIndex, 1, ...extracted.segments);
  if (extracted.baggage.checkedBaggage) {
    option.itinerary.baggage.checkedBaggage = extracted.baggage.checkedBaggage;
  }
  if (extracted.baggage.cabinBaggage) {
    option.itinerary.baggage.cabinBaggage = extracted.baggage.cabinBaggage;
  }
  option.status = extractionStatus(extracted, sourceLabel);
  option.statusKind = "ok";
  renderOptions();
  document.querySelector(`[data-segment-ai="${optionIndex}:${segmentIndex}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function extractSegmentFile(optionIndex, segmentIndex) {
  const sourceKey = `${optionIndex}:${segmentIndex}`;
  const file = document.querySelector(`[data-segment-file-source="${sourceKey}"]`)?.files?.[0];
  if (!file) {
    setOptionStatus(optionIndex, "Please choose a screenshot, image, or PDF for this flight first.", "error");
    return;
  }
  setOptionStatus(optionIndex, `Gemini is extracting Flight ${segmentIndex + 1}...`);
  const formData = new FormData();
  formData.append("document", file);
  const body = await api("/api/ticket-prices/extract", { method: "POST", body: formData });
  applySegmentExtraction(optionIndex, segmentIndex, body.data, `Flight ${segmentIndex + 1}`);
}

async function extractSegmentText(optionIndex, segmentIndex) {
  const sourceKey = `${optionIndex}:${segmentIndex}`;
  const text = document.querySelector(`[data-segment-text-source="${sourceKey}"]`)?.value?.trim();
  if (!text) {
    setOptionStatus(optionIndex, "Please paste the new flight or route first.", "error");
    return;
  }
  setOptionStatus(optionIndex, `Gemini is extracting Flight ${segmentIndex + 1}...`);
  const body = await api("/api/ticket-prices/extract-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  applySegmentExtraction(optionIndex, segmentIndex, body.data, `Flight ${segmentIndex + 1}`);
}

function updateStateFromField(target) {
  const optionIndex = Number(target.dataset.optionIndex);
  const option = state.options[optionIndex];
  if (!option) return;
  if (target.dataset.optionField) option[target.dataset.optionField] = target.value;
  if (target.dataset.baggageField) option.itinerary.baggage[target.dataset.baggageField] = target.value;
  if (target.dataset.segmentField) {
    const segment = option.itinerary.segments[Number(target.dataset.segmentIndex)];
    if (segment) segment[target.dataset.segmentField] = target.value;
  }
}

optionsRoot.addEventListener("input", (event) => updateStateFromField(event.target));
optionsRoot.addEventListener("change", (event) => updateStateFromField(event.target));

optionsRoot.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  try {
    if (button.dataset.removeOption !== undefined) {
      state.options.splice(Number(button.dataset.removeOption), 1);
      state.options.forEach((option, index) => {
        if (!option.title || /^Option \d+$/.test(option.title)) option.title = `Option ${index + 1}`;
      });
      renderOptions();
      return;
    }
    if (button.dataset.addSegment !== undefined) {
      const optionIndex = Number(button.dataset.addSegment);
      const segmentIndex = state.options[optionIndex].itinerary.segments.push(blankSegment()) - 1;
      renderOptions();
      const extractor = document.querySelector(`[data-segment-ai="${optionIndex}:${segmentIndex}"]`);
      if (extractor) {
        extractor.open = true;
        extractor.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    if (button.dataset.removeSegment !== undefined) {
      const [optionIndex, segmentIndex] = button.dataset.removeSegment.split(":").map(Number);
      state.options[optionIndex].itinerary.segments.splice(segmentIndex, 1);
      renderOptions();
      return;
    }
    if (button.dataset.extractSegmentFile !== undefined) {
      const [optionIndex, segmentIndex] = button.dataset.extractSegmentFile.split(":").map(Number);
      await extractSegmentFile(optionIndex, segmentIndex);
    }
    if (button.dataset.extractSegmentText !== undefined) {
      const [optionIndex, segmentIndex] = button.dataset.extractSegmentText.split(":").map(Number);
      await extractSegmentText(optionIndex, segmentIndex);
    }
    if (button.dataset.extractFile !== undefined) await extractFile(Number(button.dataset.extractFile));
    if (button.dataset.extractText !== undefined) await extractText(Number(button.dataset.extractText));
  } catch (error) {
    const source = button.dataset.extractSegmentFile
      ?? button.dataset.extractSegmentText
      ?? button.dataset.extractFile
      ?? button.dataset.extractText;
    const index = Number(String(source).split(":")[0]);
    setOptionStatus(index, error.message, "error");
  }
});

document.querySelector("[data-add-option]").addEventListener("click", () => {
  if (state.options.length >= MAX_OPTIONS) {
    setGenerateStatus(`A quotation can contain a maximum of ${MAX_OPTIONS} options.`, "error");
    return;
  }
  state.options.push(blankOption(state.options.length));
  renderOptions();
  document.querySelector(`[data-option-card="${state.options.length - 1}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
});

generateButton.addEventListener("click", async () => {
  downloads.classList.add("hidden");
  setGenerateStatus("Creating the branded HTML and PDF quotation...");
  generateButton.disabled = true;
  try {
    const body = await api("/api/ticket-prices/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName: customerNameInput.value, options: state.options })
    });
    const generated = body.generated;
    document.querySelector("[data-open-html]").href = generated.html.url;
    document.querySelector("[data-download-html]").href = generated.html.url;
    document.querySelector("[data-open-pdf]").href = generated.pdf.url;
    document.querySelector("[data-download-pdf]").href = generated.pdf.url;
    downloads.classList.remove("hidden");
    setGenerateStatus(`Quotation ${generated.reference} is ready.`, "ok");
  } catch (error) {
    setGenerateStatus(error.message, "error");
  } finally {
    generateButton.disabled = false;
  }
});

renderOptions();
