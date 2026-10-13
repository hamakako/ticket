const API_BASE = "https://mk-ticket-itinerary.onrender.com";

let selectedType = "flight";
let generatedUrls = null;

const generateButton = document.querySelector("[data-generate]");
const statusNode = document.querySelector("[data-status]");
const progressNode = document.querySelector("[data-progress]");
const progressTitle = document.querySelector("[data-progress-title]");
const progressDetail = document.querySelector("[data-progress-detail]");
const resultNode = document.querySelector("[data-result]");

function absoluteUrl(path) {
  return new URL(path, API_BASE).href;
}

function setStatus(message = "") {
  statusNode.textContent = message;
}

function setBusy(isBusy, title = "Reading current page...", detail = "This can take 20-60 seconds.") {
  generateButton.disabled = isBusy;
  progressNode.classList.toggle("hidden", !isBusy);
  progressTitle.textContent = title;
  progressDetail.textContent = detail;
}

function updateType(type) {
  selectedType = type;
  document.querySelectorAll("[data-type]").forEach((button) => {
    button.classList.toggle("active", button.dataset.type === type);
  });
  generateButton.textContent = type === "flight" ? "Create Flight Ticket" : "Create Hotel Voucher";
  resultNode.classList.add("hidden");
  generatedUrls = null;
  setStatus();
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active Chrome page was found.");
  return tab;
}

async function readCurrentPage(tab) {
  let pageText = "";
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => String(document.body?.innerText || document.documentElement?.innerText || "").slice(0, 100000)
    });
    pageText = String(result?.[0]?.result || "");
  } catch {
    // Chrome's built-in PDF viewer and protected pages may block DOM access.
  }

  let screenshot = "";
  try {
    screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  } catch {
    // Text-only extraction still works when Chrome cannot capture the tab.
  }

  if (pageText.trim().length < 10 && !screenshot) {
    throw new Error("Chrome could not read this page. Open the ticket or hotel details in a normal browser tab and try again.");
  }
  return { pageText, screenshot };
}

async function screenshotFile(dataUrl) {
  if (!dataUrl) return null;
  const response = await fetch(dataUrl);
  return new File([await response.blob()], "current-page.png", { type: "image/png" });
}

async function generateFromCurrentPage() {
  setStatus();
  resultNode.classList.add("hidden");
  setBusy(true);
  try {
    const tab = await activeTab();
    if (!/^(?:https?|file):/i.test(tab.url || "")) {
      throw new Error("Open the airline, ticket, hotel, email, or PDF page first.");
    }

    const source = await readCurrentPage(tab);
    setBusy(true, "Gemini is extracting the details...", "The finished HTML and PDF will open automatically.");

    const form = new FormData();
    form.append("pageText", source.pageText);
    form.append("design", document.querySelector("[data-design]").value);
    const screenshot = await screenshotFile(source.screenshot);
    if (screenshot) form.append("screenshot", screenshot);

    const response = await fetch(`${API_BASE}/api/extension/generate/${selectedType}`, {
      method: "POST",
      body: form
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The document could not be generated.");

    generatedUrls = {
      html: absoluteUrl(payload.generated.html.url),
      pdf: absoluteUrl(payload.generated.pdf.url)
    };
    document.querySelector("[data-result-title]").textContent = payload.record.title || "Branded document created";
    resultNode.classList.remove("hidden");
    await chrome.tabs.create({ url: generatedUrls.html });
  } catch (error) {
    setStatus(error.message || "The document could not be generated.");
  } finally {
    setBusy(false);
  }
}

document.querySelectorAll("[data-type]").forEach((button) => {
  button.addEventListener("click", () => updateType(button.dataset.type));
});

generateButton.addEventListener("click", generateFromCurrentPage);
document.querySelector("[data-open-html]").addEventListener("click", () => {
  if (generatedUrls?.html) chrome.tabs.create({ url: generatedUrls.html });
});
document.querySelector("[data-open-pdf]").addEventListener("click", () => {
  if (generatedUrls?.pdf) chrome.tabs.create({ url: generatedUrls.pdf });
});

activeTab()
  .then((tab) => {
    document.querySelector("[data-page-title]").textContent = tab.title || "Current Chrome page";
  })
  .catch(() => {
    document.querySelector("[data-page-title]").textContent = "Current Chrome page";
  });
