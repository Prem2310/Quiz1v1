"""Google and GitHub sign-in: the authorization-code flow, done server side.

The API redirects the browser to the provider, the provider redirects back to /auth/oauth/{provider}/callback with a
one-time code, and only this module ever sees the client secret or the provider's access token.
"""

from __future__ import annotations

import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
import jwt

from app.core.config import Settings

STATE_TTL = timedelta(minutes=10)
PROVIDER_NAMES = ("google", "github")


class OAuthError(Exception):
    """Sign-in could not be completed. `code` is the short reason the login page understands."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class OAuthProfile:
    provider: str
    account_id: str
    email: str  # always provider-verified
    name: str
    username_hint: str
    picture: str | None


def client_credentials(settings: Settings, provider: str) -> tuple[str, str] | None:
    pairs = {
        "google": (settings.google_client_id, settings.google_client_secret),
        "github": (settings.github_client_id, settings.github_client_secret),
    }
    client_id, client_secret = pairs.get(provider, (None, None))
    return (client_id, client_secret) if client_id and client_secret else None


def enabled_providers(settings: Settings) -> list[str]:
    return [name for name in PROVIDER_NAMES if client_credentials(settings, name)]


def new_nonce() -> str:
    return secrets.token_urlsafe(24)


def make_state(settings: Settings, provider: str, nonce: str) -> str:
    """Signed and short-lived. The nonce is also set as a cookie, so a callback only works in the browser that started it."""
    payload = {"provider": provider, "nonce": nonce, "exp": datetime.now(UTC) + STATE_TTL}
    return jwt.encode(payload, settings.jwt_signing_secret, algorithm=settings.jwt_algorithm)


def check_state(settings: Settings, state: str, provider: str, cookie_nonce: str | None) -> None:
    try:
        payload = jwt.decode(state, settings.jwt_signing_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise OAuthError("oauth_failed") from None
    nonce = payload.get("nonce")
    if payload.get("provider") != provider or not cookie_nonce or not nonce or not secrets.compare_digest(nonce, cookie_nonce):
        raise OAuthError("oauth_failed")


def authorize_url(settings: Settings, provider: str, redirect_uri: str, state: str) -> str:
    client_id, _ = client_credentials(settings, provider) or ("", "")
    if provider == "google":
        base = "https://accounts.google.com/o/oauth2/v2/auth"
        params = {"response_type": "code", "scope": "openid email profile", "prompt": "select_account"}
    else:
        base = "https://github.com/login/oauth/authorize"
        params = {"scope": "read:user user:email"}
    return f"{base}?{urlencode({**params, 'client_id': client_id, 'redirect_uri': redirect_uri, 'state': state})}"


async def fetch_profile(settings: Settings, provider: str, code: str, redirect_uri: str) -> OAuthProfile:
    credentials = client_credentials(settings, provider)
    if credentials is None:
        raise OAuthError("oauth_unavailable")
    client_id, client_secret = credentials
    form = {"code": code, "client_id": client_id, "client_secret": client_secret, "redirect_uri": redirect_uri}
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            if provider == "google":
                return await _google_profile(http, form)
            return await _github_profile(http, form)
    except (httpx.HTTPError, KeyError, ValueError):
        raise OAuthError("oauth_failed") from None


async def _google_profile(http: httpx.AsyncClient, form: dict[str, str]) -> OAuthProfile:
    token = (await http.post("https://oauth2.googleapis.com/token", data={**form, "grant_type": "authorization_code"}))
    token.raise_for_status()
    info = (await http.get("https://openidconnect.googleapis.com/v1/userinfo", headers={"Authorization": f"Bearer {token.json()['access_token']}"}))
    info.raise_for_status()
    data = info.json()
    if not data.get("email") or data.get("email_verified") is not True:
        raise OAuthError("oauth_no_email")
    email = data["email"]
    return OAuthProfile("google", str(data["sub"]), email, data.get("name") or email.split("@")[0], email.split("@")[0], data.get("picture"))


async def _github_profile(http: httpx.AsyncClient, form: dict[str, str]) -> OAuthProfile:
    token = await http.post("https://github.com/login/oauth/access_token", data=form, headers={"Accept": "application/json"})
    token.raise_for_status()
    access_token = token.json().get("access_token")
    if not access_token:  # GitHub answers 200 with {"error": ...} for a bad or reused code
        raise OAuthError("oauth_failed")
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"}
    user = await http.get("https://api.github.com/user", headers=headers)
    user.raise_for_status()
    emails = await http.get("https://api.github.com/user/emails", headers=headers)
    emails.raise_for_status()
    # The public profile email is unverified and often empty, so only trust a verified address from /user/emails.
    verified = [e for e in emails.json() if e.get("verified") and e.get("email")]
    chosen = next((e for e in verified if e.get("primary")), verified[0] if verified else None)
    if chosen is None:
        raise OAuthError("oauth_no_email")
    data = user.json()
    login = data["login"]
    return OAuthProfile("github", str(data["id"]), chosen["email"], data.get("name") or login, login, data.get("avatar_url"))


def username_candidates(hint: str):
    """Yield valid usernames (3-40 chars, letters/digits/underscore) starting from the provider's handle."""
    base = re.sub(r"[^a-zA-Z0-9_]", "", hint)[:30] or "player"
    if len(base) < 3:
        base = f"{base}_player"[:30]
    yield base
    while True:
        yield f"{base}{secrets.randbelow(9000) + 1000}"
