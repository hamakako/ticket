const test = require("node:test");
const assert = require("node:assert/strict");

const { fallbackSmartTripGuide } = require("../src/smart-trip-fallback");

test("builds a complete eight-day Istanbul guide without Gemini", () => {
  const guide = fallbackSmartTripGuide("Istanbul", "Turkey", { dayCount: 8 });

  assert.equal(guide.sightseeing.length, 8);
  assert.equal(guide.miniPlan.length, 8);
  assert.match(guide.sightseeing[0].description, /[\u0600-\u06ff]/);
  assert.match(guide.miniPlan[0].title, /ڕۆژی 1/);
  assert.ok(guide.miniPlan.every((day) => day.items.length >= 3));
});

test("builds a usable destination guide for an uncatalogued city", () => {
  const guide = fallbackSmartTripGuide("Osaka", "Japan", { dayCount: 5 });

  assert.equal(guide.sightseeing.length, 7);
  assert.equal(guide.miniPlan.length, 5);
  assert.match(guide.sightseeing[0].name, /Osaka/);
  assert.match(guide.sightseeing[0].mapUrl, /^https:\/\/www\.google\.com\/maps\/search/);
});
