const test = require("node:test");
const assert = require("node:assert/strict");

const { generateSmartTripGuide, transliteratePassengerFirstName } = require("../src/gemini");

test("uses the standard Sorani spelling for Hoshyar", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: '{"passengerFirstNameKurdish":"هوشیار"}' }] } }]
    })
  });
  try {
    assert.equal(await transliteratePassengerFirstName("Mr. HOSHYAR ABDULRAZZAQ"), "هۆشیار");
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});

test("uses the high-thinking Smart Trip model and preserves a full ten-day plan", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const requestedUrls = [];
  const requestBodies = [];
  process.env.GEMINI_API_KEY = "test-key";
  const miniPlan = Array.from({ length: 10 }, (_, index) => ({
    title: `ڕۆژی ${index + 1}`,
    items: ["چالاکی یەک", "چالاکی دوو", "چالاکی سێ"]
  }));
  global.fetch = async (url, options) => {
    requestedUrls.push(String(url));
    requestBodies.push(JSON.parse(options.body));
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          passengerFirstNameKurdish: "هۆشیار",
          sightseeing: Array.from({ length: 5 }, (_, index) => ({ name: `Place ${index + 1}`, description: "وەسف" })),
          travelTip: "تێبینی",
          miniPlan
        }) }] } }]
      })
    };
  };
  try {
    const guide = await generateSmartTripGuide("Istanbul", "Türkiye", "HOSHYAR TEST", {
      dayCount: 10,
      startDate: "2026-10-01",
      endDate: "2026-10-10"
    });
    assert.match(requestedUrls[0], /gemini-3\.8-flash/);
    assert.equal(requestBodies[0].generationConfig.thinkingConfig.thinkingLevel, "HIGH");
    assert.equal("temperature" in requestBodies[0].generationConfig, false);
    assert.equal(guide.miniPlan.length, 10);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});
