import time

from app.redis_client import PRESENCE_WINDOW_S, room_broker

from .conftest import new_user


async def _stats(client) -> dict:
    await room_broker.invalidate("registered-users")  # the registered count is cached for minutes; tests need a fresh read
    resp = await client.get("/api/stats/public")  # public: no auth header
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_public_stats_counts_registered_players(client):
    before = await _stats(client)
    await new_user(client)
    await new_user(client)
    assert (await _stats(client))["registered_users"] - before["registered_users"] == 2


async def test_online_now_counts_players_who_recently_made_an_authenticated_request(client):
    before = await _stats(client)
    a, b = await new_user(client), await new_user(client)  # registering alone is not presence
    assert (await _stats(client))["online_now"] == before["online_now"]

    for user in (a, b):
        assert (await client.get("/api/auth/me", headers=user["headers"])).status_code == 200
    assert (await _stats(client))["online_now"] - before["online_now"] == 2

    await client.get("/api/auth/me", headers=a["headers"])  # the same player again is still one player
    assert (await _stats(client))["online_now"] - before["online_now"] == 2


async def test_online_now_drops_players_who_went_quiet(client):
    user = await new_user(client)
    now = time.time()
    await room_broker.touch_presence(user["id"], now=now - PRESENCE_WINDOW_S + 5)  # last seen just inside the window
    inside = await room_broker.online_count(now=now)
    await room_broker.touch_presence(user["id"], now=now - PRESENCE_WINDOW_S - 5)  # same player, now last seen just outside it
    outside = await room_broker.online_count(now=now)
    assert inside - outside == 1


async def test_public_stats_does_not_query_the_database_when_warm(client, sql):
    await _stats(client)
    with sql:
        assert (await client.get("/api/stats/public")).status_code == 200
    assert sql.count == 0
