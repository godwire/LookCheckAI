# LookCheck AI

**Your daily AI stylist.** LookCheck AI analyzes your real wardrobe and today's
weather to suggest what to wear — every day, or for a specific event.

> 🚧 **Status: In active development.** This is a personal project built to explore
> full-stack + AI engineering end-to-end (backend, mobile app, and real LLM
> integration). Not yet published to the App Store / Google Play.

## What it does

- 📸 **Digital wardrobe** — add clothing by taking a photo, picking one from your
  gallery, or pasting a product link. AI extracts category, color, style, and
  warmth automatically.
- ☀️ **Today's Look** — a live weather check combined with an AI-picked outfit
  from your actual wardrobe, with a short explanation of *why* it works.
- 🎉 **Event mode** — request an outfit tailored to a specific occasion (Work,
  Date, Sport, Party, Casual).
- 🔁 **No repeats** — the app tracks recent suggestions so it doesn't recommend
  the same pieces two days in a row.

## Screenshots

<p align="center">
  <img src="demo/demo-1.jpg" width="250" alt="Onboarding screen" />
  <img src="demo/demo-2.jpg" width="250" alt="Today's Look screen" />
  <img src="demo/demo-3.jpg" width="250" alt="Wardrobe screen" />
  <img src="demo/demo-4.jpg" width="250" alt="Adding items to wardrobe" />
</p>

## Architecture

This is a monorepo with two parts:

| Folder | What it is |
|---|---|
| [`lookcheck-backend/`](./lookcheck-backend) | Python + Flask REST API. Talks to the Claude API and OpenWeatherMap directly over HTTPS (no SDKs) for full control over the integration. SQLite for storage — no ORM. |
| [`lookcheck-app/`](./lookcheck-app) | React Native (Expo) mobile app — one codebase for iOS and Android. |

Each subfolder has its own detailed README covering its tech stack and API.

## Getting started

Full step-by-step setup instructions (including for complete beginners) are in
[`SETUP_GUIDE.md`](./SETUP_GUIDE.md).

## Tech stack

**Backend:** Python, Flask, SQLite, Claude API (Anthropic), OpenWeatherMap API
**Mobile:** React Native, Expo, React Navigation

## License

All rights reserved. See [`LICENSE`](./LICENSE). This repository is public for
portfolio/demonstration purposes only — no permission is granted to reuse the code.
