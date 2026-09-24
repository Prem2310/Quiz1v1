"""End-to-end websocket tests: a real uvicorn server on the test's event loop (same throwaway SQLite DB) and real
socket clients for several dummy users. Covers matchmaking, full games, cancel/leave and duplicate sockets
(second tab / reconnect), which is where "one side waits, the other still searches" and "opponent left" came from."""

import asyncio
import json

import pytest
import pytest_asyncio
import uvicorn
import websockets

from app.db import SessionLocal
from app.main import app
from app.models import DuelMatch, UserData
from app.routers import duels

from .conftest import new_user

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session")
async def ws_base():
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=0, lifespan="off", log_level="warning"))
    task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.01)
    port = server.servers[0].sockets[0].getsockname()[1]
    yield f"ws://127.0.0.1:{port}/api"
    server.should_exit = True
    await task


@pytest.fixture(autouse=True)
async def isolated(monkeypatch):
    monkeypatch.setattr(duels, "REVEAL_PAUSE_SECONDS", 0.02)
    monkeypatch.setattr(duels, "RECONNECT_GRACE_SECONDS", 1.5)
    yield
    for entry in list(duels._queue.values()):  # a failed test must not leave players for the next one to match
        await duels._close_quietly(entry.websocket)
    duels._queue.clear()


@pytest.fixture
async def users(client):
    """Five fresh dummy users: {'id', 'token'}."""
    out = []
    for _ in range(5):
        u = await new_user(client)
        out.append({"id": u["id"], "token": u["headers"]["Authorization"].split()[1]})
    return out


async def recv(ws, timeout=5.0):
    return json.loads(await asyncio.wait_for(ws.recv(), timeout))


async def recv_until(ws, kind, timeout=5.0):
    while True:
        message = await recv(ws, timeout)
        if message["type"] == kind:
            return message


async def queue(base, user):
    ws = await websockets.connect(f"{base}/ws/matchmaking?token={user['token']}")
    assert (await recv(ws))["type"] == "queued"
    return ws


async def play(base, user, duel_id, answer="a", leave_at=None, drop_at=None):
    """Join a duel and answer every question with `answer`. Returns the last message (duel_end / opponent_left).
    leave_at: at that question, leave deliberately (what the page does on unmount). drop_at: just lose the connection."""
    async with websockets.connect(f"{base}/ws/duels/{duel_id}?token={user['token']}") as ws:
        while True:
            message = await recv(ws, 15)
            if message["type"] == "question":
                if leave_at is not None and message["index"] == leave_at:
                    await ws.send(json.dumps({"type": "leave"}))
                    return message
                if drop_at is not None and message["index"] == drop_at:
                    return message
                await ws.send(json.dumps({"type": "answer", "index": message["index"], "answer": answer}))
            elif message["type"] in ("duel_end", "opponent_left"):
                return message


async def status_of(duel_id, expect=None, timeout=3.0):
    """The match status; with `expect`, wait for it (the server writes it just after telling the sockets)."""
    deadline = asyncio.get_running_loop().time() + timeout
    while True:
        async with SessionLocal() as db:
            status = (await db.get(DuelMatch, duel_id)).status
        if expect is None or status == expect or asyncio.get_running_loop().time() > deadline:
            return status
        await asyncio.sleep(0.05)


async def test_two_players_match_and_play_a_full_duel(ws_base, users):
    a, b = users[0], users[1]
    qa, qb = await queue(ws_base, a), await queue(ws_base, b)
    fa, fb = await recv_until(qa, "match_found"), await recv_until(qb, "match_found")
    assert fa["duel_id"] == fb["duel_id"]
    assert fa["opponent"]["user_id"] == b["id"] and fb["opponent"]["user_id"] == a["id"]
    await asyncio.gather(qa.wait_closed(), qb.wait_closed())
    assert qa.close_code == qb.close_code == 1000  # clean close: the browser must not reconnect and re-queue

    end_a, end_b = await asyncio.gather(play(ws_base, a, fa["duel_id"], "a"), play(ws_base, b, fa["duel_id"], "b"))
    assert end_a["type"] == end_b["type"] == "duel_end"
    assert end_a["winner_id"] == end_b["winner_id"] == a["id"]
    assert await status_of(fa["duel_id"], "completed") == "completed"
    async with SessionLocal() as db:
        ua, ub = await db.get(UserData, a["id"]), await db.get(UserData, b["id"])
        assert ua.user_rating > 1000 > ub.user_rating


async def test_four_players_split_into_two_consistent_duels_and_a_fifth_keeps_searching(ws_base, users):
    sockets = [await queue(ws_base, u) for u in users[:4]]
    found = [await recv_until(ws, "match_found") for ws in sockets]
    by_duel: dict[int, set[int]] = {}
    for user, message in zip(users[:4], found):
        by_duel.setdefault(message["duel_id"], set()).add(user["id"])
    assert len(by_duel) == 2 and all(len(pair) == 2 for pair in by_duel.values())  # everyone matched exactly once

    lonely = await queue(ws_base, users[4])
    with pytest.raises(asyncio.TimeoutError):
        await recv(lonely, timeout=2.5)  # nobody left to match: no ghost match
    await lonely.send(json.dumps({"type": "cancel"}))
    await lonely.wait_closed()
    assert users[4]["id"] not in duels._queue


async def test_cancelled_player_is_never_matched(ws_base, users):
    a, b = users[0], users[1]
    qa = await queue(ws_base, a)
    await qa.send(json.dumps({"type": "cancel"}))
    await qa.wait_closed()
    qb = await queue(ws_base, b)
    with pytest.raises(asyncio.TimeoutError):
        await recv(qb, timeout=2.5)
    await qb.close()


async def test_second_queue_socket_for_the_same_user_gets_the_match(ws_base, users):
    """Second tab / reconnect while the server still holds the old socket: the live socket must hear match_found."""
    a, b = users[0], users[1]
    stale = await queue(ws_base, a)
    live = await queue(ws_base, a)
    await asyncio.wait_for(stale.wait_closed(), 3)  # replaced: the server drops the old socket, so it can't be matched
    qb = await queue(ws_base, b)
    fb = await recv_until(qb, "match_found")
    fa = await recv_until(live, "match_found")
    assert fa["duel_id"] == fb["duel_id"]


async def test_leaving_mid_duel_tells_the_opponent_and_aborts_without_rating_change(ws_base, users):
    a, b = users[0], users[1]
    qa, qb = await queue(ws_base, a), await queue(ws_base, b)
    duel_id = (await recv_until(qa, "match_found"))["duel_id"]
    await recv_until(qb, "match_found")

    left, other = await asyncio.gather(play(ws_base, a, duel_id, leave_at=2), play(ws_base, b, duel_id))
    assert left["type"] == "question" and other["type"] == "opponent_left"
    assert await status_of(duel_id, "aborted") == "aborted"
    async with SessionLocal() as db:
        assert (await db.get(UserData, b["id"])).user_rating == 1000

    rejoin = await play(ws_base, a, duel_id)  # rejoining an aborted duel answers at once instead of hanging
    assert rejoin["type"] == "opponent_left"


async def test_duplicate_duel_socket_does_not_abort_the_duel(ws_base, users):
    """A second tab / reconnect for the same player must not end the duel as "opponent left" for the other side."""
    a, b = users[0], users[1]
    qa, qb = await queue(ws_base, a), await queue(ws_base, b)
    duel_id = (await recv_until(qa, "match_found"))["duel_id"]
    await recv_until(qb, "match_found")

    stale = await websockets.connect(f"{ws_base}/ws/duels/{duel_id}?token={a['token']}")
    await recv(stale)
    live_a = asyncio.create_task(play(ws_base, a, duel_id))
    await asyncio.wait_for(stale.wait_closed(), 3)  # replaced: the server drops the old socket instead of aborting
    end_a, end_b = await asyncio.gather(live_a, play(ws_base, b, duel_id))
    assert end_a["type"] == end_b["type"] == "duel_end"
    assert await status_of(duel_id, "completed") == "completed"


async def test_a_dropped_player_who_reconnects_in_time_finishes_the_duel(ws_base, users):
    """A network blip mid-duel used to end it at once as "opponent left". The client reconnects; the duel goes on."""
    a, b = users[0], users[1]
    qa, qb = await queue(ws_base, a), await queue(ws_base, b)
    duel_id = (await recv_until(qa, "match_found"))["duel_id"]
    await recv_until(qb, "match_found")

    async def drop_then_reconnect():
        dropped = await play(ws_base, a, duel_id, drop_at=1)
        assert dropped["index"] == 1
        await asyncio.sleep(0.5)  # SocketManager's first retry is 0.8 s; grace here is 1.5 s
        return await play(ws_base, a, duel_id)  # resumes on the live question, not "waiting"

    end_a, end_b = await asyncio.gather(drop_then_reconnect(), play(ws_base, b, duel_id))
    assert end_a["type"] == end_b["type"] == "duel_end"
    assert await status_of(duel_id, "completed") == "completed"


async def test_a_dropped_player_who_never_returns_ends_the_duel_after_the_grace(ws_base, users):
    a, b = users[0], users[1]
    qa, qb = await queue(ws_base, a), await queue(ws_base, b)
    duel_id = (await recv_until(qa, "match_found"))["duel_id"]
    await recv_until(qb, "match_found")

    dropped, other = await asyncio.gather(play(ws_base, a, duel_id, drop_at=1), play(ws_base, b, duel_id))
    assert other["type"] == "opponent_left"
    assert await status_of(duel_id, "aborted") == "aborted"
