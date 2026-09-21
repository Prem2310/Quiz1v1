from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from app.core import oauth
from app.core.colleges import ensure_college
from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.core.serializers import to_user_read
from app.dependencies import CurrentUser, DbSession
from app.models import UserData
from app.schemas import AuthProviders, AuthResponse, UserCreate, UserLogin, UserRead, UserUpdate

router = APIRouter(prefix="/auth", tags=["auth"])


def set_auth_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        "access_token",
        token,
        httponly=True,
        secure=settings.cookie_secure,
        # Frontend and API live on different domains in production (Netlify + Render/etc.),
        # so the cookie must be SameSite=None to be sent on those cross-site requests.
        # Browsers only accept SameSite=None alongside Secure, hence the pairing with
        # cookie_secure. Local dev stays "lax" since it's same-site http://localhost.
        samesite="none" if settings.cookie_secure else "lax",
        max_age=settings.access_token_expire_minutes * 60,
    )


async def _canonical_college(db: DbSession, name: str | None) -> str | None:
    """The listed spelling of the college (adding it to the list if new); blank means none."""
    if not name or not name.strip():
        return None
    try:
        return (await ensure_college(db, name)).name
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from None


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, response: Response, db: DbSession) -> AuthResponse:
    existing = await db.scalar(select(UserData).where(or_(UserData.email == payload.email, UserData.username == payload.username)))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email or username is already registered")
    user = UserData(
        name=payload.name,
        email=payload.email,
        username=payload.username,
        password_hash=hash_password(payload.password),
        college_name=await _canonical_college(db, payload.college_name),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(user.id)
    set_auth_cookie(response, token)
    return AuthResponse(access_token=token, user=to_user_read(user))


@router.post("/login", response_model=AuthResponse)
async def login(payload: UserLogin, response: Response, db: DbSession) -> AuthResponse:
    user = await db.scalar(select(UserData).where(or_(UserData.email == payload.email_or_username, UserData.username == payload.email_or_username)))
    # Accounts made through Google/GitHub have no password: they can only sign in through their provider.
    if user is None or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(user.id)
    set_auth_cookie(response, token)
    return AuthResponse(access_token=token, user=to_user_read(user))


NONCE_COOKIE = "oauth_nonce"
NONCE_COOKIE_PATH = "/api/auth/oauth"


@router.get("/providers", response_model=AuthProviders)
async def auth_providers() -> AuthProviders:
    """Which social sign-in buttons the login page should show (only providers that are configured)."""
    return AuthProviders(providers=oauth.enabled_providers(get_settings()))


def _redirect_uri(request: Request, provider: str) -> str:
    settings = get_settings()
    origin = (settings.api_public_url or str(request.base_url)).rstrip("/")
    return f"{origin}/api/auth/oauth/{provider}/callback"


def _back_to_login(error: str) -> RedirectResponse:
    response = RedirectResponse(f"{get_settings().frontend_url.rstrip('/')}/login?{urlencode({'error': error})}", status_code=302)
    response.delete_cookie(NONCE_COOKIE, path=NONCE_COOKIE_PATH)
    return response


@router.get("/oauth/{provider}/start", include_in_schema=False)
async def oauth_start(provider: str, request: Request) -> RedirectResponse:
    settings = get_settings()
    if provider not in oauth.enabled_providers(settings):
        return _back_to_login("oauth_unavailable")
    nonce = oauth.new_nonce()
    state = oauth.make_state(settings, provider, nonce)
    response = RedirectResponse(oauth.authorize_url(settings, provider, _redirect_uri(request, provider), state), status_code=302)
    # Lax: the callback is a top-level GET from the provider's site, which Lax cookies are sent on.
    response.set_cookie(NONCE_COOKIE, nonce, max_age=600, httponly=True, secure=settings.cookie_secure, samesite="lax", path=NONCE_COOKIE_PATH)
    return response


@router.get("/oauth/{provider}/callback", include_in_schema=False)
async def oauth_callback(provider: str, request: Request, db: DbSession, code: str | None = None, state: str | None = None, error: str | None = None) -> RedirectResponse:
    settings = get_settings()
    if provider not in oauth.enabled_providers(settings):
        return _back_to_login("oauth_unavailable")
    if error or not code or not state:
        return _back_to_login("oauth_denied" if error == "access_denied" else "oauth_failed")
    try:
        oauth.check_state(settings, state, provider, request.cookies.get(NONCE_COOKIE))
        profile = await oauth.fetch_profile(settings, provider, code, _redirect_uri(request, provider))
        user = await _user_for_profile(db, profile)
    except oauth.OAuthError as exc:
        return _back_to_login(exc.code)
    except IntegrityError:  # two callbacks racing to create the same account
        await db.rollback()
        return _back_to_login("oauth_failed")
    if not user.is_active:
        return _back_to_login("oauth_failed")

    token = create_access_token(user.id)
    # The web app keeps its token in localStorage (the duel WebSocket authenticates with it), so hand it over in
    # the URL fragment: fragments are never sent to a server or leaked through a Referer header.
    response = RedirectResponse(f"{settings.frontend_url.rstrip('/')}/auth/callback#{urlencode({'token': token})}", status_code=302)
    set_auth_cookie(response, token)
    response.delete_cookie(NONCE_COOKIE, path=NONCE_COOKIE_PATH)
    return response


async def _user_for_profile(db: DbSession, profile: oauth.OAuthProfile) -> UserData:
    """Same provider account -> same user. Otherwise link to the account that owns the (provider-verified) email,
    otherwise create one. Only verified emails ever reach here, so linking by email is not an impersonation route."""
    user = await db.scalar(select(UserData).where(UserData.auth_provider == profile.provider, UserData.provider_account_id == profile.account_id))
    if user is not None:
        return user
    user = await db.scalar(select(UserData).where(func.lower(UserData.email) == profile.email.lower()))
    if user is not None:
        if user.auth_provider is None:  # keep the first link; later providers still match by email
            user.auth_provider, user.provider_account_id = profile.provider, profile.account_id
        if not user.profile_picture_url and profile.picture:
            user.profile_picture_url = profile.picture
        await db.commit()
        return user

    for username in oauth.username_candidates(profile.username_hint):
        if await db.scalar(select(UserData.id).where(UserData.username == username)) is None:
            break
    user = UserData(
        name=profile.name[:120] if len(profile.name) >= 2 else username,
        email=profile.email,
        username=username,
        password_hash=None,
        auth_provider=profile.provider,
        provider_account_id=profile.account_id,
        profile_picture_url=profile.picture,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        "access_token",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="none" if settings.cookie_secure else "lax",
    )


@router.get("/me", response_model=UserRead)
async def me(current_user: CurrentUser) -> UserRead:
    return to_user_read(current_user)


@router.patch("/me", response_model=UserRead)
async def update_me(payload: UserUpdate, current_user: CurrentUser, db: DbSession) -> UserRead:
    if payload.username and payload.username != current_user.username:
        taken = await db.scalar(select(UserData).where(UserData.username == payload.username, UserData.id != current_user.id))
        if taken:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username is already in use")
        current_user.username = payload.username
    if payload.name is not None:
        current_user.name = payload.name
    if payload.college_name is not None:
        current_user.college_name = await _canonical_college(db, payload.college_name)
    if payload.profile_picture_url is not None:
        current_user.profile_picture_url = payload.profile_picture_url
    await db.commit()
    await db.refresh(current_user)
    return to_user_read(current_user)
