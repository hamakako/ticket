const list = document.querySelector("[data-smart-trip-link-list]");
const statusNode = document.querySelector("[data-smart-trip-manager-status]");
const updateDialog = document.querySelector("[data-ticket-update-dialog]");
const updateForm = document.querySelector("[data-ticket-update-form]");
const updateStatus = document.querySelector("[data-ticket-update-status]");
let smartTripRecords = [];
let updatingTripId = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function displayDate(value) {
  const text = String(value || "");
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replace(" ", "T")}Z`
    : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? String(value || "") : date.toLocaleString();
}

function setStatus(message = "", tone = "") {
  statusNode.textContent = message;
  statusNode.className = `status ${tone}`.trim();
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

async function loadSmartTrips() {
  setStatus("Loading Smart Trip links...");
  try {
    const payload = await api("/api/smart-trips");
    smartTripRecords = payload.records || [];
    renderSmartTrips(smartTripRecords);
    setStatus(`${smartTripRecords.length} active Smart Trip link${smartTripRecords.length === 1 ? "" : "s"}.`, "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function renderSmartTrips(records) {
  if (!records.length) {
    list.innerHTML = '<div class="smart-trip-manager-empty"><strong>No active Smart Trip links</strong><p>Create one from a generated flight itinerary.</p></div>';
    return;
  }
  list.innerHTML = records.map((record) => {
    const destination = [record.destinationCity, record.destinationCountry].filter(Boolean).join(", ");
    const absoluteUrl = new URL(record.url, window.location.origin).toString();
    const pdfUrl = new URL(record.pdfUrl, window.location.origin).toString();
    return `<article class="smart-trip-link-card" data-smart-trip-record="${record.id}">
      <div class="smart-trip-link-main"><span>SMART TRIP</span><h3>${escapeHtml(record.passengerName)}</h3><p>${escapeHtml(destination || "Destination not specified")}</p></div>
      <div class="smart-trip-link-dates"><div><span>Plan</span><strong>${escapeHtml(record.tripDayCount)} day${record.tripDayCount === 1 ? "" : "s"}</strong></div><div><span>Expires</span><strong>${escapeHtml(displayDate(record.expiresAt))}</strong></div></div>
      <label>Customer link<input type="text" readonly value="${escapeHtml(absoluteUrl)}" data-link-value></label>
      <div class="inline-actions">
        <a class="small-button download-link" href="${escapeHtml(absoluteUrl)}" target="_blank" rel="noreferrer">Open</a>
        <a class="small-button download-link" href="${escapeHtml(pdfUrl)}">PDF</a>
        <button class="small-button" type="button" data-copy-smart-trip>Copy</button>
        <button class="secondary-button" type="button" data-update-smart-trip="${record.id}">Replace Ticket</button>
        <button class="danger-button" type="button" data-delete-smart-trip="${record.id}">Delete</button>
      </div>
    </article>`;
  }).join("");

  list.querySelectorAll("[data-copy-smart-trip]").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.closest("[data-smart-trip-record]").querySelector("[data-link-value]").value;
      await navigator.clipboard.writeText(value);
      setStatus("Smart Trip link copied.", "ok");
    });
  });
  list.querySelectorAll("[data-update-smart-trip]").forEach((button) => {
    button.addEventListener("click", () => openUpdateDialog(Number(button.dataset.updateSmartTrip)));
  });
  list.querySelectorAll("[data-delete-smart-trip]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Delete this Smart Trip link permanently?")) return;
      button.disabled = true;
      try {
        await api(`/api/smart-trips/${button.dataset.deleteSmartTrip}`, { method: "DELETE" });
        await loadSmartTrips();
      } catch (error) {
        button.disabled = false;
        setStatus(error.message, "error");
      }
    });
  });
}

function openUpdateDialog(id) {
  const record = smartTripRecords.find((item) => item.id === id);
  if (!record) return;
  updatingTripId = id;
  updateForm.reset();
  updateStatus.textContent = "";
  updateStatus.className = "status";
  document.querySelector("[data-ticket-update-trip]").innerHTML = `
    <strong>${escapeHtml(record.passengerName)}</strong>
    <span>${escapeHtml([record.destinationCity, record.destinationCountry].filter(Boolean).join(", "))} · ${escapeHtml(record.tripDayCount)} day plan</span>
  `;
  updateDialog.showModal();
}

function closeUpdateDialog() {
  if (updateForm.querySelector("[data-ticket-update-submit]").disabled) return;
  updateDialog.close();
  updatingTripId = null;
}

document.querySelector("[data-ticket-update-close]").addEventListener("click", closeUpdateDialog);
document.querySelector("[data-ticket-update-cancel]").addEventListener("click", closeUpdateDialog);
updateDialog.addEventListener("click", (event) => {
  if (event.target === updateDialog) closeUpdateDialog();
});

updateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!updatingTripId) return;
  const submitButton = updateForm.querySelector("[data-ticket-update-submit]");
  submitButton.disabled = true;
  updateStatus.textContent = "Reading the new ticket and rebuilding the complete daily plan with Gemini Pro. This may take 1-2 minutes...";
  updateStatus.className = "status";
  try {
    const payload = await api(`/api/smart-trips/${updatingTripId}/update-ticket`, {
      method: "POST",
      body: new FormData(updateForm)
    });
    updateStatus.textContent = `Updated successfully. The same customer link now has a ${payload.smartTrip.tripDayCount}-day plan.`;
    updateStatus.className = "status ok";
    await loadSmartTrips();
    setTimeout(() => {
      updateDialog.close();
      updatingTripId = null;
    }, 1200);
  } catch (error) {
    updateStatus.textContent = error.message;
    updateStatus.className = "status error";
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("[data-refresh-smart-trips]").addEventListener("click", loadSmartTrips);
loadSmartTrips();
