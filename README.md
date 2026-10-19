# Parlons — TCF French trainer (A1 → B2)

A free, installable web app for daily TCF Canada / TCF Tout Public practice. No backend, no build step.

**Practice modes:** spaced-repetition vocabulary (flashcards, listen-and-type, translate), 24 grammar lessons with quizzes, listening and reading comprehension in TCF format, dictation, pronunciation scored by the microphone, Expression écrite tasks 1–3 and Expression orale tasks 1–3 with AI grading, plus a timed mock exam with an estimated /699 score and NCLC level.

## Host on GitHub Pages
1. Create a public repo (e.g. `parlons`) and upload every file in this folder, keeping the `data/` and `icons/` folders.
2. Repo **Settings → Pages → Deploy from a branch → `main` / root → Save**.
3. After a minute the app is live at `https://<username>.github.io/parlons/`.

## Put it on your home screen
- **iPhone:** open the link in Safari → Share → **Add to Home Screen**.
- **Android:** open in Chrome → ⋮ → **Install app**.

## Notes
- Progress lives in the phone's browser storage. Use **Réglages → Exporter** for backups.
- Read-aloud uses the phone's French voices. On iPhone, turn off Silent mode, and for a better voice download an "Enhanced" French voice in Settings → Accessibility → Spoken Content → Voices.
- AI grading works two ways: "Corriger dans l'app Claude" (free on your subscription) or an optional Anthropic API key in Réglages for instant grading and a live examiner in speaking task 2. The key never leaves the device except to call the API.
- Scores are estimates for tracking progress, not official results.
