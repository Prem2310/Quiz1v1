"""Google/GitHub sign-in with the provider's network calls stubbed out (no real credentials, no network)."""

from urllib.parse import parse_qs, urlparse

import pytest

from app.core import oauth
from app.core.config import get_settings

from .conftest import new_user


@pytest.fixture
def providers(monkeypatch):
    settings = get_settings()
    for key in ("google_client_id", "google_client_secret", "github_client_id", "github_client_secret"):
        monkeypatch.setattr(settings, key, "test-value")
    monkeypatch.setattr(settings, "frontend_url", "https://web.test")


@pytest.fixture(autouse=True)
def _clean_cookies(client):
    yield
    client.cookies.clear()  # the callback sets the auth cookie; it must not leak into other tests


def stub_profile(monkeypatch, **overrides):
    profile = oauth.OAuthProfile(**{"provider": "google", "account_id": "g-1", "email": "new@example.com", "name": "New Person", "username_hint": "new.person", "picture": None, **overrides})

    async def fake(settings, provider, code, redirect_uri):
        return profile

    monkeypatch.setattr(oauth, "fetch_profile", fake)


async def sign_in(client, provider="google"):
    """Runs start -> callback the way a browser would and returns the callback's redirect."""
    start = await client.get(f"/api/auth/oauth/{provider}/start", follow_redirects=False)
    assert start.status_code == 302
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    return await client.get(f"/api/auth/oauth/{provider}/callback", params={"code": "abc", "state": state}, follow_redirects=False)


def token_from(response) -> str:
    return parse_qs(urlparse(response.headers["location"]).fragment)["token"][0]


async def test_providers_lists_only_configured_ones(client, monkeypatch):
    settings = get_settings()
    for key in ("google_client_id", "google_client_secret", "github_client_id", "github_client_secret"):
        monkeypatch.setattr(settings, key, None)
    assert (await client.get("/api/auth/providers")).json() == {"providers": []}
    monkeypatch.setattr(settings, "github_client_id", "id")
    monkeypatch.setattr(settings, "github_client_secret", "secret")
    assert (await client.get("/api/auth/providers")).json() == {"providers": ["github"]}


async def test_unconfigured_provider_goes_back_to_login(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "google_client_id", None)
    resp = await client.get("/api/auth/oauth/google/start", follow_redirects=False)
    assert resp.status_code == 302 and "error=oauth_unavailable" in resp.headers["location"]


async def test_new_user_is_created_without_a_password(client, providers, monkeypatch):
    stub_profile(monkeypatch)
    resp = await sign_in(client)
    assert resp.headers["location"].startswith("https://web.test/auth/callback#token=")
    me = (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_from(resp)}"})).json()
    assert me["email"] == "new@example.com" and me["username"] == "newperson" and me["name"] == "New Person"
    # no password to guess: password login for this account is refused, not a crash
    login = await client.post("/api/auth/login", json={"email_or_username": "new@example.com", "password": "anything"})
    assert login.status_code == 401


async def test_same_provider_account_signs_into_the_same_user(client, providers, monkeypatch):
    stub_profile(monkeypatch, account_id="g-repeat", email="repeat@example.com", username_hint="repeat")
    first = (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_from(await sign_in(client))}"})).json()
    second = (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_from(await sign_in(client))}"})).json()
    assert first["id"] == second["id"]


async def test_verified_email_links_to_the_existing_password_account(client, providers, monkeypatch):
    existing = await new_user(client)
    email = (await client.get("/api/auth/me", headers=existing["headers"])).json()["email"]
    stub_profile(monkeypatch, provider="github", account_id="gh-9", email=email, username_hint="someone")
    resp = await sign_in(client, "github")
    me = (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_from(resp)}"})).json()
    assert me["id"] == existing["id"]  # linked, not a 409 and not a duplicate
    # the password still works: linking adds a way in, it doesn't remove one
    assert (await client.post("/api/auth/login", json={"email_or_username": email, "password": "Password123"})).status_code == 200


async def test_username_collision_gets_a_suffix(client, providers, monkeypatch):
    await new_user(client)  # takes "user<N>"; ask for the same handle
    taken = (await client.get("/api/auth/me", headers=(await new_user(client))["headers"])).json()["username"]
    stub_profile(monkeypatch, account_id="g-collide", email="collide@example.com", username_hint=taken)
    me = (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_from(await sign_in(client))}"})).json()
    assert me["username"] != taken and me["username"].startswith(taken)


async def test_callback_rejects_a_missing_or_foreign_state(client, providers, monkeypatch):
    stub_profile(monkeypatch)
    forged = oauth.make_state(get_settings(), "google", "not-the-cookie-nonce")
    await client.get("/api/auth/oauth/google/start", follow_redirects=False)  # sets the real nonce cookie
    resp = await client.get("/api/auth/oauth/google/callback", params={"code": "abc", "state": forged}, follow_redirects=False)
    assert "error=oauth_failed" in resp.headers["location"] and "token" not in resp.headers["location"]
    no_cookie = await client.get("/api/auth/oauth/google/callback", params={"code": "abc", "state": forged}, headers={"Cookie": ""}, follow_redirects=False)
    assert "error=oauth_failed" in no_cookie.headers["location"]


async def test_user_cancelling_at_the_provider_is_reported(client, providers):
    resp = await client.get("/api/auth/oauth/google/callback", params={"error": "access_denied"}, follow_redirects=False)
    assert "error=oauth_denied" in resp.headers["location"]
