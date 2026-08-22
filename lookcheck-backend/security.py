"""
Abuse and cost protection.

Two concerns live here:

1. Rate limiting. Every AI call costs money (or burns a free-tier quota), so
   unauthenticated and authenticated endpoints alike get a ceiling. The
   counters are in-process: no Redis, no cost, but they reset on restart and
   are per-worker. That is fine at this stage - swap in Redis when you run
   more than one worker.

2. Outbound URL validation. `parse-link` makes the server fetch a URL chosen
   by the user, which is a server-side request forgery hole unless the target
   is checked. `validate_public_url` rejects anything that isn't a public
   http(s) host.
"""

import ipaddress
import socket
import threading
import time
from collections import defaultdict, deque
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

_hits = defaultdict(deque)
_lock = threading.Lock()


class RateLimitExceeded(Exception):
    def __init__(self, retry_after_seconds):
        super().__init__("Rate limit exceeded")
        self.retry_after_seconds = retry_after_seconds


def check_rate_limit(key, limit, window_seconds):
    """Sliding window. Raises RateLimitExceeded when `key` is over budget."""
    now = time.monotonic()
    with _lock:
        bucket = _hits[key]
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()

        if len(bucket) >= limit:
            retry_after = int(window_seconds - (now - bucket[0])) + 1
            raise RateLimitExceeded(retry_after)

        bucket.append(now)

        # Opportunistic cleanup so the dict doesn't grow forever.
        if len(_hits) > 10_000:
            for stale_key in [k for k, v in _hits.items() if not v]:
                del _hits[stale_key]


def reset_rate_limits():
    """Test helper."""
    with _lock:
        _hits.clear()


# ---------------------------------------------------------------------------
# Outbound URL validation (SSRF guard)
# ---------------------------------------------------------------------------

class UnsafeUrlError(ValueError):
    pass


BLOCKED_PORTS = {22, 23, 25, 445, 3306, 5432, 6379, 9200, 11211, 27017}


def _is_public_ip(raw_ip):
    try:
        ip = ipaddress.ip_address(raw_ip)
    except ValueError:
        return False
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def validate_public_url(raw_url):
    """Returns the URL if it points at a public http(s) host, else raises.

    This blocks the classic attacks: localhost, 127.x, 10.x/172.16.x/192.168.x,
    and cloud metadata endpoints such as 169.254.169.254.
    """
    url = (raw_url or "").strip()
    if not url or len(url) > 2000:
        raise UnsafeUrlError("Please provide a valid product URL.")

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeUrlError("Only http and https links are supported.")
    if not parsed.hostname:
        raise UnsafeUrlError("Please provide a valid product URL.")
    if parsed.port and parsed.port in BLOCKED_PORTS:
        raise UnsafeUrlError("That link cannot be opened.")

    try:
        resolved = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror:
        raise UnsafeUrlError("That website could not be reached.")

    addresses = {info[4][0] for info in resolved}
    if not addresses or not all(_is_public_ip(address) for address in addresses):
        raise UnsafeUrlError("That link points at a private address and cannot be opened.")

    return url
