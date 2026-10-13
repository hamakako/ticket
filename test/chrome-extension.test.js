const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("Chrome extension package has the expected safe permissions and files", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "chrome-extension", "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.deepEqual(manifest.permissions.sort(), ["activeTab", "scripting"].sort());
  assert.deepEqual(manifest.host_permissions, ["https://mk-ticket-itinerary.onrender.com/*", "file:///*"]);
  assert.ok(!JSON.stringify(manifest).includes("GEMINI_API_KEY"));
  for (const file of ["popup.html", "popup.css", "popup.js", "README.md"]) {
    assert.ok(fs.existsSync(path.join(root, "chrome-extension", file)), `${file} should exist`);
  }
});

test("extension supports both direct generation modes", () => {
  const popup = fs.readFileSync(path.join(root, "chrome-extension", "popup.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "chrome-extension", "popup.js"), "utf8");
  assert.match(popup, /Flight Ticket/);
  assert.match(popup, /Hotel Voucher/);
  assert.match(script, /captureVisibleTab/);
  assert.match(script, /api\/extension\/generate\/\$\{selectedType\}/);
  assert.match(script, /payload\.generated\.html\.url/);
  assert.match(script, /payload\.generated\.pdf\.url/);
});
