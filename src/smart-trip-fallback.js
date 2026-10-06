function clean(value, maxLength = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

const CITY_GUIDES = {
  istanbul: {
    tip: "بۆ گەڕان لە ئیستانبوڵ Istanbulkart بەکاربهێنە، کاتی قەرەباڵغی هاتوچۆ لەبەرچاو بگرە و بۆ شوێنە مێژووییەکان بەیانی زوو بچۆ.",
    places: [
      ["Hagia Sophia", "یەکێکە لە ناسراوترین بینا مێژووییەکانی ئیستانبوڵ و لە دڵی ناوچەی سوڵتان ئەحمەد دایە."],
      ["Blue Mosque", "مزگەوتێکی مێژوویی بە دیزاین و کاشییە شینە ناسراوەکانی، لە تەنیشت مەیدانی سوڵتان ئەحمەد."],
      ["Topkapi Palace", "کۆشکی مێژوویی سەردەمی عوسمانییەکان بە حەوشە، مۆزەخانە و دیمەنی بۆسفۆر."],
      ["Basilica Cistern", "ژێرزەمینێکی مێژوویی سەرنجڕاکێش بە ستوونە کۆنەکان و ڕووناکییە تایبەتەکەی."],
      ["Grand Bazaar", "بازاڕێکی مێژوویی و فراوان بۆ کڕینی دیاری، جل، زێڕ و بەرهەمە ناوخۆییەکان."],
      ["Galata Tower", "شوێنێکی ناسراو بۆ بینینی دیمەنی پانۆرامای شار و گەڕان لە کۆڵانەکانی گەلاتا."],
      ["Dolmabahce Palace", "کۆشکێکی جوان لە کەناری بۆسفۆر کە مێژوو و هونەری سەردەمی کۆتایی عوسمانی پیشان دەدات."],
      ["Bosphorus", "گەشتێکی کەشتی لە بۆسفۆر دیمەنی هەردوو بەشی ئەورووپی و ئاسیایی شار پیشان دەدات."]
    ]
  }
};

function genericGuide(city) {
  const name = clean(city) || "Destination";
  return {
    tip: "پێش گەڕان کاتی کردنەوەی شوێنەکان بپشکنە، هاتوچۆی گشتی بەکاربهێنە و بەڵگەنامە و کەلوپەلی گرنگت لە شوێنێکی پارێزراودا هەڵبگرە.",
    places: [
      [`${name} Historic Center`, "بەشی مێژوویی شار بۆ ناسینی بینا کۆنەکان، شەقامە سەرەکییەکان و ژیانی ناوخۆیی."],
      [`${name} City Museum`, "مۆزەخانەی شار بۆ ناسینی مێژوو، کەلتوور و گۆڕانکارییەکانی ناوچەکە."],
      [`${name} Main Market`, "بازاڕی سەرەکی بۆ بینینی بەرهەمە ناوخۆییەکان، دیاری و خواردنی تایبەتی شار."],
      [`${name} Central Square`, "ناوەندی شار و شوێنێکی گونجاو بۆ دەستپێکردنی گەڕان و ناسینی دەوروبەر."],
      [`${name} Cultural District`, "ناوچەی کەلتووری بۆ هونەر، گەلەری، چێشتخانە و چالاکییە ناوخۆییەکان."],
      [`${name} City Park`, "شوێنێکی ئارام بۆ پشوودان، پیاسەکردن و بەسەربردنی کات لە دەرەوە."],
      [`${name} Panoramic Viewpoint`, "شوێنێکی بەرز یان کراوە بۆ بینینی دیمەنی گشتی شار و وێنەگرتن."]
    ]
  };
}

function fallbackSmartTripGuide(destinationCity, destinationCountry = "", trip = {}) {
  const city = clean(destinationCity);
  const country = clean(destinationCountry);
  const destination = [city, country].filter(Boolean).join(" ");
  const profile = CITY_GUIDES[city.toLocaleLowerCase("en-US")] || genericGuide(city);
  const dayCount = Math.max(1, Math.min(30, Number(trip.dayCount) || 1));
  const sightseeing = profile.places.slice(0, 8).map(([name, description]) => ({
    name,
    description,
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${destination}`)}`
  }));
  const miniPlan = Array.from({ length: dayCount }, (_, index) => {
    const first = sightseeing[(index * 2) % sightseeing.length];
    const second = sightseeing[((index * 2) + 1) % sightseeing.length];
    const isFirst = index === 0;
    const isLast = index === dayCount - 1 && dayCount > 1;
    const items = isFirst
      ? [`دوای گەیشتن و پشوودان، گەڕانێکی سووک لە ${first.name}.`, "ناسینی دەوروبەری شوێنی مانەوە و ڕێگاکانی هاتوچۆ.", "خواردنی ئێوارە لە چێشتخانەیەکی ناوخۆیی."]
      : isLast
        ? [`سەردانی سووک بۆ ${first.name}.`, "کات بۆ کڕینی دیاری و ئامادەکردنی کەلوپەلی گەڕانەوە.", "بە پێی کاتی فڕین، زوو بەرەو فڕۆکەخانە بەڕێبکەوە."]
        : [`بەیانی سەردانی ${first.name}.`, `دوای نیوەڕۆ گەڕان لە ${second.name}.`, "پشوودان و تاقیکردنەوەی خواردنی ناوخۆیی."];
    return { title: `ڕۆژی ${index + 1} لە ${city}`, items };
  });

  return {
    passengerFirstNameKurdish: "",
    sightseeing,
    travelTip: profile.tip,
    miniPlan
  };
}

module.exports = { fallbackSmartTripGuide };
