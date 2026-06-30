function meaningful(value) {
  const text = String(value || "").trim();
  return text && text !== "Not specified" ? text : "";
}

function hotelQuery(data) {
  return [meaningful(data.hotelName), meaningful(data.hotelAddress)]
    .filter(Boolean)
    .join(", ");
}

function fallbackMapUrl(data) {
  const query = hotelQuery(data);
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "";
}

function enrichHotelData(data) {
  return {
    ...data,
    mapUrl: meaningful(data.mapUrl) || fallbackMapUrl(data),
    mapsTitle: meaningful(data.mapsTitle) || meaningful(data.hotelName)
  };
}

module.exports = {
  enrichHotelData,
  fallbackMapUrl
};
