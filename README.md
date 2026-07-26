# Asphalt QA

A simple, phone-friendly app for QA staff on asphalt crews doing **mill & fill** or **paving** work. No accounts, no server, no signal needed — everything is stored on the QA's device and it works fully offline once loaded.

## What it does

- **Jobs** — date, client, job/PO number, road, work type (Mill & Fill / Paving only), mix, crew, QA name.
- **Patches** — per patch: location on site (chainage / house number / lane), one-tap **GPS capture**, length × width (area is calculated automatically), design depth, and notes for the paving crew.
- **Stringing depths** — any number of measured cut-depth readings per patch (position + mm), each averaged automatically, with their own **depth photos**.
- **Photos** — multiple photos per patch in each category:
  - Before
  - Milled
  - Spray / Membrane
  - Finish
  - Stringing / Depth
  Photos are taken straight from the camera and compressed on-device.
- **Paving run sheet** — one tap builds a printable run sheet: every patch with location, size, area, design depth, average measured cut depth, string readings and **estimated tonnes** (area × depth × density, density adjustable per job, default 2.4 t/m³), plus totals and sign-off lines. Print it or save it as a PDF from the phone. Also exports **CSV**.
- **QA photo report** — printable report of every photo, grouped by patch and category.
- **Backup** — export/import everything (including photos) as a single file from the ⋮ menu.

## Getting it onto phones

The app is plain HTML/JS — any static hosting works. The easiest free option is **GitHub Pages**:

1. In this repository go to **Settings → Pages**.
2. Under *Build and deployment*, set Source to **Deploy from a branch**, pick the branch and `/ (root)`, and save.
3. Open the published URL on each QA's phone, then use the browser's **"Add to Home Screen"** (Share menu on iPhone, ⋮ menu on Android). It installs like a normal app and works offline afterwards.

## Important notes for the crew

- Data lives **on the device** (browser storage). Each QA's phone holds its own jobs.
- Use **⋮ → Export backup** at the end of each day/job and keep the file somewhere safe (email it in, drop it in OneDrive/Drive). It can be re-imported on any device.
- Don't clear the browser's site data for the app, or the jobs on that phone are gone.

## Field workflow

1. **New job** → fill in client, road, mix, crew.
2. For each patch: **+** → enter location, tap **GPS**, take **Before** photos, enter length/width/design depth.
3. After milling: take **Milled** photos, add **stringing depth readings** (position + mm) and **depth photos**.
4. After spraying: **Spray / Membrane** photos.
5. After paving/rolling: **Finish** photos.
6. Tap **Run sheet** → print / save PDF / CSV and hand it to the paving crew. **Photo report** gives the client the full photo record.
