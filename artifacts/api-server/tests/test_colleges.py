"""The shared college list: search, adding a missing college, and keeping users' spelling identical to the list's."""

import importlib.util
from pathlib import Path

from sqlalchemy import func, select

from app.core.colleges import name_key
from app.db import SessionLocal
from app.models import College, UserData

from .conftest import new_user

SEED_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "seed_colleges.py"


def _me(client, user):
    return client.get("/api/auth/me", headers=user["headers"])


async def _search(client, q="", **params):
    resp = await client.get("/api/colleges", params={"q": q, **params})
    assert resp.status_code == 200, resp.text
    return [c["name"] for c in resp.json()]


async def test_seed_script_is_idempotent_and_search_is_public_and_prefix_first(client):
    spec = importlib.util.spec_from_file_location("seed_colleges", SEED_SCRIPT)
    seed = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(seed)
    expected = len({name_key(n) for n in seed.read_names()})

    async with SessionLocal() as db:  # a college a user typed before the list existed
        db.add(UserData(name="Legacy User", email="legacy@example.com", username="legacyuser", password_hash="x", college_name="Legacy  Typed College"))
        await db.commit()

    await seed.main()
    await seed.main()  # second run must add nothing
    async with SessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(College).where(College.source == "seed")) == expected

    assert await _search(client, "legacy typed college") == ["Legacy Typed College"]  # existing users' colleges are listed too

    names = await _search(client, "technology", limit=100)  # no auth header: the signup form uses this too
    assert names and all("technology" in n.lower() for n in names)
    starts = [i for i, n in enumerate(names) if n.lower().startswith("technology")]
    assert starts == list(range(len(starts)))  # names that start with the query come before ones that merely contain it
    assert len(await _search(client, "", limit=7)) == 7
    assert "Delhi Technological University" in await _search(client, "technological delhi")  # words in any order


async def test_a_new_college_typed_in_the_profile_is_listed_once_however_it_is_spelled(client):
    first, second = await new_user(client), await new_user(client)
    await client.patch("/api/auth/me", headers=first["headers"], json={"college_name": "  Test   Institute of Zoology "})
    saved = await client.patch("/api/auth/me", headers=second["headers"], json={"college_name": "TEST institute of ZOOLOGY"})
    assert saved.json()["college_name"] == "Test Institute of Zoology"  # the second user gets the first user's spelling
    assert await _search(client, "institute of zoology") == ["Test Institute of Zoology"]


async def test_junk_names_are_rejected(client):
    user = await new_user(client)
    for junk in ("12", "!!!???", "a b", "1234567", "x" * 181):
        resp = await client.patch("/api/auth/me", headers=user["headers"], json={"college_name": junk})
        assert resp.status_code == 422, junk
    assert await _search(client, "1234567") == []


async def test_profile_college_is_saved_in_the_listed_spelling(client):
    listed = (await client.patch("/api/auth/me", headers=(await new_user(client))["headers"], json={"college_name": "Sample College of Arts"})).json()["college_name"]
    user = await new_user(client)
    patched = await client.patch("/api/auth/me", headers=user["headers"], json={"college_name": "sample  COLLEGE of arts"})
    assert patched.status_code == 200 and patched.json()["college_name"] == listed  # same string => same college leaderboard

    # an unlisted name typed straight into the API still joins the list, so the two can't drift apart
    await client.patch("/api/auth/me", headers=user["headers"], json={"college_name": "Brand New Polytechnic"})
    assert await _search(client, "brand new polytechnic") == ["Brand New Polytechnic"]

    assert (await client.patch("/api/auth/me", headers=user["headers"], json={"college_name": "??"})).status_code == 422
    assert (await _me(client, user)).json()["college_name"] == "Brand New Polytechnic"  # a rejected edit changes nothing


async def test_signup_with_a_college_uses_the_list_too(client):
    resp = await client.post(
        "/api/auth/register",
        json={"name": "Coll Tester", "email": "coll@example.com", "username": "colltester", "password": "Password123", "college_name": "signup  test  university"},
    )
    assert resp.status_code == 201 and resp.json()["user"]["college_name"] == "signup test university"
    assert await _search(client, "signup test university") == ["signup test university"]
