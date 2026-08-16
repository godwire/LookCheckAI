# LookCheckAI

**LookCheckAI** is an experimental mobile application for context-aware clothing recommendation.

The project explores how structured wardrobe information, environmental conditions, user preferences, and large language model reasoning can be combined to generate practical outfit recommendations from clothes that the user actually owns.

> **Project status:** Active development  
> LookCheckAI is currently a functional prototype. Core application flows are implemented, while recommendation logic, AI-assisted clothing analysis, personalization, testing, and deployment are still being developed 

---

## Overview

Selecting an outfit depends on more than visual compatibility.

A useful recommendation system needs to consider several types of information simultaneously:

- available clothing items;
- current weather conditions;
- clothing category and warmth;
- colors and style;
- occasion or activity;
- personal preferences;
- recently used combinations.

LookCheckAI approaches this problem as a **context-aware recommendation task**.

Instead of generating arbitrary outfit ideas, the system works with a structured representation of the user's own wardrobe and attempts to select an appropriate combination from the available items.

---

## Screenshots

<p align="center">
  <img src="demo/demo-1.jpg" width="200" alt="LookCheckAI onboarding interface" />
  <img src="demo/demo-2.jpg" width="200" alt="LookCheckAI daily outfit recommendation" />
  <img src="demo/demo-3.jpg" width="200" alt="LookCheckAI wardrobe interface" />
  <img src="demo/demo-4.jpg" width="200" alt="LookCheckAI wardrobe management interface" />
</p>

<p align="center">
  <sub>Current development version. Interface elements and user flows may change during development.</sub>
</p>

---

## Main Features

### Digital Wardrobe

The application maintains a structured representation of the user's clothing collection.

Wardrobe items can contain information such as:

- clothing category;
- color;
- style;
- approximate warmth level;
- image reference;
- additional metadata used during recommendation.

The objective is to transform a collection of clothing images into data that can be used programmatically by the recommendation system.

### AI-Assisted Clothing Analysis

LookCheckAI experiments with AI-assisted extraction of clothing attributes from images and other available information.

Instead of using the image alone during every recommendation request, extracted properties can be stored as structured wardrobe data.

```text
Clothing Image
      │
      ▼
AI Analysis
      │
      ▼
Structured Attributes
      │
      ├── Category
      ├── Color
      ├── Style
      └── Warmth
```

This separation makes it possible to reason over explicit clothing properties while retaining visual information for future extensions.

### Context-Aware Outfit Recommendation

Outfits are generated from items that exist in the user's wardrobe.

The recommendation process can take several contextual signals into account:

```text
Wardrobe
   │
   ├──────────────┐
   │              │
   ▼              ▼
Weather        Occasion
   │              │
   └──────┬───────┘
          │
          ▼
 User Preferences
          │
          ▼
Recommendation Logic
          │
          ▼
 Suggested Outfit
```

The long-term goal is to combine deterministic constraints with AI reasoning rather than relying entirely on unconstrained text generation.

### Weather-Aware Recommendations

Weather information can be included as contextual input when selecting clothing.

Relevant factors may include:

- temperature;
- current weather conditions;
- perceived warmth requirements;
- suitability of individual wardrobe items.

Weather is therefore treated as part of the recommendation context rather than as an independent application feature.

### Occasion-Based Recommendations

Users can request outfits for different situations.

Examples include:

- Casual
- Work
- Date
- Sport
- Party

The selected context affects which wardrobe items should be considered appropriate for the recommendation.

### Recommendation History

Previous recommendations can be stored and used as additional context.

This creates the basis for future functionality such as:

- reducing repetitive recommendations;
- tracking frequently used items;
- identifying neglected wardrobe items;
- learning user preferences over time.

---

## System Architecture

LookCheckAI is organized as a mobile client and backend service.

```text
LookCheckAI/
│
├── lookcheck-app/
│   └── Mobile application
│
├── lookcheck-backend/
│   └── Backend API and application logic
│
├── demo/
│   └── Application screenshots
│
├── .gitignore
├── LICENSE
└── README.md
```

The current architecture follows a client-server model:

```text
┌─────────────────────────┐
│     Mobile Client       │
│   React Native / Expo   │
└────────────┬────────────┘
             │
             │ REST / JSON
             │
             ▼
┌─────────────────────────┐
│       Flask API         │
│        Python           │
└────────────┬────────────┘
             │
     ┌───────┼───────────────┐
     │       │               │
     ▼       ▼               ▼
┌────────┐ ┌──────────┐ ┌──────────────┐
│ SQLite │ │ AI Model │ │ Weather API  │
│        │ │ / LLM    │ │              │
└────────┘ └──────────┘ └──────────────┘
```

External services are separated from the primary application logic so that individual components can be modified or replaced independently.

---

## Recommendation Pipeline

A simplified representation of the current concept is:

```text
User Wardrobe
      │
      ▼
Clothing Representation
      │
      ├───────────────────┐
      │                   │
      ▼                   ▼
Weather Context      Occasion Context
      │                   │
      └─────────┬─────────┘
                │
                ▼
        Candidate Selection
                │
                ▼
       Compatibility Reasoning
                │
                ▼
       Final Outfit Selection
                │
                ▼
    Human-Readable Explanation
```

The recommendation system is being developed around the idea that **selection and explanation should be separate concerns**.

A future version should increasingly rely on deterministic filtering and scoring for candidate selection, while generative AI is used where semantic reasoning or natural-language explanation provides additional value.

---

## Technology Stack

### Mobile Application

- React Native
- Expo
- JavaScript
- React Navigation
- Expo Location
- Expo Image Picker
- AsyncStorage

### Backend

- Python
- Flask
- REST API
- SQLite
- External AI API integration
- Weather API integration

### Development

- Git
- GitHub
- VS Code
- REST-based client-server communication

---

## Repository Structure

```text
LookCheckAI/
│
├── demo/
│   ├── demo-1.jpg
│   ├── demo-2.jpg
│   ├── demo-3.jpg
│   └── demo-4.jpg
│
├── lookcheck-app/
│   ├── src/
│   ├── App.js
│   ├── app.json
│   ├── package.json
│   └── ...
│
├── lookcheck-backend/
│   ├── services/
│   ├── app.py
│   ├── database.py
│   ├── schema.sql
│   ├── requirements.txt
│   └── .env.example
│
├── .gitignore
├── LICENSE
└── README.md
```

---

## Running the Project

### Backend

Move to the backend directory:

```bash
cd lookcheck-backend
```

Install the Python dependencies:

```bash
pip install -r requirements.txt
```

Create the required environment configuration based on `.env.example`.

Example:

```env
ANTHROPIC_API_KEY=
OPENWEATHER_API_KEY=
PORT=8000
```

Then start the backend:

```bash
python app.py
```

The development server is expected to run locally, typically on:

```text
http://localhost:8000
```

### Mobile Application

Move to the application directory:

```bash
cd lookcheck-app
```

Install dependencies:

```bash
npm install
```

Start the Expo development environment:

```bash
npx expo start
```

The application can then be opened using an appropriate Android or iOS development environment.

---

## Development Status

LookCheckAI is **not production-ready**.

The repository currently represents an engineering prototype used to develop and test the overall system architecture and recommendation workflow.

| Component | Status |
|---|---|
| Mobile UI | In development |
| Navigation and main user flows | Implemented / evolving |
| Digital wardrobe | Prototype implemented |
| Clothing storage | Implemented |
| Weather integration | Implemented |
| AI clothing analysis | Experimental |
| Outfit recommendation | Experimental |
| Occasion-aware recommendations | Prototype |
| Recommendation history | Prototype |
| Preference learning | Planned |
| Automated testing | Planned |
| Production authentication | Planned |
| Production deployment | Not available |

The status of individual components may change frequently while the project is under active development.

---

## Current Limitations

### Recommendation Evaluation

The recommendation system has not yet been evaluated against a formal fashion compatibility benchmark or a sufficiently large human-labelled dataset.

Recommendations should therefore be interpreted as experimental system outputs rather than objectively optimal clothing combinations.

### AI Reliability

Part of the current workflow relies on generative AI.

Large language model outputs are probabilistic and may occasionally produce inconsistent reasoning or incorrectly interpret clothing attributes.

Future development should reduce unnecessary dependence on generative reasoning by introducing more explicit rules, validation, and compatibility scoring.

### Clothing Representation

The current representation of wardrobe items uses a relatively limited collection of attributes.

Possible future attributes include:

- material;
- fit;
- season;
- pattern;
- layering compatibility;
- formalness;
- garment condition;
- learned image embeddings.

### Personalization

The current system has limited long-term user modelling.

Future versions may use explicit and implicit feedback to learn:

- preferred colors;
- preferred combinations;
- frequently rejected recommendations;
- favorite clothing items;
- preferred style;
- tolerance to different weather conditions.

### Persistence

The current persistence architecture is designed primarily for development and prototyping.

A production implementation would require a more complete data layer together with authentication, authorization, synchronization, backup, and migration mechanisms.

### External Services

Some application functionality depends on third-party services.

Availability, latency, API limits, and changes to external services may therefore affect application behavior.

---

## Planned Development

Current and proposed areas of development include:

- improving clothing attribute extraction;
- separating deterministic constraints from LLM reasoning;
- compatibility scoring between wardrobe items;
- more advanced weather-based filtering;
- preference learning from user feedback;
- recommendation diversity;
- duplicate outfit prevention;
- multi-day outfit planning;
- seasonal wardrobe analysis;
- wardrobe statistics;
- automated backend testing;
- automated API testing;
- improved error handling;
- image preprocessing;
- background removal for clothing images;
- improved application state management;
- user authentication;
- cloud persistence;
- deployment configuration.

---

## Research and Engineering Direction

LookCheckAI is primarily an engineering project, but several aspects of the problem are relevant to recommender systems and applied artificial intelligence.

The project provides a practical environment for experimenting with:

- multimodal information processing;
- structured extraction from images;
- context-aware recommendation;
- constrained recommendation;
- LLM-assisted reasoning;
- explainable recommendations;
- user preference modelling;
- human-AI interaction;
- mobile AI application architecture.

One of the central design questions is how much of the recommendation process should be performed by deterministic software and how much should be delegated to a generative model.

A purely generative system is flexible but difficult to evaluate and control. A purely rule-based system is predictable but may struggle with semantic concepts such as style compatibility.

LookCheckAI therefore explores a hybrid direction in which explicit constraints and structured data define the candidate space while AI components support higher-level interpretation and explanation.

---

## Long-Term Direction

The intended architecture is moving toward a pipeline similar to:

```text
                    User
                      │
                      ▼
             Digital Wardrobe
                      │
                      ▼
            Feature Extraction
                      │
                      ▼
             Structured Items
                      │
          ┌───────────┼───────────┐
          │           │           │
          ▼           ▼           ▼
       Weather     Occasion    Preferences
          │           │           │
          └───────────┼───────────┘
                      │
                      ▼
             Hard Constraints
                      │
                      ▼
           Candidate Generation
                      │
                      ▼
            Compatibility Score
                      │
                      ▼
               AI Reasoning
                      │
                      ▼
           Final Recommendation
                      │
                      ▼
               User Feedback
                      │
                      └──────────────► Preference Model
```

This architecture would make recommendations easier to inspect, reproduce, test, and improve.

---

## Purpose

LookCheckAI is developed primarily as:

- an experimental AI application;
- a full-stack engineering project;
- a platform for studying recommendation logic;
- a practical implementation of AI-assisted mobile functionality;
- a portfolio project demonstrating the integration of mobile development, backend engineering, APIs, structured data, and applied AI.

The emphasis is on building and understanding the complete system rather than presenting the current prototype as a finished commercial product.

---

## Disclaimer

LookCheckAI is currently an experimental project.

Recommendations produced by the application are subjective and should not be treated as professional fashion advice.

Features, architecture, APIs, database structures, and user interfaces may change during development.

---

## License

All rights reserved.

The source code is publicly available for demonstration and portfolio purposes.

Unless explicitly stated otherwise, permission is not granted to copy, modify, distribute, sublicense, or reuse the source code or associated project materials.

See [`LICENSE`](LICENSE) for additional information.
