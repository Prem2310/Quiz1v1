from .conftest import new_user


async def _username(client, user) -> str:
    return (await client.get("/api/auth/me", headers=user["headers"])).json()["username"]


async def test_public_profile_reflects_friend_status_transitions(client):
    a, b = await new_user(client), await new_user(client)
    b_username = await _username(client, b)

    resp = await client.get(f"/api/users/{b_username}", headers=a["headers"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["user_id"] == b["id"]
    assert body["friend_status"] == "none"
    assert body["rank"] >= 1

    await client.post(f"/api/friends/requests/{b_username}", headers=a["headers"])
    outgoing = (await client.get(f"/api/users/{b_username}", headers=a["headers"])).json()
    assert outgoing["friend_status"] == "pending_outgoing"
    a_username = await _username(client, a)
    incoming = (await client.get(f"/api/users/{a_username}", headers=b["headers"])).json()
    assert incoming["friend_status"] == "pending_incoming"


async def test_public_profile_of_self_reports_self_and_missing_user_is_404(client):
    a = await new_user(client)
    a_username = await _username(client, a)
    resp = await client.get(f"/api/users/{a_username}", headers=a["headers"])
    assert resp.json()["friend_status"] == "self"

    missing = await client.get("/api/users/no-such-user", headers=a["headers"])
    assert missing.status_code == 404
