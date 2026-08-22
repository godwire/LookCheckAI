"""
Weather lookup.

Default provider is Open-Meteo: no API key, no account, free for
non-commercial use. OpenWeatherMap is kept as an alternative for when an
API key is available (set WEATHER_PROVIDER=openweather).

Results are cached in-process for WEATHER_CACHE_TTL_SECONDS, keyed on
coordinates rounded to ~1km. Without this, every outfit request hit the
weather API again for a value that barely changes.
"""

import threading
import time

import requests

import config

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"

# WMO weather interpretation codes used by Open-Meteo.
WMO_CODES = {
    0: ("Clear", "clear sky"),
    1: ("Clear", "mainly clear"),
    2: ("Clouds", "partly cloudy"),
    3: ("Clouds", "overcast"),
    45: ("Mist", "fog"),
    48: ("Mist", "depositing rime fog"),
    51: ("Drizzle", "light drizzle"),
    53: ("Drizzle", "moderate drizzle"),
    55: ("Drizzle", "dense drizzle"),
    56: ("Drizzle", "light freezing drizzle"),
    57: ("Drizzle", "dense freezing drizzle"),
    61: ("Rain", "slight rain"),
    63: ("Rain", "moderate rain"),
    65: ("Rain", "heavy rain"),
    66: ("Rain", "light freezing rain"),
    67: ("Rain", "heavy freezing rain"),
    71: ("Snow", "slight snowfall"),
    73: ("Snow", "moderate snowfall"),
    75: ("Snow", "heavy snowfall"),
    77: ("Snow", "snow grains"),
    80: ("Rain", "slight rain showers"),
    81: ("Rain", "moderate rain showers"),
    82: ("Rain", "violent rain showers"),
    85: ("Snow", "slight snow showers"),
    86: ("Snow", "heavy snow showers"),
    95: ("Thunderstorm", "thunderstorm"),
    96: ("Thunderstorm", "thunderstorm with slight hail"),
    99: ("Thunderstorm", "thunderstorm with heavy hail"),
}

WET_CONDITIONS = ("Rain", "Drizzle", "Thunderstorm", "Snow")

_cache = {}
_cache_lock = threading.Lock()


class WeatherServiceError(Exception):
    pass


def _cache_key(lat, lon):
    return (round(float(lat), 2), round(float(lon), 2))


def _cache_get(key):
    with _cache_lock:
        entry = _cache.get(key)
        if not entry:
            return None
        cached_at, value = entry
        if time.monotonic() - cached_at > config.WEATHER_CACHE_TTL_SECONDS:
            _cache.pop(key, None)
            return None
        return dict(value)


def _cache_put(key, value):
    with _cache_lock:
        if len(_cache) > 5000:
            _cache.clear()
        _cache[key] = (time.monotonic(), dict(value))


def get_current_weather(lat, lon):
    """
    Compact weather summary consumed by the recommendation engine:
    {
        "temp_c": 18.4,
        "feels_like_c": 17.1,
        "condition": "Rain",
        "description": "light rain",
        "rain_probability": True,
        "wind_speed_ms": 4.2,
        "city_name": "Kosice",
        "provider": "open-meteo",
    }
    """
    key = _cache_key(lat, lon)
    cached = _cache_get(key)
    if cached:
        cached["cached"] = True
        return cached

    if config.WEATHER_PROVIDER == "openweather":
        weather = _fetch_openweather(lat, lon)
    else:
        weather = _fetch_open_meteo(lat, lon)

    _cache_put(key, weather)
    return weather


def _fetch_open_meteo(lat, lon):
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": ",".join([
            "temperature_2m",
            "apparent_temperature",
            "precipitation",
            "weather_code",
            "wind_speed_10m",
        ]),
        "wind_speed_unit": "ms",
        "timezone": "auto",
    }

    try:
        response = requests.get(OPEN_METEO_URL, params=params, timeout=config.WEATHER_TIMEOUT)
    except requests.RequestException as exc:
        raise WeatherServiceError(f"Weather lookup failed: {exc}")

    if response.status_code != 200:
        raise WeatherServiceError(f"Open-Meteo request failed ({response.status_code})")

    try:
        current = response.json()["current"]
    except (ValueError, KeyError) as exc:
        raise WeatherServiceError(f"Unexpected Open-Meteo response: {exc}")

    code = int(current.get("weather_code", 0))
    condition, description = WMO_CODES.get(code, ("Clouds", "unknown conditions"))

    return {
        "temp_c": round(float(current.get("temperature_2m", 0)), 1),
        "feels_like_c": round(float(current.get("apparent_temperature", 0)), 1),
        "condition": condition,
        "description": description,
        "rain_probability": condition in WET_CONDITIONS
        or float(current.get("precipitation", 0) or 0) > 0,
        "wind_speed_ms": round(float(current.get("wind_speed_10m", 0) or 0), 1),
        "city_name": None,
        "provider": "open-meteo",
    }


def _fetch_openweather(lat, lon):
    if not config.OPENWEATHER_API_KEY:
        raise WeatherServiceError("OPENWEATHER_API_KEY is not set.")

    params = {
        "lat": lat,
        "lon": lon,
        "appid": config.OPENWEATHER_API_KEY,
        "units": "metric",
    }

    try:
        response = requests.get(OPENWEATHER_URL, params=params, timeout=config.WEATHER_TIMEOUT)
    except requests.RequestException as exc:
        raise WeatherServiceError(f"Weather lookup failed: {exc}")

    if response.status_code != 200:
        raise WeatherServiceError(f"OpenWeatherMap request failed ({response.status_code})")

    data = response.json()
    weather = data["weather"][0]
    main = data["main"]

    return {
        "temp_c": round(float(main["temp"]), 1),
        "feels_like_c": round(float(main["feels_like"]), 1),
        "condition": weather["main"],
        "description": weather["description"],
        "rain_probability": weather["main"] in WET_CONDITIONS or bool(data.get("rain")),
        "wind_speed_ms": round(float(data.get("wind", {}).get("speed", 0)), 1),
        "city_name": data.get("name"),
        "provider": "openweather",
    }


def mock_weather(condition="Clouds", temp_c=15.0):
    """Deterministic fallback so the app always has a weather context."""
    return {
        "temp_c": temp_c,
        "feels_like_c": temp_c - 1.5,
        "condition": condition,
        "description": condition.lower(),
        "rain_probability": condition in WET_CONDITIONS,
        "wind_speed_ms": 3.0,
        "city_name": None,
        "provider": "mock",
    }


def get_weather_or_mock(lat, lon):
    """Never raises - the outfit pipeline must not fail because of weather."""
    if lat is None or lon is None:
        return mock_weather()
    try:
        return get_current_weather(lat, lon)
    except WeatherServiceError:
        return mock_weather()
