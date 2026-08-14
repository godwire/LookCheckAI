"""
Weather lookup via the OpenWeatherMap "Current Weather" API.

We call the REST endpoint directly with `requests` instead of pulling in an
SDK - one less dependency, and it keeps the integration transparent.

Requires the OPENWEATHER_API_KEY environment variable. Get a free key at
https://openweathermap.org/api
"""

import os
import requests

OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY")
BASE_URL = "https://api.openweathermap.org/data/2.5/weather"


class WeatherServiceError(Exception):
    pass


def get_current_weather(lat, lon):
    """
    Returns a compact weather summary used by the outfit recommendation engine:
    {
        "temp_c": 18.4,
        "feels_like_c": 17.1,
        "condition": "Rain",          # e.g. Clear, Clouds, Rain, Snow
        "description": "light rain",
        "rain_probability": True,     # heuristic based on condition/current rain volume
        "wind_speed_ms": 4.2,
    }
    """
    if not OPENWEATHER_API_KEY:
        raise WeatherServiceError(
            "OPENWEATHER_API_KEY is not set. Add it to your .env file "
            "(see .env.example) to enable live weather lookups."
        )

    params = {
        "lat": lat,
        "lon": lon,
        "appid": OPENWEATHER_API_KEY,
        "units": "metric",
    }

    response = requests.get(BASE_URL, params=params, timeout=10)
    if response.status_code != 200:
        raise WeatherServiceError(
            f"OpenWeatherMap request failed ({response.status_code}): {response.text}"
        )

    data = response.json()
    weather = data["weather"][0]
    main = data["main"]
    wind = data.get("wind", {})
    rain = data.get("rain", {})

    return {
        "temp_c": main["temp"],
        "feels_like_c": main["feels_like"],
        "condition": weather["main"],
        "description": weather["description"],
        "rain_probability": weather["main"] in ("Rain", "Drizzle", "Thunderstorm") or bool(rain),
        "wind_speed_ms": wind.get("speed", 0),
        "city_name": data.get("name"),
    }


def mock_weather(condition="Clouds", temp_c=15.0):
    """Deterministic mock used for local demos / tests without an API key."""
    return {
        "temp_c": temp_c,
        "feels_like_c": temp_c - 1.5,
        "condition": condition,
        "description": condition.lower(),
        "rain_probability": condition in ("Rain", "Drizzle", "Thunderstorm"),
        "wind_speed_ms": 3.0,
        "city_name": "Demo City",
    }
