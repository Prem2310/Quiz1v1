import pytest

from app.core.config import Settings

PREFLIGHT = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"}


async def _allowed_origin(client, origin: str) -> str | None:
    resp = await client.options("/api/auth/login", headers={"Origin": origin, **PREFLIGHT})
    return resp.headers.get("access-control-allow-origin")


@pytest.mark.parametrize(
    "origin",
    [
        "https://quiz1v1.tech",
        "https://www.quiz1v1.tech",
        "https://quiz1v1.netlify.app",
        "https://some-preview-123.vercel.app",
        "http://localhost:3000",
    ],
)
async def test_known_frontends_are_allowed_with_credentials(client, origin):
    resp = await client.options("/api/auth/login", headers={"Origin": origin, **PREFLIGHT})
    assert resp.headers.get("access-control-allow-origin") == origin
    assert resp.headers.get("access-control-allow-credentials") == "true"


@pytest.mark.parametrize(
    "origin",
    [
        "https://quiz1v1.tech.evil.com",  # suffix trick
        "https://evilquiz1v1.tech",  # prefix trick
        "http://quiz1v1.tech",  # wrong scheme
        "https://example.com",
    ],
)
async def test_lookalike_and_unknown_origins_are_refused(client, origin):
    assert await _allowed_origin(client, origin) is None


def test_default_origin_is_the_production_site_not_a_wildcard():
    origins = Settings(_env_file=None).cors_origin_list
    assert "https://quiz1v1.tech" in origins and "*" not in origins


def test_trailing_slashes_in_cors_origins_are_stripped():
    # "https://site.com/" never matches a browser Origin header, which has no trailing slash
    s = Settings(_env_file=None, CORS_ORIGINS="https://a.example/, https://b.example ,")
    assert s.cors_origin_list == ["https://a.example", "https://b.example"]
