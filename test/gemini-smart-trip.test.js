const test = require("node:test");
const assert = require("node:assert/strict");

const { transliteratePassengerFirstName } = require("../src/gemini");

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
