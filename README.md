# RCK field apps

Two plain HTML/JS apps, no accounts and no server, both deployed from this repo:

| App | Where | For |
| --- | --- | --- |
| **Asphalt QA** | `/` — see below | QA staff on mill & fill and paving jobs, on a phone |
| **[Sign In / Sign Out](signin/)** | `/signin/` | The office tablet — who is on site, which crew, which job, and the hours that go with it |

---

# Asphalt QA

A simple, phone-friendly app for QA staff on asphalt crews doing **mill & fill** or **paving** work. No accounts, no server, no signal needed — everything is stored on the QA's device and it works fully offline once loaded.

## What it does

- **Jobs** — date, client, job/PO number, road + job GPS, work type (Mill & Fill / Paving only), **job layout** (multiple patches or one single large area — QA picks per job), **mix type** (pick from a list or type your own), **tack coat / membrane seal** (Grade 4 or Grade 3/5), **client target depth** (default 40 mm), **mix ordered (t)**, crew, QA name and density.
- **Patches / areas** — per patch: location on site (chainage / house number / lane), one-tap **GPS capture**, length × width (area is calculated automatically), design depth (defaults to the job's target depth), a **Deep lift** flag for patches deeper than the standard lift, and notes for the paving crew.
- **Stringing depths** — any number of measured cut-depth readings per patch (position + mm), averaged automatically, with their own **depth photos**. Each reading is compared against the target depth, and wherever the cut is deeper the app calculates the **prelevel required** (mm and tonnes).
- **Photos** — multiple photos per patch in each category: Before, Milled, Spray / Membrane, Finish, Stringing / Depth. Taken straight from the camera and compressed on-device.
- **Paving run sheet** — every patch with location, size, area, design depth, average measured cut depth, string readings, deep-lift flags, **estimated tonnes** and **prelevel tonnes**, plus totals and sign-off lines. Print / save as PDF, or export **CSV**.
- **String sheet** — a printable table of stringing readings for each patch (position, depth, ± vs target), with a **mix & prelevel summary**: mix ordered (editable right on the sheet) vs **mix used calculated from the stringing measurements**, surplus/short variance, and total prelevel required.
- **QA report (PDF)** — one consolidated printable document: job details, run sheet, mix & prelevel summary, all stringing sheets and the full photo record — save it as a single PDF from the phone.
- **QA photo report** — printable report of every photo, grouped by patch and category.
- **Backup** — export/import everything (including photos) as a single file from the ⋮ menu.

## Getting it onto phones

The app is plain HTML/JS and deploys itself: every push runs the **Deploy to GitHub Pages** workflow, which publishes the app to the `gh-pages` branch.

One-time setup (repo owner only):

1. In this repository go to **Settings → Pages**.
2. Under *Build and deployment*, set Source to **Deploy from a branch**, pick **`gh-pages`** and **`/ (root)`**, and save.
3. After a minute the app is live at `https://<owner>.github.io/<repo>/`.

Then on each QA's phone: open that URL and use the browser's **"Add to Home Screen"** (Share menu on iPhone, ⋮ menu on Android). It installs like a normal app and works offline afterwards. Any future push to the repo updates the live app automatically.

## Important notes for the crew

- Data lives **on the device** (browser storage). Each QA's phone holds its own jobs.
- Use **⋮ → Export backup** at the end of each day/job and keep the file somewhere safe (email it in, drop it in OneDrive/Drive). It can be re-imported on any device.
- Don't clear the browser's site data for the app, or the jobs on that phone are gone.

## Field workflow

1. **New job** → pick the layout (patches or single area), choose the mix, tack coat / membrane grade, set the client's target depth, enter mix ordered, client, road, crew.
2. For each patch: **+** → enter location, tap **GPS**, take **Before** photos, enter length/width. Tick **Deep lift** and set the deeper design depth where needed.
3. After milling: take **Milled** photos, add **stringing depth readings** (position + mm) and **depth photos** — the app flags any prelevel required straight away.
4. After spraying: **Spray / Membrane** photos.
5. After paving/rolling: **Finish** photos.
6. Hand the **Run sheet** to the paving crew, check ordered-vs-used on the **String sheet**, and save the consolidated **QA report** as a PDF for the client.
