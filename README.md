# MK Business and Travel Itinerary Generator

Local and online Node app for generating branded HTML/PDF flight and hotel itineraries from uploaded PDFs/images or copied email text, plus printable boarding-pass summaries and live flight proposals.

## Environment

Set these variables on the server:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
IGNAV_API_KEY=your_ignav_api_key_here
DATABASE_URL=file:./mk_itinerary.db
RETENTION_DAYS=7
```

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

For both flights and hotels, office staff can upload a document or paste copied booking text from an email. Gemini extracts either source into the same editable review form before saving or generating an itinerary.

The Live Flight Search page uses Ignav for one-way and round-trip schedules. Staff can select a live result, enter a passenger name manually or extract the name only from an uploaded passport, open real provider booking links, and generate branded A4 HTML/PDF flight proposals. Proposals use an internal `MKQ-...` reference and are clearly marked as unconfirmed; the app never invents airline PNRs or ticket numbers.

## Free Online Deployment

This project is prepared for Render free web services with `render.yaml`.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/hamakako/ticket)

On Render, connect this GitHub repo, create a Web Service, and add `GEMINI_API_KEY` and `IGNAV_API_KEY` as environment variables. Both API keys stay server-side and are not exposed in the browser.

Hotel vouchers include a direct map search link created from the extracted hotel name and address. It does not require a separate Google Maps API key.

Records, uploaded originals, generated HTML/PDF itineraries, and boarding-pass HTML files are automatically deleted after 7 days.

Note: free hosts may sleep after inactivity and can have temporary storage limits. For permanent business use, use a paid host or external database/storage.
