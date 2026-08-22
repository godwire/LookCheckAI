"""
Authentication for LookCheck AI.

Deliberately dependency-light and free to run: passwords are hashed with
PBKDF2-HMAC-SHA256 from the standard library, and sessions are stateless
JWT access tokens (PyJWT). No third-party identity provider, no per-user cost.

Password hash format:
    pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
"""

import base64
import hashlib
import hmac
import os
import re
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import g, jsonify, request

import config
import database

PBKDF2_ITERATIONS = 240_000
SALT_BYTES = 16

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


class AuthError(Exception):
    def __init__(self, message, status=401):
        super().__init__(message)
        self.message = message
        self.status = status


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------

def hash_password(password):
    salt = os.urandom(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password, stored):
    try:
        algorithm, iterations, salt_hex, hash_hex = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
    except (ValueError, AttributeError):
        return False
    return hmac.compare_digest(digest.hex(), hash_hex)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_email(email):
    email = (email or "").strip()
    if not EMAIL_PATTERN.match(email) or len(email) > 254:
        raise AuthError("Please enter a valid email address.", 400)
    return email


def validate_password(password):
    password = password or ""
    if len(password) < config.MIN_PASSWORD_LENGTH:
        raise AuthError(
            f"Password must be at least {config.MIN_PASSWORD_LENGTH} characters long.", 400
        )
    if len(password) > 200:
        raise AuthError("Password is too long.", 400)
    return password


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------

def create_access_token(user_id):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=config.JWT_EXPIRY_DAYS)).timestamp()),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


def decode_access_token(token):
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise AuthError("Your session has expired. Please sign in again.")
    except jwt.InvalidTokenError:
        raise AuthError("Invalid authentication token.")

    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise AuthError("Invalid authentication token.")


def _token_from_request():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise AuthError("Authentication required.")
    token = header[7:].strip()
    if not token:
        raise AuthError("Authentication required.")
    return token


def require_auth(view):
    """Loads the authenticated user into `g.user` / `g.user_id`.

    Every user-scoped route uses this instead of trusting a user id from the
    URL, which is what made the previous version readable by anyone.
    """

    @wraps(view)
    def wrapper(*args, **kwargs):
        try:
            user_id = decode_access_token(_token_from_request())
        except AuthError as exc:
            return jsonify({"error": exc.message}), exc.status

        user = database.get_user(user_id)
        if not user:
            return jsonify({"error": "Account no longer exists."}), 401

        g.user_id = user_id
        g.user = user
        return view(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------------------
# Registration / login flows
# ---------------------------------------------------------------------------

def register(email, password, name, style_preference="Casual",
             city=None, lat=None, lon=None):
    email = validate_email(email)
    validate_password(password)

    name = (name or "").strip()
    if not name:
        raise AuthError("Please tell us what to call you.", 400)
    if len(name) > 80:
        raise AuthError("That name is too long.", 400)

    if database.email_exists(email):
        raise AuthError("An account with this email already exists.", 409)

    user_id = database.create_user(
        email=email,
        password_hash=hash_password(password),
        name=name,
        style_preference=style_preference or "Casual",
        city=city,
        lat=lat,
        lon=lon,
    )
    return database.get_user(user_id), create_access_token(user_id)


def login(email, password):
    record = database.get_user_auth_record(email)

    # Always run a hash comparison so a missing account and a wrong password
    # take the same amount of time.
    stored = record["password_hash"] if record else hash_password("dummy-password")
    valid = verify_password(password or "", stored)

    if not record or not valid:
        raise AuthError("Incorrect email or password.")

    return database.get_user(record["id"]), create_access_token(record["id"])
