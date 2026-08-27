"""
Turning whatever the user pasted into a URL worth fetching.

A link shared from a shopping app is rarely a plain address. It arrives
wrapped in a sentence, as a shortener that has to be followed, as an Android
`intent://` deep link, or trailing a tail of campaign parameters. All four are
handled here, before the page is ever fetched.

The security point that is easy to miss: following redirects safely means
checking *every* hop, not just the address the user typed. A shortener on a
perfectly respectable domain can redirect to 169.254.169.254, and a check that
only looked at the first URL would wave it through. Each `Location` is
validated as if the user had pasted it themselves.
"""

import re
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import requests

import config
import security

# A URL sitting inside a sentence. Trailing punctuation is trimmed afterwards.
URL_PATTERN = re.compile(r"""(?:https?://|www\.)[^\s<>"']+""", re.IGNORECASE)

# A bare domain with a path: "wb.ru/catalog/12345" - no scheme, no www.
BARE_DOMAIN_PATTERN = re.compile(
    r"""(?<![\w.@-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,})(/[^\s<>"']*)?""",
    re.IGNORECASE,
)

# Any custom app scheme: "someapp://..." but not http(s).
CUSTOM_SCHEME_PATTERN = re.compile(r"\b(?!https?\b)[a-z][a-z0-9+.-]{1,20}://", re.IGNORECASE)

# Android intent links: intent://host/path#Intent;scheme=https;...;end
INTENT_PATTERN = re.compile(r"^intent://(?P<rest>[^#]*)#Intent;(?P<params>.*)$", re.IGNORECASE)

# Shopping apps that share their own scheme. The web host is what we want.
APP_SCHEME_HOSTS = {
    "wbapp": "www.wildberries.ru",
    "wb": "www.wildberries.ru",
    "ozon": "www.ozon.ru",
    "aliexpress": "www.aliexpress.com",
    "zalando": "www.zalando.com",
    "asos": "www.asos.com",
    "vinted": "www.vinted.com",
}

# Campaign and session noise. Stripped so the same product does not look like
# a different link every time it is shared.
TRACKING_PARAMS = {
    "fbclid", "gclid", "gclsrc", "dclid", "yclid", "msclkid", "twclid",
    "igshid", "mc_cid", "mc_eid", "_openstat", "spm", "scm", "ref", "ref_",
    "referrer", "referer", "source", "utm_nooverride", "algo_pvid",
    "algo_exp_id", "pdp_ext_f", "sk", "aff_platform", "aff_trace_key",
    "cm_mmc", "cm_sp", "ICID", "icid", "trk", "trkCampaign",
}
TRACKING_PREFIXES = ("utm_", "pk_", "at_", "ito_", "cmp_", "_ga")

MAX_REDIRECTS = 6
MAX_INPUT_LENGTH = 4000


class LinkError(ValueError):
    """Raised with a message intended for the user."""


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

def _trim_punctuation(url):
    """Sentences end; URLs usually don't. Drop trailing punctuation, but keep
    balanced brackets that are genuinely part of the path."""
    while url and url[-1] in ".,;:!?\"'»)":
        if url[-1] == ")" and url.count("(") >= url.count(")"):
            break
        url = url[:-1]
    return url


def extract_url(text):
    """Pulls the first plausible URL out of arbitrary shared text."""
    if not text:
        raise LinkError("Paste a link to a product page.")

    text = str(text).strip()
    if len(text) > MAX_INPUT_LENGTH:
        raise LinkError("That text is too long to read as a link.")

    # Deep links win: they are unambiguous and would confuse the other patterns.
    lowered = text.lower()
    for scheme in list(APP_SCHEME_HOSTS) + ["intent"]:
        marker = f"{scheme}://"
        if marker in lowered:
            start = lowered.index(marker)
            return _trim_punctuation(text[start:].split()[0])

    match = URL_PATTERN.search(text)
    if match:
        found = _trim_punctuation(match.group(0))
        return found if found.lower().startswith("http") else f"https://{found}"

    match = BARE_DOMAIN_PATTERN.search(text)
    if match:
        return "https://" + _trim_punctuation(match.group(0))

    # A scheme we do not recognise: say so, rather than claiming there was no
    # link at all - the user can see perfectly well that they pasted one.
    if CUSTOM_SCHEME_PATTERN.search(text):
        raise LinkError(
            "That link only opens in the shop's own app. Open the product in a browser "
            "and copy the address from there."
        )

    raise LinkError("No link found in that text. Paste the address of a product page.")


# ---------------------------------------------------------------------------
# Deep links
# ---------------------------------------------------------------------------

def expand_deep_link(url):
    """Converts an app link into the web address of the same product."""
    intent = INTENT_PATTERN.match(url)
    if intent:
        params = dict(
            part.split("=", 1)
            for part in intent.group("params").split(";")
            if "=" in part
        )
        scheme = params.get("scheme", "https")
        rest = intent.group("rest")
        if scheme in ("http", "https"):
            return f"{scheme}://{rest}"
        # An intent wrapping a custom scheme: unwrap once more.
        return expand_deep_link(f"{scheme}://{rest}")

    parsed = urlparse(url)
    if parsed.scheme in ("http", "https", ""):
        return url

    host = APP_SCHEME_HOSTS.get(parsed.scheme.lower())
    if not host:
        raise LinkError(
            "That link only opens in the shop's own app. Open the product in a browser "
            "and copy the address from there."
        )

    # wbapp://catalog/12345/detail.aspx -> https://www.wildberries.ru/catalog/12345/...
    path = f"/{parsed.netloc}{parsed.path}".replace("//", "/")
    rebuilt = urlunparse(("https", host, path, "", parsed.query, ""))
    return rebuilt


# ---------------------------------------------------------------------------
# Redirects
# ---------------------------------------------------------------------------

def resolve_redirects(url, max_hops=MAX_REDIRECTS):
    """Follows redirects one hop at a time, validating each destination.

    Redirects are followed manually rather than with `allow_redirects=True`
    precisely so that every intermediate address goes through the same
    private-address check as the one the user typed.
    """
    current = security.validate_public_url(url)
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; LookCheckAI/1.0)",
        "Accept-Language": "en;q=0.9",
    }

    for _hop in range(max_hops):
        try:
            response = requests.head(
                current, headers=headers, allow_redirects=False,
                timeout=config.PAGE_FETCH_TIMEOUT,
            )
            # Plenty of servers refuse HEAD; fall back to a GET we abandon.
            if response.status_code in (400, 403, 405, 501):
                response = requests.get(
                    current, headers=headers, allow_redirects=False,
                    timeout=config.PAGE_FETCH_TIMEOUT, stream=True,
                )
                response.close()
        except requests.RequestException:
            # The shop may dislike being probed. The page fetch itself will
            # report a real failure, so hand back what we have.
            return current

        if response.status_code not in (301, 302, 303, 307, 308):
            return current

        location = response.headers.get("Location")
        if not location:
            return current

        current = security.validate_public_url(requests.compat.urljoin(current, location))

    return current


# ---------------------------------------------------------------------------
# Cleaning
# ---------------------------------------------------------------------------

def _is_tracking(key):
    lowered = key.lower()
    return lowered in TRACKING_PARAMS or lowered.startswith(TRACKING_PREFIXES)


def strip_tracking(url):
    """Removes campaign parameters, keeping everything the page needs.

    Only known-tracking keys go: product identifiers frequently live in the
    query string, so a blanket strip would break the link it was cleaning.
    """
    parsed = urlparse(url)
    if not parsed.query:
        return urlunparse(parsed._replace(fragment=""))

    kept = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)
            if not _is_tracking(k)]
    return urlunparse(parsed._replace(query=urlencode(kept), fragment=""))


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def prepare(raw_text, follow_redirects=True):
    """Full pipeline. Returns (url, steps) where steps records what changed,
    so the log shows why a pasted string became the address we fetched."""
    steps = {}

    extracted = extract_url(raw_text)
    steps["extracted"] = extracted

    expanded = expand_deep_link(extracted)
    if expanded != extracted:
        steps["expanded"] = expanded

    resolved = resolve_redirects(expanded) if follow_redirects else \
        security.validate_public_url(expanded)
    if resolved != expanded:
        steps["resolved"] = resolved

    cleaned = strip_tracking(resolved)
    if cleaned != resolved:
        steps["cleaned"] = cleaned

    return cleaned, steps
