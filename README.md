# Karaoke by Words — Coro Canticorum (Basses)

Browser app for choir practice. It plays the **bass line** as a piano guide, listens to your voice with the microphone, and shows each note as a cell that turns green when your pitch is close enough.

**Live site:** [edouardor.github.io/Karaoke-por-palabras](https://edouardor.github.io/Karaoke-por-palabras/)

The interface is in Spanish.

## What it is

- Word-by-word practice for Christmas and choir repertoire (bass part).
- Pitch checking in real time (humming or singing the note name also works).
- Three practice modes: listen only, guided training, or continuous karaoke.
- Optional **Solo / Choir** karaoke when a piece has other voices (canon or staggered entries).
- Warm-up exercises before singing the songs.
- **Games** under **Juegos**: Rhythm (timing), Hummingbird (intervals), Bird (pitch), and Simon Says (melody memory), with scores logged in “songs studied today” where applicable.
- Piano samples for the melody (and choir voices when Coro is on).
- Test pieces with free starting pitch: **Cumpleaños Feliz** and **Frère Jacques** (not required in Simon Says).

## How to use

1. Open the live site (or serve this folder with any static HTTP server).
2. Allow the microphone when the browser asks.
3. Tap **Probar micrófono** and speak or sing until the level bar moves.
4. Prefer a short warm-up: **Calentamiento**, then exercise 1–5.
5. Choose a piece from the list. Tuning difficulty starts at *Iniciación / Muy Fácil*; tighten it later if you want.
6. Pick a mode:
   - **Modo escucha solo** — hear the bass melody word by word; pause, go back/forward, then jump into training from the current word.
   - **Modo entrenamiento** — hear a guide for the word, then sing. Each cell is one note; it turns green when you are in tune. Arrows (or ← →) change word. Tap a cell to hear that note and restart the word from there. After about one second stuck on a note, the border turns white: tap it to hear what you sang and then the correct note.
   - **Modo karaoke** — pitch reference + one-bar count-in, then the melody runs on its own while you sing along. Notes score green if you match them in time. You can change playback speed. Headphones help so the speaker does not fool the mic.
7. On pieces that support it, choose **Solo** or **Coro** before karaoke:
   - **Solo** — bass line only (what you sing). Some pieces add a second verse with the same melody.
   - **Coro** — you still only see and sing the bass part, but you also hear the other voices. You may wait while sopranos (and later other parts) enter first.

### Games (Juegos)

Open **Juegos** from the home screen.

#### 1 — Rhythm

Tap along with a piece **without the microphone**: only attack timing and hold duration are scored. The melody sounds only while you hold.

- Choose a piece (same list as the main menu, including Frère Jacques).
- One-bar count-in; optional metronome.
- Tap the screen or the space bar on each note and **hold** for its length.
- Starts at **×0.6** of the score tempo; you can change speed, pause, and resume.
- Pieces with a **pickup** (anacrusis) hide the lyric until that beat and show **Espera al tiempo N** (for example *Gia la notte* waits for beat 4 in 6/8).
- Pieces that start on the downbeat get a short prep pulse after the count “1” so the first note is easier to catch.
- Tempo changes such as ritardandos are ignored in Rhythm so the click stays steady.
- At the end you see % good for **moment** and **duration**; the run is added to today’s activity log.

#### 2 — Hummingbird (Colibrí)

Practice **intervals** with your voice. You sing a comfortable base note first; the game uses that pitch as “unison”.

- Nine flowers one by one (unison → major 2nd → major 3rd → perfect 4th → perfect 5th, then back down to unison). Only **first-try** sips count toward the score.
- Escape (or the on-screen control) plays the base note and then the target interval so you can hear it.
- After the nine flowers: a **guided** sequence of the same intervals (guide notes sound shortly before you reach each flower), then a message, then the **same sequence without** guide notes.
- Score goes into today’s activity log.

#### 3 — Bird

A bird moves up and down with your **sung pitch** and must catch cherries placed at each note height. Syllables appear under the cherries.

- Choose a piece. **Test pieces** (Cumpleaños Feliz, Frère Jacques): sing a comfortable starting note; the melody is transposed to it. Other pieces: you hear the first note as in karaoke, then play.
- Cherries move from the right; the note sounds only when you catch a cherry.
- Starts at **×0.6** speed; pause, resume, and replay like Rhythm.
- Score (cherries caught) goes into today’s activity log.

#### 4 — Simon Says (Simon 🗣️)

Memory game on a **12-note chromatic disk** (Chrome-logo style) or a **piano** from low E to high E (two octaves). No sung starting note is required: the written pitches are used as-is (shifted as a whole so they fit the piano).

- Choose any piece from the shared song list.
- The melody is shown **measure by measure**: listen (pads/keys light up), then tap the same sequence.
- **Fácil** (on by default): only the note names that appear in the current measure are shown.
- Center **ayuda** on the disk (or the button under the piano) plays and highlights the next expected note (or the correct one after a mistake).
- A wrong tap replays that measure. If you finish every measure with **no mistakes**, you get a final round with the **whole song** in one go.

### Tips

- Warm up before the songs so the voice is ready and less forced.
- On a computer, headphones avoid the piano feeding back into the mic.
- Do not force the voice; if it feels tense, stop, listen again, then retry.
- Use **Canciones estudiadas hoy** to see what you practiced (songs and games) during the day.

## Run locally

No build step. From this folder:

```bash
python3 -m http.server 8765
```

Then open `http://127.0.0.1:8765/`.

## Project layout

| Path | Role |
| --- | --- |
| `index.html` | UI |
| `app.js` | Pitch detection, modes, games, piano/choir playback |
| `styles.css` | Layout, note cells, and game screens (Rhythm, Hummingbird, Bird, Simon) |
| `canciones/` | Song JSON (melody) + lyric JSON; some pieces also have a `* coro.json` |
| `imagenes/` | Game icons (e.g. snare for Rhythm) |
| `sonidos/piano/` | Acoustic piano samples |

Songs are plain JSON (Tone.js-style MIDI export + hyphenated lyrics). Warm-ups are opened from the Calentamiento menu, not from the main song list. Games reuse the same song files; Frère Jacques is a shared test piece in every selector.
