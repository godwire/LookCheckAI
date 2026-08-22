"""
End-to-end smoke test for a RUNNING LookCheck AI backend.

Usage:
    1. Start the server in one terminal:   python app.py
    2. Run this in a second terminal:      python smoke_test.py

It registers a throwaway account, seeds a small wardrobe, generates an outfit,
checks the security rules, then deletes the account so nothing is left behind.

Every line should print OK. Anything else points at the problem directly.
"""

import sys
import time

import requests

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
EMAIL = f"smoketest+{int(time.time())}@example.com"
PASSWORD = "smoketest-password-1"

passed, failed = 0, 0


def check(label, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  OK    {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}  {detail}")


def main():
    print(f"\nTesting {BASE_URL}\n")

    # --- server alive -------------------------------------------------------
    print("Server")
    try:
        health = requests.get(f"{BASE_URL}/api/health", timeout=10)
    except requests.RequestException as exc:
        print(f"  FAIL  cannot reach the server: {exc}")
        print("\n  Is it running? Start it with: python app.py\n")
        sys.exit(1)

    check("health endpoint responds", health.status_code == 200, health.text[:120])
    info = health.json()
    print(f"        env={info.get('env')}  db={info.get('database')}  "
          f"ai={info.get('ai_provider')}  weather={info.get('weather_provider')}")

    # --- auth ---------------------------------------------------------------
    print("\nAuthentication")
    anon = requests.get(f"{BASE_URL}/api/wardrobe", timeout=10)
    check("wardrobe is protected without a token", anon.status_code == 401)

    weak = requests.post(f"{BASE_URL}/api/auth/register",
                         json={"email": EMAIL, "password": "123", "name": "Test"}, timeout=10)
    check("short passwords are rejected", weak.status_code == 400)

    registered = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": EMAIL, "password": PASSWORD, "name": "Smoke Test",
        "style_preference": "Minimalist", "city": "Kosice", "lat": 48.72, "lon": 21.25,
    }, timeout=15)
    check("register works", registered.status_code == 201, registered.text[:160])
    if registered.status_code != 201:
        sys.exit(1)

    token = registered.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    duplicate = requests.post(f"{BASE_URL}/api/auth/register",
                              json={"email": EMAIL.upper(), "password": PASSWORD, "name": "X"},
                              timeout=10)
    check("duplicate email is rejected", duplicate.status_code == 409)

    wrong = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": EMAIL, "password": "wrong-password"}, timeout=10)
    check("wrong password is rejected", wrong.status_code == 401)

    good = requests.post(f"{BASE_URL}/api/auth/login",
                         json={"email": EMAIL, "password": PASSWORD}, timeout=10)
    check("login works", good.status_code == 200, good.text[:120])

    check("bad token is rejected",
          requests.get(f"{BASE_URL}/api/auth/me",
                       headers={"Authorization": "Bearer nonsense"},
                       timeout=10).status_code == 401)

    # --- wardrobe -----------------------------------------------------------
    print("\nWardrobe")
    items = [
        {"category": "top", "color": "White", "style": "Minimalist",
         "warmth_level": 2, "description": "Plain white t-shirt"},
        {"category": "bottom", "color": "Navy", "style": "Minimalist",
         "warmth_level": 3, "description": "Dark straight jeans"},
        {"category": "footwear", "color": "White", "style": "Casual",
         "warmth_level": 2, "description": "Leather sneakers"},
        {"category": "outerwear", "color": "Black", "style": "Minimalist",
         "warmth_level": 5, "description": "Heavy wool coat"},
    ]
    created = [requests.post(f"{BASE_URL}/api/wardrobe", json=item,
                             headers=headers, timeout=10) for item in items]
    check("items can be added", all(r.status_code == 201 for r in created),
          str([r.status_code for r in created]))

    bad = requests.post(f"{BASE_URL}/api/wardrobe",
                        json={"category": "spaceship", "color": "Red",
                              "style": "Casual", "warmth_level": 99},
                        headers=headers, timeout=10)
    check("invalid category is rejected", bad.status_code == 400)

    wardrobe = requests.get(f"{BASE_URL}/api/wardrobe", headers=headers, timeout=10).json()
    check("wardrobe returns 4 items", len(wardrobe) == 4, f"got {len(wardrobe)}")

    # --- outfits ------------------------------------------------------------
    print("\nOutfits")
    first = requests.get(f"{BASE_URL}/api/outfit/today", headers=headers, timeout=60)
    check("today's outfit is generated", first.status_code == 200, first.text[:200])
    if first.status_code != 200:
        sys.exit(1)

    outfit = first.json()
    check("outfit contains items", len(outfit["items"]) > 0)
    check("outfit has an explanation", bool(outfit.get("reasoning")))
    print(f"        picked: {', '.join(i['description'] or i['category'] for i in outfit['items'])}")
    print(f"        why:    {outfit.get('reasoning')}")
    print(f"        source: {outfit.get('generated_by')}")

    second = requests.get(f"{BASE_URL}/api/outfit/today", headers=headers, timeout=30).json()
    check("re-opening returns the cached outfit (no extra AI call)",
          second["outfit_id"] == outfit["outfit_id"])

    regenerated = requests.post(f"{BASE_URL}/api/outfit/today", headers=headers, timeout=60)
    check("explicit regeneration creates a new outfit",
          regenerated.status_code == 200
          and regenerated.json()["outfit_id"] != outfit["outfit_id"])

    events = requests.get(f"{BASE_URL}/api/events", headers=headers, timeout=10).json()
    check("events are seeded", len(events) >= 5, f"got {len(events)}")

    work = requests.post(f"{BASE_URL}/api/outfit/event",
                         json={"event_name": "Work"}, headers=headers, timeout=60)
    check("event outfit works", work.status_code == 200, work.text[:160])

    check("unknown event is rejected",
          requests.post(f"{BASE_URL}/api/outfit/event", json={"event_name": "Wedding"},
                        headers=headers, timeout=10).status_code == 400)

    check("feedback is accepted",
          requests.post(f"{BASE_URL}/api/outfits/{outfit['outfit_id']}/feedback",
                        json={"rating": "like"}, headers=headers, timeout=10).status_code == 200)

    history = requests.get(f"{BASE_URL}/api/outfits/history", headers=headers, timeout=15)
    check("history returns past outfits",
          history.status_code == 200 and len(history.json()) >= 2)

    # --- security -----------------------------------------------------------
    print("\nSecurity")
    for label, url in [
        ("localhost is blocked", "http://127.0.0.1:8000/api/health"),
        ("cloud metadata is blocked", "http://169.254.169.254/latest/meta-data/"),
        ("private network is blocked", "http://192.168.1.1/"),
        ("non-http scheme is blocked", "file:///etc/passwd"),
    ]:
        response = requests.post(f"{BASE_URL}/api/wardrobe/parse-link",
                                 json={"url": url}, headers=headers, timeout=20)
        check(label, response.status_code == 400, f"got {response.status_code}")

    # --- cleanup ------------------------------------------------------------
    print("\nAccount deletion")
    deleted = requests.delete(f"{BASE_URL}/api/auth/me", headers=headers, timeout=15)
    check("account can be deleted in-app", deleted.status_code == 204)
    check("token stops working after deletion",
          requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=10).status_code == 401)

    print(f"\n{passed} passed, {failed} failed\n")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
