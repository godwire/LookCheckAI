# LookCheck AI — Backend

*"What should I wear today?"* — answered by AI, based on your real wardrobe and today's weather.

LookCheck AI is a personal AI stylist. Users build a digital wardrobe (by photographing
items or pasting a link to something they bought), and the app suggests a complete,
weather-appropriate outfit every day — or for a specific event (work, a date, a party...).

This repo is the **backend REST API** that powers the mobile app.

## Features

- 👕 **Digital wardrobe** — add clothing items manually, or let AI extract attributes
  (category, color, style, warmth) from a **photo** or a **product page link**
- 🌦️ **Live weather** — pulls current conditions for the user's location (OpenWeatherMap)
- 🤖 **AI-generated outfits** — Claude picks a coherent, weather-appropriate outfit from
  the user's actual wardrobe, with a short human-readable explanation
- 🎉 **Event mode** — request an outfit tailored to a specific occasion (Work, Date, Sport,
  Party, Casual), each with its own dress-code guidance
- 🔁 **Outfit history** — the app avoids suggesting the same pieces two days in a row

## Tech stack

- **Python 3 + Flask** — REST API
- **SQLite** (stdlib `sqlite3`, no ORM) — lightweight, zero-setup persistence
- **Claude API** (Anthropic) — called directly via `requests`, no SDK dependency
- **OpenWeatherMap API** — live weather data

The Claude and OpenWeatherMap integrations are implemented as thin, isolated service
modules (`services/ai_service.py`, `services/weather_service.py`) that talk to their
REST APIs directly with `requests`. This keeps the project dependency-light and makes
the HTTP contracts fully transparent.

## Demo mode (no API keys needed)

The whole app runs out of the box without any API keys — weather and AI calls fall
back to deterministic mock responses, so you can explore every endpoint immediately.
Add your own keys later to switch on live weather and real AI-generated outfits.

## Getting started

```bash
git clone <this-repo>
cd lookcheck-backend
pip install -r requirements.txt
cp .env.example .env        # optionally fill in ANTHROPIC_API_KEY / OPENWEATHER_API_KEY
python app.py
```

The API is now running at `http://localhost:8000`.

## API overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/users` | Create a user profile |
| GET | `/api/users/<id>` | Get a user profile |
| PUT | `/api/users/<id>/location` | Update saved city/coordinates |
| GET | `/api/users/<id>/wardrobe` | List a user's wardrobe |
| POST | `/api/users/<id>/wardrobe` | Add an item to the wardrobe |
| DELETE | `/api/users/<id>/wardrobe/<item_id>` | Remove an item |
| POST | `/api/wardrobe/analyze-photo` | Extract clothing attributes from a photo |
| POST | `/api/wardrobe/parse-link` | Extract clothing attributes from a product URL |
| GET | `/api/weather?lat=&lon=` | Current weather for a location |
| GET | `/api/events` | List predefined event types & dress codes |
| POST | `/api/users/<id>/outfit/today` | Generate today's outfit |
| POST | `/api/users/<id>/outfit/event` | Generate an outfit for an event (`{"event_name": "Date"}`) |
| GET | `/api/users/<id>/outfits/history` | Recently suggested outfits |
| GET | `/api/health` | Service health + which integrations are configured |

## Example: end-to-end flow

```bash
# 1. Create a user
curl -X POST localhost:8000/api/users -H "Content-Type: application/json" \
  -d '{"name":"Heorhii","style_preference":"Minimalist","city":"Kosice","lat":48.72,"lon":21.25}'

# 2. Add a wardrobe item
curl -X POST localhost:8000/api/users/1/wardrobe -H "Content-Type: application/json" \
  -d '{"category":"top","color":"White","style":"Minimalist","warmth_level":2,"description":"Plain white tee"}'

# 3. Ask for today's outfit
curl -X POST localhost:8000/api/users/1/outfit/today
```

## Project structure

```
lookcheck-backend/
├── app.py                  # Flask app + all routes
├── database.py             # SQLite data access layer (no ORM)
├── schema.sql              # Database schema + seed data
├── services/
│   ├── ai_service.py       # Claude API integration (photo analysis, link parsing, outfit generation)
│   └── weather_service.py  # OpenWeatherMap integration
├── requirements.txt
└── .env.example
```

## Roadmap

- [ ] Background removal for wardrobe photos (Photoroom/Clipdrop) so items look clean in the UI
- [ ] Push notifications with the morning outfit suggestion
- [ ] Multi-day outfit planning (e.g. "plan my whole work trip")
- [ ] React Native mobile client (in progress)
