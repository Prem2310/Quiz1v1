import json
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

from redis.asyncio import Redis

from app.core.config import get_settings

log = logging.getLogger(__name__)

PRESENCE_KEY = "quizit:presence"
# A signed-in tab polls the API every ~5 s while visible (see useIncomingActivity on the frontend) and stops when hidden,
# so "no authenticated request for this long" means the player has left.
PRESENCE_WINDOW_S = 30


class RoomBroker:
    """Redis handle: pub/sub for rooms plus a tiny JSON cache. Every method is a no-op without Redis."""

    def __init__(self) -> None:
        self.client: Redis | None = None
        self._local: dict[str, tuple[float, Any]] = {}  # in-process fallback so a missing/dead Redis still spares the database
        self._presence: dict[int, float] = {}  # same idea for presence; per-process, so multi-worker counts need Redis

    async def connect(self) -> None:
        url = get_settings().redis_url
        if not url:
            return
        # protocol=2: redis-py >= 6 opens with HELLO (RESP3), which Redis < 6 (incl. the Windows 3.0 build) rejects.
        # Short timeouts: a hung Redis must never stall an API request; callers fall back to the database.
        client = Redis.from_url(url, decode_responses=True, protocol=2, socket_connect_timeout=1.5, socket_timeout=1.5)
        await client.ping()
        self.client = client

    async def close(self) -> None:
        if self.client:
            await self.client.aclose()
            self.client = None

    async def publish(self, room_id: str, payload: dict) -> None:
        if self.client:
            await self.client.publish(f"quizit:room:{room_id}", json.dumps(payload))

    async def subscribe(self, room_id: str) -> AsyncIterator[dict]:
        if not self.client:
            return
        pubsub = self.client.pubsub()
        await pubsub.subscribe(f"quizit:room:{room_id}")
        try:
            async for message in pubsub.listen():
                if message.get("type") == "message":
                    yield json.loads(message["data"])
        finally:
            await pubsub.unsubscribe(f"quizit:room:{room_id}")
            await pubsub.aclose()

    async def cached(self, key: str, ttl: int, loader: Callable[[], Awaitable[Any]]) -> Any:
        """Return the JSON value cached under `key`, else run `loader()` and cache its (JSON-safe) result for `ttl` seconds."""
        if self.client:
            try:
                hit = await self.client.get(f"quizit:cache:{key}")
                if hit is not None:
                    return json.loads(hit)
            except Exception:
                log.warning("Redis read failed for %s; falling back to the database", key)
        else:
            entry = self._local.get(key)
            if entry and entry[0] > time.monotonic():
                return entry[1]
        value = await loader()
        if self.client:
            try:
                await self.client.set(f"quizit:cache:{key}", json.dumps(value), ex=ttl)
            except Exception:
                log.warning("Redis write failed for %s", key)
        else:
            self._local[key] = (time.monotonic() + ttl, value)
        return value

    async def touch_presence(self, user_id: int, now: float | None = None) -> None:
        """Record that `user_id` was just seen. Sorted set (score = last seen), one member per player, so re-touching is a no-growth write."""
        now = time.time() if now is None else now
        if self.client:
            try:
                await self.client.zadd(PRESENCE_KEY, {str(user_id): now})
            except Exception:
                log.warning("Redis presence write failed for user %s", user_id)
        else:
            self._presence[user_id] = now

    async def online_count(self, window_s: int = PRESENCE_WINDOW_S, now: float | None = None) -> int:
        """Players seen within the last `window_s` seconds. Stale entries are dropped on the way, so the set never outgrows the active crowd."""
        cutoff = (time.time() if now is None else now) - window_s
        if self.client:
            try:
                await self.client.zremrangebyscore(PRESENCE_KEY, "-inf", cutoff)
                return int(await self.client.zcount(PRESENCE_KEY, cutoff, "+inf"))
            except Exception:
                log.warning("Redis presence read failed; reporting 0 online")
                return 0
        self._presence = {uid: seen for uid, seen in self._presence.items() if seen >= cutoff}
        return len(self._presence)

    async def invalidate(self, *keys: str) -> None:
        for key in keys:
            self._local.pop(key, None)
        if self.client and keys:
            try:
                await self.client.delete(*[f"quizit:cache:{k}" for k in keys])
            except Exception:
                log.warning("Redis invalidate failed for %s", keys)


room_broker = RoomBroker()
