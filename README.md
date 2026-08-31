# LookCheckAI

An experimental mobile application that recommends outfits from the clothes you already own.

Choosing what to wear depends on several things at once: what is in the wardrobe, the weather, the occasion, what goes with what, and what was worn recently. LookCheckAI treats that as a context-aware recommendation problem over a structured representation of one person's own clothes, rather than as open-ended generation.

> **Status:** active development. Authenticated accounts, a deterministic recommendation engine, image processing and saved outfits work. Deployment and deeper preference learning do not yet.

---

<p align="center">
  <img src="demo/poster.png" width="260" alt="LookCheckAI — today's look" />
</p>

## Demo

A full tour: the daily look, dressing for an occasion, the wardrobe, building a look by hand, and the four ways to add a piece.

https://github.com/user-attachments/assets/2adbd5ab-5e77-41e9-a622-f2af31128529

<details>
<summary><b>By feature</b></summary>

<br>

**Today's look** — the outfit laid out as it would be worn, with the reasoning behind it

https://github.com/user-attachments/assets/5d877023-bb9f-4d67-911d-afc9d1ddc23f

**Occasions** — the same wardrobe read against a dress code

https://github.com/user-attachments/assets/236995cb-eb67-4f17-8d52-2261c8835d99

**Wardrobe** — browsing pieces and editing one

https://github.com/user-attachments/assets/54426204-d66d-4234-b707-323cc9c6a872

**Building a look** — putting a combination together by hand and saving it

https://github.com/user-attachments/assets/90c88590-4d40-4e93-bef3-1a6baa6596b9

**Adding a piece** — by photograph, by shop link, or by hand

https://github.com/user-attachments/assets/636db161-2f6c-457d-8768-9490b5b7f7a3

</details>

<p align="center">
  <sub>Recorded on a development build. Interface and flows may change.</sub>
</p>

---

## Design principle

**Selection and explanation are separate concerns.**

Deterministic code decides what to wear: it filters the wardrobe by weather, enumerates plausible outfits, and scores each for colour harmony, style coherence, warmth and repetition. The language model receives a shortlist of already-good outfits and only chooses between them and describes the result.

Three consequences:

- **It works without AI.** With no API key the scoring engine still produces weather-appropriate, colour-coordinated outfits. The model improves the output; it is not a prerequisite.
- **Model output is constrained.** The model can only return identifiers from a pre-approved shortlist, and each is validated against the user's own wardrobe. A hallucinated item is discarded, not displayed.
- **Recommendations are inspectable.** A surprising suggestion traces to a specific rule rather than to opaque generation.

The same applies to the picture. The outfit is **composed, not generated**: every garment shown is the user's own photograph, moved and scaled but never redrawn. A generative render would look better and would quietly invent clothes that are not in the wardrobe.

---

## How it works

### Adding a piece

Four routes, all producing the same structured record: category, colour, style, warmth (1–5), a normalised tile, a transparent cut-out, and optional notes.

**By photograph.** A vision model finds every garment in the frame and returns a bounding box for each. Several garments produce a chooser rather than a guess.

**By shop link.** Pasted text is normalised first: the URL is extracted from a shared message, app deep links (`intent://`, `wbapp://`) are converted to web addresses, shorteners are followed and campaign parameters stripped. The page is then read for `schema.org/Product` JSON-LD and OpenGraph metadata rather than scraped for visible text — most storefronts render descriptions client-side, so the visible text is often empty while the structured blocks that power search results and social previews are in the served HTML. Galleries are collected from the whole document, including the JSON blobs they are configured with, and the model picks the photograph without a person in it.

**By own photograph.** Attached by hand. No AI, no consent needed, nothing leaves the server.

**By hand.** Typed attributes.

Everything a model returns is normalised before storage: categories and styles constrained to known values, warmth clamped to 1–5, text length-limited.

AI analysis requires explicit, revocable consent. Until the user opts in, no image or page content is sent to any third party.

### Image processing

Whatever is uploaded — a mirror selfie, a shop screenshot, a product photo — becomes a uniform catalogue tile:

```text
load and validate
  -> crop to the garment's bounding box
  -> separate garment from background
  -> trim to the subject
  -> pad proportionally to the object's own size
  -> centre on a square canvas
  -> resize to one fixed size
  -> quality check
  -> save
```

Cropping to the garment's box *before* segmentation is what makes this work on photographs of people: the crop removes the head and legs, and segmentation then removes the room.

One pass yields two artefacts: a tile for wardrobe cards, and a transparent cut-out trimmed exactly to the garment — so its pixel dimensions are the garment's own proportions, which is what the composition needs to place it.

Results are checked, not assumed. A near-empty frame, a flat block of colour, or a subject filling the canvas edge to edge is rejected with an explanation rather than saved.

### Compatibility engine

Scoring lives in `services/compatibility.py`.

**Colour.** Colours are classified as neutrals or accents by family. The rule is the one stylists actually apply: build on neutrals, let at most one colour talk. All-neutral or a single accent scores highest; a tonal palette slightly lower; two competing families lower still; three or more accents are heavily penalised.

**Style.** A pairwise affinity matrix. Formal with Sport scores 0.2; Casual with Streetwear scores 0.85. An outfit's coherence is the mean affinity across its pieces, weighted against the stated preference.

**Warmth.** Pieces outside the day's warmth band are penalised by distance, so a winter coat is not suggested in mild weather just because it is the only outerwear owned.

**Layering.** On a cool day the engine looks for a mid-weight top to lead and a lighter one underneath. Nothing in the data says "t-shirt" or "sweatshirt", but warmth already does.

**Freshness.** Recently worn pieces, and pieces from rejected outfits, lose ground to unused ones.

Candidates are enumerated combinatorially, scored, de-duplicated and ranked. The top-ranked outfit is the answer when no model is available; otherwise the top five go to the model as options.

```text
Wardrobe
   ▼
Weather filter (hard constraint)
   ▼
Candidate generation, including layering
   ▼
Compatibility scoring  ◄── Occasion · Preferences · Feedback
   ▼
Ranked shortlist
   ▼
Model selection and explanation  (optional)
   ▼
Validation against the wardrobe
   ▼
Outfit ──► Composition
```

### Outfit composition

The outfit is drawn as it would be worn, without anyone wearing it.

Garments are sized by **where they join**. Flat-lay photographers lay pieces in their natural wear relationship — the hem of the top at the waist of the trousers, the trouser hems on the shoes — and what makes that read as one body is not the size of each piece but that the pieces meet. So the backend measures, for every cut-out, how wide the garment is at its top and bottom edge and where that edge sits horizontally. Only the top is given a size; everything below is scaled so its opening matches the hem above.

Baggy trousers therefore come out wider than skinny ones, because their waist is a smaller share of their own width — no garment types, no thresholds, no table of measurements to tune. Pieces align by the seam rather than the bounding box, so trousers photographed with the legs swung aside still hang from the waist.

Two tops are drawn as two layers. Accessories go where they sit on a body: a chain at the collar, a ring at the hand, a belt at the waist.

### Product lookup

A phone snap of a jumper on a bed makes a poor tile. If the garment is recognisable, the shop's photograph is better.

The vision model reads the garment — brand, model, distinguishing details — the name is searched for, the product page is parsed by the same code that handles pasted links, and the candidate photo is shown to the model *alongside the user's own* to check they are the same thing. Both are then shown side by side and the user decides. Nothing is substituted automatically.

This avoids reverse image search deliberately. There is no usable public one — Google Lens has no API, and Google's Vision Product Search matches against a catalogue you supply rather than the open web. More to the point, reverse image search returns what looks *similar*: a plain black t-shirt matches a thousand others, and filing someone else's t-shirt in a wardrobe breaks the promise the app makes.

### Weather

Temperature, apparent temperature, precipitation and wind set the acceptable warmth band, whether an outer layer is required, and whether layering makes sense.

**Open-Meteo** is the default and needs no API key; OpenWeatherMap is available as an alternative. Results are cached in-process per rounded coordinate pair. If the provider is unreachable a neutral fallback is used — weather never fails the recommendation.

### Saved looks

Combinations can also be assembled by hand, with the composition updating as pieces are tapped. A saved look can be worn in one tap, which writes the same record the recommender does — it appears on the Today screen, counts as worn, and feeds the same history and feedback. Removing a garment removes it from every look that used it.

### History and feedback

Each day's look is generated once and cached, so re-opening the app returns the same recommendation instead of silently producing a different one. An explicit action requests an alternative.

Outfits can be rated. Rejected outfits demote their pieces in future scoring — the first, deliberately simple version of preference learning.

---

## Architecture

```text
┌─────────────────────────┐
│     Mobile Client       │
│   React Native / Expo   │
└────────────┬────────────┘
             │ REST / JSON + Bearer token
             ▼
┌─────────────────────────┐
│       Flask API         │
│  Auth · Rate limiting   │
└────────────┬────────────┘
   ┌─────────┼──────────┬──────────────┬──────────────┬──────────────┐
   ▼         ▼          ▼              ▼              ▼              ▼
┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│SQLite/ │ │Compat. │ │  Image   │ │    AI    │ │ Weather  │ │  Search  │
│Postgres│ │ engine │ │ pipeline │ │(optional)│ │ provider │ │(optional)│
└────────┘ └────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

External services sit behind thin service modules. The AI, weather and search providers are chosen by configuration at startup, and each degrades to a working default when unavailable.

---

## Security

Not deployed, but written to production expectations where retrofitting would be expensive.

**Authentication.** Email and password. Passwords hashed with PBKDF2-HMAC-SHA256 from the standard library; sessions are stateless JWT access tokens. No third-party identity provider.

**Authorisation.** Every user-scoped route resolves the account from the bearer token. No endpoint accepts a user id from the URL, and every query touching user data filters on the owner — including the lookup that resolves item identifiers returned by a language model.

**Request forgery.** Several endpoints make the server fetch a user-supplied URL, so targets are validated: HTTP and HTTPS only, hostnames resolved, private, loopback, link-local and reserved addresses rejected. Redirects are followed one hop at a time with every intermediate address checked the same way — a shortener on a respectable domain redirecting to a cloud metadata endpoint is exactly what a first-URL-only check waves through.

**Abuse and cost.** Every expensive endpoint is rate limited, per user where authenticated and per address otherwise, with additional daily and hourly quotas on generation and AI analysis. Uploads are size-capped.

**Data protection.** Third-party AI analysis is opt-in and revocable. Account deletion is available in-app and cascades to wardrobe, outfits, saved looks and feedback; stored images are removed with the items that own them.

`smoke_test.py` exercises these against a running server, including cross-account isolation and the request-forgery protections.

---

## Stack

**Mobile** — React Native, Expo, React Navigation, Reanimated, Expo Location, Expo Image Picker, AsyncStorage.

**Backend** — Python, Flask, SQLite (development) or PostgreSQL (production) via `DATABASE_URL`, PyJWT, Pillow and rembg for the image pipeline. Pluggable providers: Gemini or Claude for AI, Open-Meteo or OpenWeatherMap for weather, and a swappable search provider — all called over plain HTTPS, without vendor SDKs.

---

## Repository structure

```text
LookCheckAI/
├── demo/poster.png
│
├── lookcheck-app/
│   ├── src/
│   │   ├── api/client.js            # API client, bearer token handling
│   │   ├── components/
│   │   │   ├── ClothingCard.js      # Expandable garment row
│   │   │   ├── ColorwayStrip.js     # An outfit's palette as a swatch card
│   │   │   ├── OutfitComposition.js # The look, laid out
│   │   │   ├── OutfitCard.js
│   │   │   ├── ProductMatchPrompt.js
│   │   │   └── WeatherBadge.js
│   │   ├── context/AuthContext.js
│   │   ├── screens/                 # Today, Occasions, Wardrobe, Looks, Settings, ...
│   │   ├── config.js                # Backend URL resolution
│   │   └── theme.js                 # Design tokens
│   ├── App.js
│   ├── app.json
│   └── package.json
│
├── lookcheck-backend/
│   ├── services/
│   │   ├── ai_service.py            # Provider transport, extraction, generation
│   │   ├── compatibility.py         # Colour and style scoring
│   │   ├── image_service.py         # Cut-outs, tiles, join measurement
│   │   ├── link_service.py          # URL extraction, deep links, redirects
│   │   ├── product_lookup.py        # Identify a garment, find its photo
│   │   └── weather_service.py       # Weather providers and caching
│   ├── app.py                       # Routes
│   ├── auth.py                      # Passwords, tokens, route guard
│   ├── security.py                  # Rate limiting, URL validation
│   ├── config.py                    # Configuration and validation
│   ├── database.py                  # Data access and migrations
│   ├── schema.sqlite.sql
│   ├── schema.postgres.sql
│   ├── smoke_test.py                # End-to-end API test
│   ├── rebuild_cutouts.py           # Maintenance: repair stored cut-outs
│   ├── list_gemini_models.py        # Diagnostic helper
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
│
├── .gitignore
├── LICENSE
└── README.md
```

---

## Running it

### Backend

```bash
cd lookcheck-backend
pip install -r requirements.txt
cp .env.example .env
python app.py
```

Every setting has a working default, so it starts with an empty configuration file. `JWT_SECRET` is the only requirement, and only in production:

```env
JWT_SECRET=
DATABASE_URL=sqlite:///lookcheck.db

# Optional. Without a key it runs on the scoring engine alone.
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite

# Optional. Open-Meteo is the default and needs no key.
WEATHER_PROVIDER=open-meteo

# Optional. Product lookup; the default provider needs no key.
SEARCH_PROVIDER=duckduckgo
```

Generate a secret with `python -c "import secrets; print(secrets.token_hex(32))"`.

The startup line reports the active configuration, for example `(ai=gemini, weather=open-meteo)`. The segmentation model, about 4.5 MB, downloads on first use.

Verify against a running server:

```bash
python smoke_test.py
```

### Mobile app

```bash
cd lookcheck-app
npm install
npx expo start
```

The backend address is detected from the Expo development server, so nothing needs configuring as long as both run on the same machine. For a production build set `extra.apiBaseUrl` in `app.json` or `EXPO_PUBLIC_API_URL`.

Requires Node.js 20.19.4 or newer.

---

## Status

| Component | |
|---|---|
| Mobile UI, navigation, main flows | Implemented |
| Digital wardrobe | Implemented |
| Authentication and account management | Implemented |
| Image storage and processing | Implemented |
| Outfit composition | Implemented |
| Weather integration | Implemented |
| Compatibility scoring and layering | Implemented |
| Occasion-aware recommendations | Implemented |
| Saved looks | Implemented |
| History and feedback | Implemented |
| AI clothing analysis and explanation | Experimental |
| Product lookup | Experimental |
| Preference learning | Basic |
| Unit tests | Planned |
| Object storage for images | Planned |
| Production deployment | Not available |

---

## Limitations

**Segmentation.** Background removal uses a general subject-segmentation model, not a garment-specific one: it separates subject from background but does not know a t-shirt from the arms inside it. Cropping to the garment's box first handles most of this; a sliver of arm occasionally survives. A garment-specific model would fix it at roughly a hundred times the memory.

**Image storage.** Processed images go to local disk, which suits development and is wrong for most hosting, where the filesystem is wiped on redeploy. Moving to object storage means replacing one function.

**Product lookup.** Only recognisable branded garments can be found; a plain unbranded piece will not be, which is the expected outcome. The default search provider is scraped HTML and can break without warning.

**Evaluation.** The scoring rules encode conventional styling heuristics and have not been tested against a benchmark or a labelled dataset. Recommendations are experimental output, not objectively optimal combinations.

**AI reliability.** Attribute extraction is probabilistic and may misread a garment. Output is normalised and selection is constrained to a pre-scored shortlist, but attribute errors still propagate.

**Representation.** A limited attribute set. Material, fit, season, pattern, formality and learned image embeddings are all absent.

**Scale.** Rate-limit counters live in process memory, so they reset on restart and count per worker. A multi-worker deployment needs shared storage for them.

---

## Planned

Object storage for images · production deployment · garment-specific segmentation · pattern and material attributes · multi-day planning · seasonal wardrobe analysis · wardrobe statistics and neglected-item detection · richer preference modelling · unit tests alongside the existing end-to-end suite.

---

## Licence

All rights reserved. The source is public for demonstration and portfolio purposes; permission is not granted to copy, modify, distribute, sublicense or reuse it. See [`LICENSE`](LICENSE).

Recommendations produced by the application are subjective and are not professional styling advice.