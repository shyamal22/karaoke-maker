# RCK Sign In / Sign Out

A tablet app for the office wall or front desk. Two buttons on the start screen, one question per screen after that, and everything the office needs — hours per person, per crew and per job — behind a PIN.

Live at `https://<owner>.github.io/<repo>/signin/` once the repo is deployed (see the root README).

---

## What a worker sees

**Start screen** — the time, the date, and two big blocks: **SIGN IN** and **SIGN OUT**.

**Signing in — three taps and one line of typing:**

1. **Who are you?** — tap your name. The first time only, tap **+ New** and type your first and last name; after that your name is in the list forever and you never type it again.
2. **Which crew today?** — Green Crew, Yellow Crew, Traffic, Office, Yard, Transport, Trucking, Other. The crew you used last time is outlined so it is easy to find.
3. **Where are you working?** — type the job, road or address. Every job anyone has used before is a one-tap chip above the keyboard, so regulars never type it twice.

Then a check screen (name, crew, job, time) and one big green **SIGN IN**. The time is taken from the tablet automatically — nobody types a time.

**Signing out:**

1. Tap **SIGN OUT** — the list is only the people currently signed in, showing their crew, job and how long they have been on site.
2. **Where did you work?** — the job from sign-in is already there. **YES — that is right** finishes it; **Change job** or **+ Another job** covers anyone who moved between jobs during the day.
3. Optional: a note about what they did on the job (switch it off in Office → Data if you don't want it).
4. Check screen showing **hours worked today**, then one big **SIGN OUT**.

Both flows end on a big tick, an **Undo** button for mis-taps, and the tablet returns to the start screen by itself.

Other things built into the worker side:

- Picking a name that is already signed in takes them to sign-out instead of creating a double entry.
- The tablet returns to the start screen on its own after a minute of no touching, so it is always ready.
- The screen is kept awake while the app is open, and the app runs full screen when installed to the home screen.
- It works with no internet — records are written to the tablet first and synced afterwards.

## What the office sees

Tap **Office** at the bottom right of the start screen and enter the PIN (**1234** to begin with — change it under **Data**).

| Tab | What it does |
| --- | --- |
| **On site** | Who is signed in right now, how long they have been on site, and the day's totals. Sign someone out or fix their entry from here. **Roll call PDF** prints the on-site list with a tick box per person — use it at the assembly point in an evacuation. |
| **Flags** | Anyone still signed in after 24 hours, and any shift over 14 hours. Both thresholds are adjustable. **Fix** opens the shift so you can enter the real time. |
| **Reports** | Pick a range (today, this week, last week, last 14 days, this month, last month, everything, or custom dates) and read it **by employee**, **by crew**, **by job**, or as every individual shift. Export the whole range to **Excel** or **PDF**. Add a missing shift for someone whose sign-in was missed. |
| **People** | Fix a misspelled name (it updates their history too), set someone's usual crew, merge duplicate names, or remove someone who has left. |
| **Data** | Backups, email alerts, thresholds, sign-out questions, PIN, storage health, and a log of every change made in the office. |

### Job hours

The **by job** report is the cumulative total of everyone who signed in to that job — five people for eight hours reads as 40 hours on that job. Where somebody's shift covered more than one job, their hours are split evenly between those jobs, and the report says so. Jobs are matched ignoring case and extra spaces, and the recent-job chips at sign-in keep the spelling consistent.

### Exports

- **Excel (.xlsx)** — six sheets: Summary, By employee, By crew, By job, By day, All shifts, plus a Flags sheet when there is something to flag. Hours are real numbers, so they total and pivot normally.
- **PDF** — a printable RCK-letterhead report with the same roll-ups plus every individual shift; small enough to email to a client or an accountant.

Both files are generated on the tablet — no internet needed.

## Making sure the hours are never lost

1. Every record is written to the tablet's database **and** mirrored to a second on-device copy, one generation deep. If the database is wiped or unavailable the app recovers from the mirror on the next start.
2. Nothing is ever really deleted. Removed shifts are kept and flagged, and every office edit is written to a log with a reason.
3. **Office → Data → Save backup file** writes a complete backup (people, shifts, settings, log) to the tablet's downloads. Email it to yourself or drop it in OneDrive. The Data tab nags when the last backup is over a week old. **Restore from file** merges a backup back in, on this or any other tablet.
4. Connect the Google Sheet backend below and every shift is copied off the tablet within seconds of happening.

## Automatic email alerts (recommended)

The app on its own can flag a missed sign-out on screen, but a web page cannot send email by itself. The `apps-script/Code.gs` file in this repo is a small Google Apps Script that gives you the rest — free, on your own Google account, no server:

- every shift and every person copied into a Google Sheet as it happens;
- **hourly checks by Google**, which email you anyone still signed in after 24 hours and any shift over 14 hours — this keeps working when the tablet is flat, offline or in a drawer;
- an optional 7am email each morning with yesterday's hours by job and by crew.

Setup takes about five minutes and the instructions are in the top of `apps-script/Code.gs`. Once deployed, paste the web app URL and your email address into **Office → Data** and press **Save settings**, then **Sync now**.

Without the script the app still flags everything under **Flags**, and **Open in email app** drafts the same list into the tablet's mail app for you to send.

## Setting up a tablet

1. Open `https://<owner>.github.io/<repo>/signin/` in Chrome (Android) or Safari (iPad).
2. Use **Add to Home Screen**. It installs like a normal app, runs full screen and works offline.
3. Open it, tap **Office** (PIN 1234) → **Data**, and set: location name, a new PIN, alert email and sync URL.
4. In the tablet's own settings turn the screen timeout up (or leave it charging) and, if it supports it, turn on screen pinning / guided access so the app can't be closed.

Notes:

- Times come from the tablet's clock — make sure it is set to New Zealand time and updating automatically.
- A shift belongs to the day it **started**, so night shifts stay on one line and one day's report.
- One tablet holds its own records. If you run a second tablet, give each one the same sync URL so both feed the one spreadsheet.
