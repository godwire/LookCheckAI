"""
Lists the Gemini models your API key can actually use.

Google renames and retires model names regularly, so a hard-coded name that
worked last month can start returning 404. Run this to see what is available
right now, then put a working name in GEMINI_MODEL in your .env file.

Usage:
    python list_gemini_models.py
"""

import sys

import requests

import config

if not config.GEMINI_API_KEY:
    print("GEMINI_API_KEY is not set in .env - nothing to check.")
    sys.exit(1)

response = requests.get(
    "https://generativelanguage.googleapis.com/v1beta/models",
    headers={"x-goog-api-key": config.GEMINI_API_KEY},
    timeout=30,
)

if response.status_code != 200:
    print(f"Request failed ({response.status_code}):\n{response.text[:800]}")
    sys.exit(1)

models = response.json().get("models", [])
usable = [
    model for model in models
    if "generateContent" in model.get("supportedGenerationMethods", [])
]

if not usable:
    print("No models supporting generateContent are available for this key.")
    print("The Generative Language API may not be enabled for this project.")
    sys.exit(1)

print(f"\nCurrently configured: GEMINI_MODEL={config.GEMINI_MODEL}")
print(f"\n{len(usable)} model(s) support generateContent:\n")

for model in usable:
    name = model["name"].replace("models/", "")
    marker = "  <-- currently configured" if name == config.GEMINI_MODEL else ""
    print(f"  {name}{marker}")
    print(f"      {model.get('displayName', '')}")

# A "flash" model is the right default here: fast, cheap, vision-capable.
preferred = [m["name"].replace("models/", "") for m in usable if "flash" in m["name"]]
recommendation = preferred[0] if preferred else usable[0]["name"].replace("models/", "")

print(f"\nSuggested for LookCheck AI:\n\n    GEMINI_MODEL={recommendation}\n")
print("Put that line in your .env file, then restart the server.\n")