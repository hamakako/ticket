function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

async function findWikipediaPlaceImage(placeName, destination = "") {
  const query = [placeName, destination].filter(Boolean).join(" ").trim();
  if (!query) return null;

  const url = new URL("https://en.wikipedia.org/w/api.php");
  const params = {
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "3",
    prop: "pageimages",
    piprop: "thumbnail|original",
    pithumbsize: "900",
    format: "json",
    origin: "*"
  };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "MKBusinessTravel/1.0 (ops@mkebl.com)" },
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const pages = Object.values(payload?.query?.pages || {})
      .filter((page) => page?.thumbnail?.source)
      .sort((left, right) => Number(left.index || 999) - Number(right.index || 999));
    const page = pages[0];
    const imageUrl = safeHttpsUrl(page?.thumbnail?.source);
    if (!page || !imageUrl) return null;
    return {
      imageUrl,
      imageSourceUrl: `https://en.wikipedia.org/?curid=${Number(page.pageid)}`,
      imageAlt: String(page.title || placeName).slice(0, 180)
    };
  } catch {
    return null;
  }
}

async function enrichSightseeingImages(places, destination = "") {
  return Promise.all((places || []).map(async (place) => {
    const image = await findWikipediaPlaceImage(place.name, destination);
    return image ? { ...place, ...image } : place;
  }));
}

module.exports = {
  enrichSightseeingImages,
  findWikipediaPlaceImage
};
