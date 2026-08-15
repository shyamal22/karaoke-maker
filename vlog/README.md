# Daily Vlog

Capture the day on your phone — photos, clips, a progress shot, the numbers — then compile it
into a finished vlog **on the phone itself**. No account, no server, no upload. Built for a
running / fitness journey where a video goes out every day.

Live at `https://<owner>.github.io/<repo>/vlog/` once Pages is set up (see below).

## The daily loop

1. **Shoot through the day.** Open the app, tap **Photo** or **Video**, or **Add from library**
   to pull in anything you already shot. Everything lands on today automatically.
2. **Take the daily shot.** One photo a day tagged **Photo of the day** — that's the one that
   builds the before/after story over weeks. There are **Before** and **After** slots too for
   within-the-day pairs (pre/post workout).
3. **Fill in the numbers.** Distance, moving time, weight, energy, a headline and notes.
   Pace is worked out for you.
4. **Order and caption.** Tap any item to caption it, retag it, trim a clip, mute it, move it
   earlier or later, or drop it from the edit. **Sort by time taken** puts the day back in
   the order it happened.
5. **Make today's vlog.** Pick the shape, hit render, save or share the file.

## What it builds

The edit is assembled for you, then rendered to a real video file:

- **Title card** — day number, your headline, the date, over the day's photo.
- **Every included photo and clip**, in your order. Photos get a slow Ken Burns push; clips
  play with their own sound and are trimmed to your in/out points. Anything shot landscape is
  letterboxed over a blurred blow-up of itself instead of being cropped to bits.
- **Stats card** — distance, moving time, pace, weight, energy.
- **Before / after split** — the two tagged shots side by side.
- **Outro** — day number, your name, current streak.

Options per render: **vertical 9:16 / square / wide 16:9**, how long photos hold, longest clip
length, **cut to the beat** (enter a BPM and photo holds snap to it), a music bed, and a toggle
for each card. Music ducks automatically under clips that have their own sound.

## The journey

The **Journey** tab lines up every *Photo of the day* start to now, with totals (days logged,
distance, moving time, weight change) and a then-&-now pair. **Compile the journey recap**
cuts all of them together fast, ending on a Day 1 vs today split — that's the payoff for
doing this daily.

## How the rendering actually works

Every frame is drawn to a canvas, captured as a video stream, mixed with clip and music audio,
and encoded by the browser's own recorder. Consequences worth knowing:

- **It renders in real time.** A one minute vlog takes about a minute.
- **Keep the screen on and don't switch apps** while it runs. The app holds a screen wake lock
  where the browser supports it, but a backgrounded tab stops producing frames.
- **You get `.mp4` where the browser supports it** (iOS Safari, recent Chrome), otherwise
  `.webm`. Both drop straight into Photos; mp4 is what socials prefer.
- The finished file is **not kept in the app** — save or share it as soon as it's done.

## Installing it on your phone

Open the URL, then use the browser's **Add to Home Screen** (Share menu on iPhone, ⋮ on
Android). It installs like a normal app and works offline afterwards.

## Your data

- Everything lives **on the device**, in browser storage. Nothing is uploaded anywhere.
- **⋮ → Export backup** saves a JSON file with every day, the numbers and all your **photos**.
  **Videos are not included** — they're far too large for a single JSON file. Save any clip you
  want to keep by opening it and using your browser's save, or keep the originals in your
  camera roll (importing from the library copies them, it doesn't move them).
- Don't clear site data for the app, or the days on that phone are gone.
- Use music you own or that's cleared for use. Nothing is fetched from the internet — you pick
  an audio file off your own device.

## Files

| File | What it does |
| --- | --- |
| `index.html` | App shell, hidden file pickers, tab bar |
| `app.js` | Storage (IndexedDB), capture, day editing, all the screens |
| `compile.js` | The compiler: plan builder, canvas renderer, audio mixing, encoding |
| `app.css` | Dark, thumb-first styling |
| `sw.js` | Service worker so it opens with no signal |

Media blobs are stored in their own IndexedDB store, separate from metadata, so listing months
of days never pulls gigabytes of video into memory; clips are fetched one at a time as the
renderer reaches them.

## Deploying

The repo's **Deploy to GitHub Pages** workflow publishes the whole tree to the `gh-pages`
branch, so this app is served from the `/vlog/` sub-path alongside whatever is at the root.
One-time setup: **Settings → Pages → Deploy from a branch → `gh-pages` / `(root)`**.
