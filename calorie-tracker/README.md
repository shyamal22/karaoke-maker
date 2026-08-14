# KCAL — Calorie & Weight Tracker

A brutalist, phone-friendly calorie and body-weight tracker with a built-in food
database focused on **Indian and Gujarati** food, plus common everyday and
international foods. No accounts, no server — everything is stored on your
device and it works fully offline once loaded.

## What it does

- **Daily log** — search 287 foods and log them against breakfast / lunch /
  dinner / snacks, with ½× to 3× (or any custom) serving multipliers. Big
  eaten / goal / remaining readout, progress bar, and daily protein / carbs /
  fat totals.
- **Food database** — Gujarati staples (thepla, rotlo, dhokla, khandvi, fafda,
  undhiyu, Gujarati dal & kadhi, dal dhokli, mohanthal, sukhdi, basundi…),
  pan-Indian dishes (parathas, dosas, paneer curries, biryanis, chaat,
  sweets…), and common foods (fruits, dairy, eggs, meats, fast food, drinks).
  Compiled from IFCT-2017-based sources (HealthifyMe, Tarla Dalal, Clearcals)
  and USDA FoodData Central, cross-checked across databases. Values are
  per stated serving and are realistic estimates — home recipes vary.
- **Quick add** — anything not in the database can be logged by calories alone,
  and optionally saved as a reusable "My Food".
- **Frequent foods** — one-tap chips for the foods you log most (last 30 days).
- **Body weight** — log daily weight in kg, see current / total change /
  distance to goal weight, a trend chart with touch tooltip, and full history.
- **Date navigation** — flip back through previous days to review or edit.
- **Backup** — export / import all data as a single JSON file from Settings.

## Getting it onto your phone

The app deploys with the rest of this repository to GitHub Pages. Once Pages is
enabled (see the root README), it's live at:

```
https://<owner>.github.io/<repo>/calorie-tracker/
```

Open that URL on your phone and use **"Add to Home Screen"** (Share menu on
iPhone, ⋮ menu on Android). It installs like a normal app and works offline.

## Notes

- Data lives **on the device** (browser storage). Export a backup from
  ⚙ SET → EXPORT BACKUP now and then.
- Calorie figures are estimates for typical recipes and serving sizes; your
  ghee-hand may be heavier than the database assumes.
