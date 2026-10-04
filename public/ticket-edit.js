const fileInput = document.querySelector("[data-ticket-file]");
const processButton = document.querySelector("[data-ticket-process]");
const resetButton = document.querySelector("[data-ticket-reset]");
const generateButton = document.querySelector("[data-ticket-generate]");
const editor = document.querySelector("[data-ticket-editor]");
const status = document.querySelector("[data-ticket-status]");
const generateStatus = document.querySelector("[data-ticket-generate-status]");
const downloads = document.querySelector("[data-ticket-downloads]");

const state = {
  data: null,
  sourceFile: "",
  recordId: null
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function editableValue(value) {
  return value === "Not specified" ? "" : String(value || "");
}

function displayValue(value) {
  return escapeHtml(value && value !== "Not specified" ? value : "Not specified");
}

function validDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

function parseExtractedDate(value) {
  const text = editableValue(value).trim();
  if (!text) return null;

  let match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) return validDate(Number(match[3]), Number(match[2]), Number(match[1]));

  match = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : validDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

function formatCalendarDate(date) {
  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    date.getFullYear()
  ].join("/");
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload;
}

function setStatus(element, message = "", kind = "") {
  element.textContent = message;
  element.className = `status${kind ? ` ${kind}` : ""}`;
}

function setBusy(button, busy, busyLabel, normalLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : normalLabel;
}

function renderEditor() {
  if (!state.data) {
    editor.innerHTML = '<p class="ticket-edit-empty">Upload and process a ticket to begin editing.</p>';
    generateButton.disabled = true;
    return;
  }

  const passengers = state.data.passengers || [];
  const segments = state.data.segments || [];

  editor.innerHTML = `
    <div class="ticket-edit-fields">
      <label>
        PNR / Booking Reference
        <input type="text" maxlength="30" value="${escapeHtml(editableValue(state.data.pnr))}" data-edit-pnr>
      </label>

      <div>
        <h4 class="form-subtitle">Passenger name and ticket number</h4>
        <div class="ticket-edit-passengers">
          ${passengers.map((passenger, index) => `
            <div class="ticket-edit-passenger">
              <label>
                Passenger ${index + 1} name
                <input type="text" maxlength="120" value="${escapeHtml(editableValue(passenger.fullName))}" data-edit-passenger-name="${index}">
              </label>
              <label>
                Ticket number
                <input type="text" maxlength="40" value="${escapeHtml(editableValue(passenger.ticketNumber))}" data-edit-ticket-number="${index}">
              </label>
            </div>
          `).join("")}
        </div>
      </div>

      <div>
        <h4 class="form-subtitle">Travel dates</h4>
        <div class="ticket-edit-dates">
          ${segments.map((segment, index) => `
            <div class="ticket-edit-date">
              <h4>${displayValue(segment.departureCity)} → ${displayValue(segment.arrivalCity)} · ${displayValue(segment.airline)} ${displayValue(segment.flightNumber)}</h4>
              <label>
                Departure date
                <input type="text" maxlength="30" autocomplete="off" placeholder="Select a date" value="${escapeHtml(editableValue(segment.departureDate))}" data-ticket-date data-date-kind="departure" data-segment-index="${index}" data-edit-departure-date="${index}">
              </label>
              <label>
                Arrival date
                <input type="text" maxlength="30" autocomplete="off" placeholder="Select a date" value="${escapeHtml(editableValue(segment.arrivalDate))}" data-ticket-date data-date-kind="arrival" data-segment-index="${index}" data-edit-arrival-date="${index}">
              </label>
            </div>
          `).join("")}
        </div>
      </div>
    </div>

    <div class="ticket-edit-summary">
      <h4>Other extracted details (read-only)</h4>
      ${segments.map((segment, index) => `
        <div class="ticket-edit-summary-grid">
          <div><span>Segment</span><strong>${index + 1}</strong></div>
          <div><span>Airline / Flight</span><strong>${displayValue(segment.airline)} ${displayValue(segment.flightNumber)}</strong></div>
          <div><span>Class</span><strong>${displayValue(segment.class)}</strong></div>
          <div><span>Route</span><strong>${displayValue(segment.departureAirport)} → ${displayValue(segment.arrivalAirport)}</strong></div>
          <div><span>Departure time</span><strong>${displayValue(segment.departureTime)}</strong></div>
          <div><span>Arrival time</span><strong>${displayValue(segment.arrivalTime)}</strong></div>
          <div><span>Flight duration</span><strong>${displayValue(segment.duration)}</strong></div>
          ${index < segments.length - 1 ? `<div><span>Transit after flight</span><strong>${displayValue(segment.layoverAfter)}</strong></div>` : ""}
        </div>
      `).join("")}
      <div class="ticket-edit-summary-grid">
        <div><span>Checked baggage</span><strong>${displayValue(state.data.baggage?.checkedBaggage)}</strong></div>
        <div><span>Cabin baggage</span><strong>${displayValue(state.data.baggage?.cabinBaggage)}</strong></div>
      </div>
    </div>
  `;

  editor.querySelector("[data-edit-pnr]").addEventListener("input", (event) => {
    state.data.pnr = event.target.value;
  });
  editor.querySelectorAll("[data-edit-passenger-name]").forEach((input) => {
    input.addEventListener("input", (event) => {
      state.data.passengers[Number(input.dataset.editPassengerName)].fullName = event.target.value;
    });
  });
  editor.querySelectorAll("[data-edit-ticket-number]").forEach((input) => {
    input.addEventListener("input", (event) => {
      state.data.passengers[Number(input.dataset.editTicketNumber)].ticketNumber = event.target.value;
    });
  });
  editor.querySelectorAll("[data-edit-departure-date]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const segmentIndex = Number(input.dataset.editDepartureDate);
      state.data.segments[segmentIndex].departureDate = event.target.value;
      if (segmentIndex > 0) state.data.segments[segmentIndex - 1].layoverAfter = "";
    });
  });
  editor.querySelectorAll("[data-edit-arrival-date]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const segmentIndex = Number(input.dataset.editArrivalDate);
      state.data.segments[segmentIndex].arrivalDate = event.target.value;
      state.data.segments[segmentIndex].layoverAfter = "";
    });
  });

  initializeDatePickers();

  generateButton.disabled = false;
}

function initializeDatePickers() {
  editor.querySelectorAll("[data-ticket-date]").forEach((input) => {
    const segmentIndex = Number(input.dataset.segmentIndex);
    const field = input.dataset.dateKind === "departure" ? "departureDate" : "arrivalDate";
    const originalValue = editableValue(state.data.segments[segmentIndex][field]);
    const parsedDate = parseExtractedDate(originalValue);

    if (window.flatpickr) {
      window.flatpickr(input, {
        allowInput: true,
        animate: true,
        dateFormat: "d/m/Y",
        defaultDate: parsedDate || undefined,
        disableMobile: true,
        onChange: (_dates, dateText) => {
          state.data.segments[segmentIndex][field] = dateText;
        },
        onClose: (_dates, dateText) => {
          state.data.segments[segmentIndex][field] = dateText || input.value;
        }
      });
      if (parsedDate) state.data.segments[segmentIndex][field] = formatCalendarDate(parsedDate);
      else if (originalValue) input.value = originalValue;
      return;
    }

    input.type = "date";
    if (parsedDate) {
      input.value = [
        parsedDate.getFullYear(),
        String(parsedDate.getMonth() + 1).padStart(2, "0"),
        String(parsedDate.getDate()).padStart(2, "0")
      ].join("-");
    }
    input.addEventListener("change", () => {
      state.data.segments[segmentIndex][field] = input.value;
    });
  });
}

function resetPage() {
  state.data = null;
  state.sourceFile = "";
  state.recordId = null;
  fileInput.value = "";
  downloads.classList.add("hidden");
  setStatus(status);
  setStatus(generateStatus);
  renderEditor();
}

async function processTicket() {
  const file = fileInput.files?.[0];
  if (!file) {
    setStatus(status, "Choose a ticket PDF or image first.", "error");
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    setStatus(status, "The selected file is larger than 20 MB.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("document", file);
  downloads.classList.add("hidden");
  setBusy(processButton, true, "Extracting ticket...", "Process with Gemini");
  setStatus(status, "Gemini is reading the ticket. This can take a moment.");
  setStatus(generateStatus);

  try {
    const payload = await api("/api/process/flight", { method: "POST", body: formData });
    state.data = payload.data;
    state.sourceFile = payload.sourceFile || "";
    state.recordId = null;
    renderEditor();
    setStatus(status, "Ticket extracted. Review the four editable details below.", "ok");
  } catch (error) {
    setStatus(status, error.message, "error");
  } finally {
    setBusy(processButton, false, "Extracting ticket...", "Process with Gemini");
  }
}

function setDownload(selector, generated) {
  const link = document.querySelector(selector);
  link.href = generated.url;
  if (selector.includes("download")) link.setAttribute("download", generated.fileName);
}

async function saveRecord() {
  const options = {
    method: state.recordId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: state.data, sourceFile: state.sourceFile })
  };
  const url = state.recordId ? `/api/flight-itineraries/${state.recordId}` : "/api/flight-itineraries";
  const payload = await api(url, options);
  state.recordId = payload.record.id;
  state.data = payload.record;
}

async function generateTicket() {
  if (!state.data) {
    setStatus(generateStatus, "Upload and process a ticket first.", "error");
    return;
  }

  downloads.classList.add("hidden");
  setBusy(generateButton, true, "Generating itinerary...", "Generate HTML & PDF");
  setStatus(generateStatus, "Saving the edits and creating the branded files.");

  try {
    await saveRecord();
    const design = document.querySelector("[data-ticket-design]").value;
    const htmlPayload = await api(`/api/flight-itineraries/${state.recordId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ design })
    });
    setDownload("[data-ticket-open-html]", htmlPayload.generated);
    setDownload("[data-ticket-download-html]", htmlPayload.generated);

    const pdfPayload = await api(`/api/flight-itineraries/${state.recordId}/generate-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ design })
    });
    setDownload("[data-ticket-open-pdf]", pdfPayload.generated);
    setDownload("[data-ticket-download-pdf]", pdfPayload.generated);
    renderEditor();
    downloads.classList.remove("hidden");
    setStatus(generateStatus, "The branded HTML and A4 PDF are ready.", "ok");
  } catch (error) {
    setStatus(generateStatus, error.message, "error");
  } finally {
    setBusy(generateButton, false, "Generating itinerary...", "Generate HTML & PDF");
  }
}

processButton.addEventListener("click", processTicket);
resetButton.addEventListener("click", resetPage);
generateButton.addEventListener("click", generateTicket);
renderEditor();
