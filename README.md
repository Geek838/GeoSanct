# GeoSanct Workspace

GeoSanct is a small full-stack compliance workspace for Georgian corporate due diligence. It includes:

- a FastAPI risk-scoring backend
- an async Playwright scraper for NAPR registry lookups
- a `pdfplumber` parser for shareholder extraction from NAPR PDF extracts
- a Vite + React + Tailwind dashboard for the operator-facing interface

## Project Structure

- `main.py`
  FastAPI backend exposing `POST /api/v1/verify-entity`
- `scraper.py`
  Async Playwright workflow for registry lookup and PDF extract download
- `parser.py`
  PDF parser that extracts shareholder data and transliterates Georgian names
- `GeoSanctDashboard.tsx`
  Main dashboard component rendered by the frontend app
- `src/`
  Vite frontend entry point and lightweight UI component layer
- `requirements.txt`
  Python dependencies
- `package.json`
  Frontend dependencies and scripts

## Requirements

### Python

- Python 3.11 or newer recommended
- `pip`

### Frontend

- Node.js 18 or newer recommended
- `npm`

## Setup

### 1. Clone the repository

```powershell
git clone <YOUR_GITHUB_REPO_URL>
cd MoneyPrinter
```

### 2. Create and activate a Python virtual environment

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### 3. Install Python dependencies

```powershell
pip install -r requirements.txt
python -m playwright install chromium
```

`playwright install chromium` is required once so the scraper can launch a browser.

### 4. Install frontend dependencies

```powershell
npm install
```

## Running the Project

### Backend API

Start the FastAPI service:

```powershell
python main.py
```

The API starts on:

- `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/docs`

#### API authentication

Every protected request must include:

```text
X-API-Key: geosanct_test_key_123
```

#### Example request

PowerShell:

```powershell
curl -X POST "http://127.0.0.1:8000/api/v1/verify-entity" `
  -H "Content-Type: application/json" `
  -H "X-API-Key: geosanct_test_key_123" `
  -d "{\"registry_id\":\"404852174\",\"client_reference\":\"case-geo-001\"}"
```

What it does:

- validates the registry ID
- looks up mock entity data
- applies the risk rules
- returns a typed risk report with score, tier, shareholders, and red flags

### Frontend Dashboard

Start the Vite development server:

```powershell
npm run dev
```

Then open the local URL shown by Vite, usually:

```text
http://127.0.0.1:5173
```

#### Frontend behavior

The dashboard has three UI states:

1. Idle
   Shows the registry search field and recent searches table.
2. Loading
   Simulates the compliance pipeline with staged loading text and skeletons.
3. Result
   Shows the due diligence report for the sample high-risk entity.

Current frontend behavior is mocked and does not yet call the FastAPI backend directly.

### Scraper

Run the Playwright scraper:

```powershell
python scraper.py
```

What it does:

- opens the NAPR registry site in Chromium
- searches for a Georgian registry number
- waits for dynamic UI elements explicitly
- tries to download the entity extract PDF into `./downloads`

Default test registry number in the script:

```text
404852174
```

Expected output file:

```text
./downloads/404852174_extract.pdf
```

Important notes:

- the site may change selectors over time
- the script exits cleanly if a timeout or challenge page appears
- Playwright browser binaries must be installed first

### PDF Parser

Run the PDF parser:

```powershell
python parser.py
```

What it does:

- opens a NAPR extract PDF with `pdfplumber`
- searches for shareholder sections such as `მეწილეები` or `პარტნიორები`
- extracts shareholder names, percentages, and IDs
- transliterates Georgian names to English using the required mapping
- returns JSON shaped by Pydantic models

Default test input:

```text
./downloads/404852174_extract.pdf
```

Example output shape:

```json
{
  "shareholders": [
    {
      "name_georgian": "ნორდიკ ფორვარდინგ შპს",
      "name_english": "Nordik Porvarding Shps",
      "ownership_percentage": 100.0,
      "identification_number": "404852174"
    }
  ]
}
```

## Risk Logic Summary

The backend risk engine currently applies these rules:

- registration after `2022-02-24`
  adds 35 points and flags geopolitical timing risk
- corporate shareholder or shareholder name containing `LLC`, `LTD`, or `Holdings`
  adds 45 points and flags opaque beneficial ownership risk

Risk tiers:

- `0-33`: `LOW`
- `34-66`: `MEDIUM`
- `67-100`: `HIGH`

## Development Notes

- Python files have been syntax-checked with `python -m py_compile`
- the frontend uses a minimal local UI layer under `src/components/ui`
- the frontend entry point is `src/main.tsx`
- the dashboard component rendered by Vite is `GeoSanctDashboard.tsx`

## Useful Commands

### Python checks

```powershell
python -m py_compile main.py
python -m py_compile scraper.py
python -m py_compile parser.py
```

### Frontend build

```powershell
npm run build
```

### Frontend preview

```powershell
npm run preview
```

## Current Limitations

- frontend and backend are not wired together yet
- scraper behavior depends on the live NAPR site structure
- parser accuracy depends on the formatting quality of the downloaded PDF
- sample backend verification data is mocked in-memory
