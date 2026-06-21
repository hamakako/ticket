# MK Business and Travel Itinerary Generator

Local and online Node app for generating branded HTML flight and hotel itineraries from uploaded PDFs/images.

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

On Render, connect this GitHub repo, create a Web Service, and add `GEMINI_API_KEY` as an environment variable. The API key stays server-side and is not exposed in the browser.

Records, uploaded originals, and generated HTML files are automatically deleted after 7 days.

Note: free hosts may sleep after inactivity and can have temporary storage limits. For permanent business use, use a paid host or external database/storage.
