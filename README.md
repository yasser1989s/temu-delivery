# Pro Delivery

GitHub Pages-ready PWA for parcel delivery.

## Features
- Barcode/QR scanning using the browser BarcodeDetector API when available, with optional ZXing fallback.
- OCR with Tesseract.js.
- Parcel database in IndexedDB.
- Offline-first UI and service worker.
- GPS distance tracking with accuracy/jump filtering.
- Simple nearest-neighbor route optimization.
- Address notes/memory.
- Proof-of-delivery photo compression.
- Voice input where supported.
- WhatsApp/SMS/Maps actions.
- Search, filters, daily report and CSV export.
- Arabic RTL interface.

## GitHub Pages
Upload the repository contents to GitHub and enable Pages from the repository's Actions/Pages settings. The app is static and needs no server for its core features.

## Important limitations
1. Browser barcode and speech capabilities vary by phone/browser.
2. GPS and camera require HTTPS; GitHub Pages supplies HTTPS.
3. OCR is local in the browser but can be slow on low-end phones.
4. Route optimization here is a lightweight nearest-neighbor heuristic, not a traffic-aware commercial routing engine.
5. WhatsApp/SMS depend on the installed apps and phone/browser support.

## Data
Core parcel data is stored locally in IndexedDB. Photos are compressed before storage. There is no cloud synchronization in this GitHub-only version.
