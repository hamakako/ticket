# MK Business and Travel Itinerary Generator

Local and online Node app for generating branded HTML/PDF flight and hotel itineraries from uploaded PDFs/images, plus printable boarding-pass summaries.

## Environment

Set these variables on the server:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=file:./mk_itinerary.db
RETENTION_DAYS=7
```

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Free Online Deployment

This project is prepared for Render free web services with `render.yaml`.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/hamakako/ticket)

On Render, connect this GitHub repo, create a Web Service, and add `GEMINI_API_KEY` as an environment variable. The API key stays server-side and is not exposed in the browser.

Hotel vouchers include a direct map search link created from the extracted hotel name and address. It does not require a separate Google Maps API key.

Records, uploaded originals, generated HTML/PDF itineraries, and boarding-pass HTML files are automatically deleted after 7 days.

Note: free hosts may sleep after inactivity and can have temporary storage limits. For permanent business use, use a paid host or external database/storage.
