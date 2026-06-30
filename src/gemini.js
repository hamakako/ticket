const fs = require("fs");
const { normalizeFlightData, normalizeHotelData } = require("./schema");

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const REQUEST_TIMEOUT_MS = 45000;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function schemaFor(type) {
  if (type === "flight") {
    return {
      type: "flight",
      pnr: "",
      passengers: [
        {
          fullName: "",
          ticketNumber: "",
          passengerType: "",
          seat: ""
        }
      ],
      segments: [
        {
          airline: "",
          flightNumber: "",
          class: "",
          departureAirport: "",
          departureCity: "",
          departureDate: "",
          departureTime: "",
          arrivalAirport: "",
          arrivalCity: "",
          arrivalDate: "",
          arrivalTime: "",
          duration: "",
          terminal: "",
          gate: "",
          boardingTime: ""
        }
      ],
      baggage: {
        checkedBaggage: "",
        cabinBaggage: ""
      },
      importantNotes: []
    };
  }

  return {
    type: "hotel",
    referenceNumber: "",
    hotelName: "",
    hotelAddress: "",
    hotelPhone: "",
    checkInDate: "",
    checkInTime: "",
    checkOutDate: "",
    checkOutTime: "",
    roomType: "",
    bedding: "",
    guests: [
      {
        fullName: ""
      }
    ],
    numberOfGuests: "",
    mealType: "",
    gps: "",
    importantNotes: [],
    cancellationNotes: []
  };
}

function buildPrompt(type) {
  const documentLabel = type === "flight" ? "flight ticket" : "hotel voucher";
  return [
    `You are extracting structured itinerary data from a ${documentLabel} for MK Business and Travel.`,
    "Extract only information that is visible in the uploaded document.",
    "Do not invent or infer missing details.",
    'If a field is missing, return exactly "Not specified".',
    "Do not extract, include, summarize, or display ticket price, hotel price, fare, total amount, paid amount, payment status, taxes, fees, or any financial information.",
    "Return clean JSON only. Do not include Markdown, code fences, comments, or explanations.",
    "Use this exact JSON shape:",
    JSON.stringify(schemaFor(type), null, 2)
  ].join("\n");
}

function parseGeminiText(response) {
  const text = response?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Gemini returned no extractable text.");
  }

  const clean = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  const jsonText = firstBrace >= 0 && lastBrace >= firstBrace
    ? clean.slice(firstBrace, lastBrace + 1)
    : clean;

  return JSON.parse(jsonText);
}

async function extractDocument(type, file) {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key_here") {
    throw new Error("GEMINI_API_KEY is missing. Add it to the local .env file on the server side.");
  }

  const base64 = fs.readFileSync(file.path).toString("base64");
  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inline_data: {
              mime_type: file.mimetype,
              data: base64
            }
          },
          { text: buildPrompt(type) }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0
    }
  };

  let lastError = null;
  let sawTemporaryFailure = false;
  for (const model of MODELS) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });

      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        const parsed = parseGeminiText(payload);
        return type === "flight" ? normalizeFlightData(parsed) : normalizeHotelData(parsed);
      }

      lastError = payload?.error?.message || `Gemini request failed with HTTP ${response.status}.`;
      if (!RETRYABLE_STATUS.has(response.status)) {
        throw new Error(lastError);
      }
      sawTemporaryFailure = true;
    } catch (error) {
      lastError = error.message || "Gemini request failed.";
      if (lastError.includes("API key not valid") || lastError.includes("permission")) {
        throw error;
      }
      sawTemporaryFailure = true;
    }

    await wait(500);
  }

  if (sawTemporaryFailure) {
    throw new Error("Gemini is temporarily busy. Please click Process with Gemini again in a moment.");
  }
  throw new Error(lastError || "Gemini request failed.");
}

module.exports = {
  extractDocument
};
