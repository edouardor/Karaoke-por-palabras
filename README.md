# Karaoke by Words — Coro Canticorum (Basses)

Browser app for choir practice. It plays the **bass line** as a piano guide, listens to your voice with the microphone, and shows each note as a cell that turns green when your pitch is close enough.

**Live site:** [edouardor.github.io/Karaoke-por-palabras](https://edouardor.github.io/Karaoke-por-palabras/)

The interface is in Spanish. 

## What it is

- Word-by-word practice for Christmas and choir repertoire (bass part).
- Pitch checking in real time (no need to sing the lyric: humming or singing the note name also works).
- Three ways to work: listen only, guided training, or continuous karaoke.
- Optional **Solo / Choir** karaoke for pieces that have other voices (for example Venid as a canon, or Salta Navideña with staggered entries).
- Warm-up exercises before singing the songs.
- Piano samples for the melody (and choir voices when Coro is on).

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
   - **Solo** — bass line only (what you sing).
   - **Coro** — you still only see and sing the bass part, but you also hear the other voices. You may wait while sopranos (and later other parts) enter first.

### Tips

- Warm up before the songs so the voice is ready and less forced.
- On a computer, headphones avoid the piano feeding back into the mic.
- Do not force the voice; if it feels tense, stop, listen again, then retry.

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
| `app.js` | Pitch detection, modes, piano/choir playback |
| `styles.css` | Layout and note cells |
| `canciones/` | Song JSON (melody) + lyric JSON; some pieces also have a `* coro.json` |
| `sonidos/piano/` | Acoustic piano samples |

Songs are plain JSON (Tone.js-style MIDI export + hyphenated lyrics). Warm-ups are opened from the Calentamiento menu, not from the main song list.
