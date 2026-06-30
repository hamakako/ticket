const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

let db;

function resolveDatabasePath() {
  const databaseUrl = process.env.DATABASE_URL || "file:./mk_itinerary.db";
  const filePath = databaseUrl.startsWith("file:") ? databaseUrl.slice(5) : databaseUrl;
  return path.resolve(process.cwd(), filePath);
}

function initDatabase() {
  if (db) return db;

  const dbPath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS flight_itineraries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pnr TEXT NOT NULL,
      checked_baggage TEXT NOT NULL,
      cabin_baggage TEXT NOT NULL,
      important_notes_json TEXT NOT NULL DEFAULT '[]',
      source_file TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS flight_passengers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flight_itinerary_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      ticket_number TEXT NOT NULL,
      passenger_type TEXT NOT NULL,
      seat TEXT NOT NULL DEFAULT 'Not specified',
      FOREIGN KEY (flight_itinerary_id) REFERENCES flight_itineraries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS flight_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flight_itinerary_id INTEGER NOT NULL,
      airline TEXT NOT NULL,
      flight_number TEXT NOT NULL,
      class TEXT NOT NULL,
      departure_airport TEXT NOT NULL,
      departure_city TEXT NOT NULL,
      departure_date TEXT NOT NULL,
      departure_time TEXT NOT NULL,
      arrival_airport TEXT NOT NULL,
      arrival_city TEXT NOT NULL,
      arrival_date TEXT NOT NULL,
      arrival_time TEXT NOT NULL,
      duration TEXT NOT NULL,
      terminal TEXT NOT NULL DEFAULT 'Not specified',
      gate TEXT NOT NULL DEFAULT 'Not specified',
      boarding_time TEXT NOT NULL DEFAULT 'Not specified',
      FOREIGN KEY (flight_itinerary_id) REFERENCES flight_itineraries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hotel_itineraries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_number TEXT NOT NULL,
      hotel_name TEXT NOT NULL,
      hotel_address TEXT NOT NULL,
      hotel_phone TEXT NOT NULL,
      check_in_date TEXT NOT NULL,
      check_in_time TEXT NOT NULL,
      check_out_date TEXT NOT NULL,
      check_out_time TEXT NOT NULL,
      room_type TEXT NOT NULL,
      bedding TEXT NOT NULL,
      number_of_guests TEXT NOT NULL,
      meal_type TEXT NOT NULL,
      gps TEXT NOT NULL,
      place_id TEXT NOT NULL DEFAULT '',
      map_url TEXT NOT NULL DEFAULT '',
      maps_title TEXT NOT NULL DEFAULT '',
      latitude TEXT NOT NULL DEFAULT '',
      longitude TEXT NOT NULL DEFAULT '',
      hotel_photo_url TEXT NOT NULL DEFAULT '',
      photo_attribution TEXT NOT NULL DEFAULT '',
      photo_attribution_url TEXT NOT NULL DEFAULT '',
      important_notes_json TEXT NOT NULL DEFAULT '[]',
      cancellation_notes_json TEXT NOT NULL DEFAULT '[]',
      source_file TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hotel_guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hotel_itinerary_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      FOREIGN KEY (hotel_itinerary_id) REFERENCES hotel_itineraries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS generated_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      itinerary_type TEXT NOT NULL CHECK (itinerary_type IN ('flight', 'hotel')),
      itinerary_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_kind TEXT NOT NULL DEFAULT 'itinerary-html',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureColumn("flight_passengers", "seat", "TEXT NOT NULL DEFAULT 'Not specified'");
  ensureColumn("flight_segments", "terminal", "TEXT NOT NULL DEFAULT 'Not specified'");
  ensureColumn("flight_segments", "gate", "TEXT NOT NULL DEFAULT 'Not specified'");
  ensureColumn("flight_segments", "boarding_time", "TEXT NOT NULL DEFAULT 'Not specified'");
  ensureColumn("hotel_itineraries", "place_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("hotel_itineraries", "map_url", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("hotel_itineraries", "maps_title", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("hotel_itineraries", "latitude", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("hotel_itineraries", "longitude", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("hotel_itineraries", "hotel_photo_url", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("hotel_itineraries", "photo_attribution", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("hotel_itineraries", "photo_attribution_url", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("generated_files", "file_kind", "TEXT NOT NULL DEFAULT 'itinerary-html'");

  return db;
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function database() {
  return initDatabase();
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function latestGeneratedFile(type, itineraryId, fileKind = "itinerary-html") {
  return database()
    .prepare(`
      SELECT id, file_name AS fileName, file_path AS filePath, created_at AS createdAt
      FROM generated_files
      WHERE itinerary_type = ? AND itinerary_id = ? AND file_kind = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `)
    .get(type, itineraryId, fileKind) || null;
}

function mapFlight(row) {
  if (!row) return null;
  const passengers = database()
    .prepare(`
      SELECT full_name AS fullName, ticket_number AS ticketNumber, passenger_type AS passengerType, seat
      FROM flight_passengers
      WHERE flight_itinerary_id = ?
      ORDER BY id
    `)
    .all(row.id);

  const segments = database()
    .prepare(`
      SELECT airline, flight_number AS flightNumber, class, departure_airport AS departureAirport,
        departure_city AS departureCity, departure_date AS departureDate, departure_time AS departureTime,
        arrival_airport AS arrivalAirport, arrival_city AS arrivalCity, arrival_date AS arrivalDate,
        arrival_time AS arrivalTime, duration, terminal, gate, boarding_time AS boardingTime
      FROM flight_segments
      WHERE flight_itinerary_id = ?
      ORDER BY id
    `)
    .all(row.id);

  return {
    id: row.id,
    type: "flight",
    pnr: row.pnr,
    passengers,
    segments,
    baggage: {
      checkedBaggage: row.checked_baggage,
      cabinBaggage: row.cabin_baggage
    },
    importantNotes: parseJsonArray(row.important_notes_json),
    sourceFile: row.source_file || "",
    generated: latestGeneratedFile("flight", row.id),
    generatedPdf: latestGeneratedFile("flight", row.id, "itinerary-pdf"),
    boardingPass: latestGeneratedFile("flight", row.id, "boarding-pass-html"),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapHotel(row) {
  if (!row) return null;
  const guests = database()
    .prepare(`
      SELECT full_name AS fullName
      FROM hotel_guests
      WHERE hotel_itinerary_id = ?
      ORDER BY id
    `)
    .all(row.id);

  return {
    id: row.id,
    type: "hotel",
    referenceNumber: row.reference_number,
    hotelName: row.hotel_name,
    hotelAddress: row.hotel_address,
    hotelPhone: row.hotel_phone,
    checkInDate: row.check_in_date,
    checkInTime: row.check_in_time,
    checkOutDate: row.check_out_date,
    checkOutTime: row.check_out_time,
    roomType: row.room_type,
    bedding: row.bedding,
    guests,
    numberOfGuests: row.number_of_guests,
    mealType: row.meal_type,
    gps: row.gps,
    placeId: row.place_id || "",
    mapUrl: row.map_url || "",
    mapsTitle: row.maps_title || "",
    latitude: row.latitude || "",
    longitude: row.longitude || "",
    hotelPhotoUrl: row.hotel_photo_url || "",
    photoAttribution: row.photo_attribution || "",
    photoAttributionUrl: row.photo_attribution_url || "",
    importantNotes: parseJsonArray(row.important_notes_json),
    cancellationNotes: parseJsonArray(row.cancellation_notes_json),
    sourceFile: row.source_file || "",
    generated: latestGeneratedFile("hotel", row.id),
    generatedPdf: latestGeneratedFile("hotel", row.id, "itinerary-pdf"),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function insertFlightChildren(id, data) {
  const passengerStmt = database().prepare(`
    INSERT INTO flight_passengers (flight_itinerary_id, full_name, ticket_number, passenger_type, seat)
    VALUES (?, ?, ?, ?, ?)
  `);
  data.passengers.forEach((passenger) => {
    passengerStmt.run(id, passenger.fullName, passenger.ticketNumber, passenger.passengerType, passenger.seat);
  });

  const segmentStmt = database().prepare(`
    INSERT INTO flight_segments (
      flight_itinerary_id, airline, flight_number, class, departure_airport, departure_city,
      departure_date, departure_time, arrival_airport, arrival_city, arrival_date, arrival_time, duration,
      terminal, gate, boarding_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  data.segments.forEach((segment) => {
    segmentStmt.run(
      id,
      segment.airline,
      segment.flightNumber,
      segment.class,
      segment.departureAirport,
      segment.departureCity,
      segment.departureDate,
      segment.departureTime,
      segment.arrivalAirport,
      segment.arrivalCity,
      segment.arrivalDate,
      segment.arrivalTime,
      segment.duration,
      segment.terminal,
      segment.gate,
      segment.boardingTime
    );
  });
}

function createFlightItinerary(data, sourceFile = "") {
  const db = database();
  db.exec("BEGIN");
  try {
    const result = db.prepare(`
      INSERT INTO flight_itineraries (pnr, checked_baggage, cabin_baggage, important_notes_json, source_file)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.pnr,
      data.baggage.checkedBaggage,
      data.baggage.cabinBaggage,
      JSON.stringify(data.importantNotes),
      sourceFile
    );
    insertFlightChildren(Number(result.lastInsertRowid), data);
    db.exec("COMMIT");
    return getFlightItinerary(Number(result.lastInsertRowid));
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function updateFlightItinerary(id, data, sourceFile = "") {
  const db = database();
  db.exec("BEGIN");
  try {
    const current = getFlightItinerary(id);
    if (!current) throw new Error("Flight itinerary not found.");
    db.prepare(`
      UPDATE flight_itineraries
      SET pnr = ?, checked_baggage = ?, cabin_baggage = ?, important_notes_json = ?,
        source_file = COALESCE(NULLIF(?, ''), source_file), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.pnr,
      data.baggage.checkedBaggage,
      data.baggage.cabinBaggage,
      JSON.stringify(data.importantNotes),
      sourceFile,
      id
    );
    db.prepare("DELETE FROM flight_passengers WHERE flight_itinerary_id = ?").run(id);
    db.prepare("DELETE FROM flight_segments WHERE flight_itinerary_id = ?").run(id);
    insertFlightChildren(id, data);
    db.exec("COMMIT");
    return getFlightItinerary(id);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function getFlightItinerary(id) {
  return mapFlight(database().prepare("SELECT * FROM flight_itineraries WHERE id = ?").get(id));
}

function listFlightItineraries(search = "") {
  const term = `%${search.trim()}%`;
  const rows = database()
    .prepare(`
      SELECT DISTINCT fi.*
      FROM flight_itineraries fi
      LEFT JOIN flight_passengers fp ON fp.flight_itinerary_id = fi.id
      LEFT JOIN flight_segments fs ON fs.flight_itinerary_id = fi.id
      WHERE ? = '%%'
        OR fi.pnr LIKE ?
        OR fp.full_name LIKE ?
        OR fp.ticket_number LIKE ?
        OR fs.airline LIKE ?
        OR fs.flight_number LIKE ?
        OR fs.departure_date LIKE ?
        OR fs.arrival_date LIKE ?
      ORDER BY fi.created_at DESC, fi.id DESC
    `)
    .all(term, term, term, term, term, term, term, term);
  return rows.map(mapFlight);
}

function deleteFlightItinerary(id) {
  const record = database()
    .prepare("SELECT source_file AS sourceFile FROM flight_itineraries WHERE id = ?")
    .get(id);
  const generated = database()
    .prepare("SELECT file_path AS filePath FROM generated_files WHERE itinerary_type = 'flight' AND itinerary_id = ?")
    .all(id)
    .map((row) => row.filePath);
  database().prepare("DELETE FROM generated_files WHERE itinerary_type = 'flight' AND itinerary_id = ?").run(id);
  database().prepare("DELETE FROM flight_itineraries WHERE id = ?").run(id);
  return {
    generatedFiles: generated,
    sourceFiles: record?.sourceFile ? [record.sourceFile] : []
  };
}

function insertHotelGuests(id, data) {
  const guestStmt = database().prepare(`
    INSERT INTO hotel_guests (hotel_itinerary_id, full_name)
    VALUES (?, ?)
  `);
  data.guests.forEach((guest) => {
    guestStmt.run(id, guest.fullName);
  });
}

function createHotelItinerary(data, sourceFile = "") {
  const db = database();
  db.exec("BEGIN");
  try {
    const result = db.prepare(`
      INSERT INTO hotel_itineraries (
        reference_number, hotel_name, hotel_address, hotel_phone, check_in_date, check_in_time,
        check_out_date, check_out_time, room_type, bedding, number_of_guests, meal_type, gps,
        place_id, map_url, maps_title, latitude, longitude, hotel_photo_url, photo_attribution, photo_attribution_url,
        important_notes_json, cancellation_notes_json, source_file
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.referenceNumber,
      data.hotelName,
      data.hotelAddress,
      data.hotelPhone,
      data.checkInDate,
      data.checkInTime,
      data.checkOutDate,
      data.checkOutTime,
      data.roomType,
      data.bedding,
      data.numberOfGuests,
      data.mealType,
      data.gps,
      data.placeId,
      data.mapUrl,
      data.mapsTitle,
      data.latitude,
      data.longitude,
      data.hotelPhotoUrl,
      data.photoAttribution,
      data.photoAttributionUrl,
      JSON.stringify(data.importantNotes),
      JSON.stringify(data.cancellationNotes),
      sourceFile
    );
    insertHotelGuests(Number(result.lastInsertRowid), data);
    db.exec("COMMIT");
    return getHotelItinerary(Number(result.lastInsertRowid));
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function updateHotelItinerary(id, data, sourceFile = "") {
  const db = database();
  db.exec("BEGIN");
  try {
    const current = getHotelItinerary(id);
    if (!current) throw new Error("Hotel itinerary not found.");
    db.prepare(`
      UPDATE hotel_itineraries
      SET reference_number = ?, hotel_name = ?, hotel_address = ?, hotel_phone = ?,
        check_in_date = ?, check_in_time = ?, check_out_date = ?, check_out_time = ?,
        room_type = ?, bedding = ?, number_of_guests = ?, meal_type = ?, gps = ?,
        place_id = ?, map_url = ?, maps_title = ?, latitude = ?, longitude = ?,
        hotel_photo_url = ?, photo_attribution = ?, photo_attribution_url = ?,
        important_notes_json = ?, cancellation_notes_json = ?,
        source_file = COALESCE(NULLIF(?, ''), source_file), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.referenceNumber,
      data.hotelName,
      data.hotelAddress,
      data.hotelPhone,
      data.checkInDate,
      data.checkInTime,
      data.checkOutDate,
      data.checkOutTime,
      data.roomType,
      data.bedding,
      data.numberOfGuests,
      data.mealType,
      data.gps,
      data.placeId,
      data.mapUrl,
      data.mapsTitle,
      data.latitude,
      data.longitude,
      data.hotelPhotoUrl,
      data.photoAttribution,
      data.photoAttributionUrl,
      JSON.stringify(data.importantNotes),
      JSON.stringify(data.cancellationNotes),
      sourceFile,
      id
    );
    db.prepare("DELETE FROM hotel_guests WHERE hotel_itinerary_id = ?").run(id);
    insertHotelGuests(id, data);
    db.exec("COMMIT");
    return getHotelItinerary(id);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function getHotelItinerary(id) {
  return mapHotel(database().prepare("SELECT * FROM hotel_itineraries WHERE id = ?").get(id));
}

function listHotelItineraries(search = "") {
  const term = `%${search.trim()}%`;
  const rows = database()
    .prepare(`
      SELECT DISTINCT hi.*
      FROM hotel_itineraries hi
      LEFT JOIN hotel_guests hg ON hg.hotel_itinerary_id = hi.id
      WHERE ? = '%%'
        OR hi.reference_number LIKE ?
        OR hi.hotel_name LIKE ?
        OR hg.full_name LIKE ?
        OR hi.check_in_date LIKE ?
        OR hi.check_out_date LIKE ?
      ORDER BY hi.created_at DESC, hi.id DESC
    `)
    .all(term, term, term, term, term, term);
  return rows.map(mapHotel);
}

function deleteHotelItinerary(id) {
  const record = database()
    .prepare("SELECT source_file AS sourceFile FROM hotel_itineraries WHERE id = ?")
    .get(id);
  const generated = database()
    .prepare("SELECT file_path AS filePath FROM generated_files WHERE itinerary_type = 'hotel' AND itinerary_id = ?")
    .all(id)
    .map((row) => row.filePath);
  database().prepare("DELETE FROM generated_files WHERE itinerary_type = 'hotel' AND itinerary_id = ?").run(id);
  database().prepare("DELETE FROM hotel_itineraries WHERE id = ?").run(id);
  return {
    generatedFiles: generated,
    sourceFiles: record?.sourceFile ? [record.sourceFile] : []
  };
}

function addGeneratedFile({ itineraryType, itineraryId, fileName, filePath, fileKind = "itinerary-html" }) {
  database().prepare(`
    INSERT INTO generated_files (itinerary_type, itinerary_id, file_name, file_path, file_kind)
    VALUES (?, ?, ?, ?, ?)
  `).run(itineraryType, itineraryId, fileName, filePath, fileKind);
}

function purgeExpiredItineraries(retentionDays = 7) {
  const db = database();
  const cutoff = `-${Number(retentionDays) || 7} days`;
  const expiredFlights = db.prepare(`
    SELECT id, source_file AS sourceFile
    FROM flight_itineraries
    WHERE created_at < datetime('now', ?)
  `).all(cutoff);
  const expiredHotels = db.prepare(`
    SELECT id, source_file AS sourceFile
    FROM hotel_itineraries
    WHERE created_at < datetime('now', ?)
  `).all(cutoff);

  const expiredGenerated = db.prepare(`
    SELECT gf.file_path AS filePath
    FROM generated_files gf
    LEFT JOIN flight_itineraries fi
      ON gf.itinerary_type = 'flight' AND gf.itinerary_id = fi.id
    LEFT JOIN hotel_itineraries hi
      ON gf.itinerary_type = 'hotel' AND gf.itinerary_id = hi.id
    WHERE (gf.itinerary_type = 'flight' AND fi.created_at < datetime('now', ?))
      OR (gf.itinerary_type = 'hotel' AND hi.created_at < datetime('now', ?))
  `).all(cutoff, cutoff).map((row) => row.filePath);

  const sourceFiles = [
    ...expiredFlights.map((row) => row.sourceFile),
    ...expiredHotels.map((row) => row.sourceFile)
  ].filter(Boolean);

  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM generated_files WHERE itinerary_type = 'flight' AND itinerary_id IN (SELECT id FROM flight_itineraries WHERE created_at < datetime('now', ?))").run(cutoff);
    db.prepare("DELETE FROM generated_files WHERE itinerary_type = 'hotel' AND itinerary_id IN (SELECT id FROM hotel_itineraries WHERE created_at < datetime('now', ?))").run(cutoff);
    db.prepare("DELETE FROM flight_itineraries WHERE created_at < datetime('now', ?)").run(cutoff);
    db.prepare("DELETE FROM hotel_itineraries WHERE created_at < datetime('now', ?)").run(cutoff);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    flightCount: expiredFlights.length,
    hotelCount: expiredHotels.length,
    generatedFiles: expiredGenerated,
    sourceFiles
  };
}

module.exports = {
  initDatabase,
  createFlightItinerary,
  updateFlightItinerary,
  getFlightItinerary,
  listFlightItineraries,
  deleteFlightItinerary,
  createHotelItinerary,
  updateHotelItinerary,
  getHotelItinerary,
  listHotelItineraries,
  deleteHotelItinerary,
  purgeExpiredItineraries,
  addGeneratedFile
};
