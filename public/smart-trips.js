const list = document.querySelector("[data-smart-trip-link-list]");
const statusNode = document.querySelector("[data-smart-trip-manager-status]");

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
    renderSmartTrips(payload.records || []);
    setStatus(`${payload.records.length} active Smart Trip link${payload.records.length === 1 ? "" : "s"}.`, "ok");
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
    return `<article class="smart-trip-link-card" data-smart-trip-record="${record.id}">
      <div class="smart-trip-link-main"><span>SMART TRIP</span><h3>${escapeHtml(record.passengerName)}</h3><p>${escapeHtml(destination || "Destination not specified")}</p></div>
      <div class="smart-trip-link-dates"><div><span>Created</span><strong>${escapeHtml(displayDate(record.createdAt))}</strong></div><div><span>Expires</span><strong>${escapeHtml(displayDate(record.expiresAt))}</strong></div></div>
      <label>Customer link<input type="text" readonly value="${escapeHtml(absoluteUrl)}" data-link-value></label>
      <div class="inline-actions">
        <a class="small-button download-link" href="${escapeHtml(absoluteUrl)}" target="_blank" rel="noreferrer">Open</a>
        <button class="small-button" type="button" data-copy-smart-trip>Copy</button>
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

document.querySelector("[data-refresh-smart-trips]").addEventListener("click", loadSmartTrips);
loadSmartTrips();
