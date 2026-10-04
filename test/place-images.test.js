const test = require("node:test");
const assert = require("node:assert/strict");

const { enrichSightseeingImages, findWikipediaPlaceImage } = require("../src/place-images");

test("uses the best Wikipedia search result with a thumbnail", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      query: {
        pages: {
          8: { pageid: 8, index: 2, title: "Other", thumbnail: { source: "https://upload.wikimedia.org/other.jpg" } },
          4: { pageid: 4, index: 1, title: "Canton Tower", thumbnail: { source: "https://upload.wikimedia.org/canton.jpg" } }
        }
      }
    })
  });
  try {
    const image = await findWikipediaPlaceImage("Canton Tower", "Guangzhou");
    assert.equal(image.imageUrl, "https://upload.wikimedia.org/canton.jpg");
    assert.equal(image.imageSourceUrl, "https://en.wikipedia.org/?curid=4");
    assert.equal(image.imageAlt, "Canton Tower");
  } finally {
    global.fetch = originalFetch;
  }
});

test("keeps sightseeing cards usable when no image can be found", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false });
  try {
    const places = await enrichSightseeingImages([{ name: "Unknown Place", description: "Test" }], "Test City");
    assert.deepEqual(places, [{ name: "Unknown Place", description: "Test" }]);
  } finally {
    global.fetch = originalFetch;
  }
});
