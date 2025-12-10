from fastapi import APIRouter, HTTPException, Response, Cookie
from pydantic import BaseModel
from typing import Optional
from datetime import timedelta
from app.services.database import (
    verify_user,
    create_user as db_create_user,
    get_user,
    create_session as db_create_session,
    validate_session as db_validate_session,
    delete_session as db_delete_session,
    cleanup_expired_sessions
)

router = APIRouter(prefix="/auth", tags=["authentication"])

SESSION_DURATION = timedelta(hours=24)


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    message: str
    username: Optional[str] = None
    name: Optional[str] = None
    session_token: Optional[str] = None


class SessionCheckResponse(BaseModel):
    authenticated: bool
    username: Optional[str] = None
    name: Optional[str] = None


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, response: Response):
    """
    Authenticate user with username and password.
    Returns a session token on success.
    """
    username = request.username.strip()
    password = request.password

    # Verify user credentials
    user = verify_user(username, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Create session
    session_token = db_create_session(username, duration_hours=24)

    # Set session cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        max_age=int(SESSION_DURATION.total_seconds()),
        samesite="lax"
    )

    return LoginResponse(
        success=True,
        message="Login successful",
        username=user["username"],
        name=user["name"],
        session_token=session_token
    )


@router.post("/logout")
async def logout(
    response: Response,
    session_token: Optional[str] = Cookie(None)
):
    """
    Logout user by invalidating their session and clearing all cached data.
    """
    if session_token:
        db_delete_session(session_token)

    # Clear session cookie
    response.delete_cookie(key="session_token")

    # Clean up expired sessions
    cleanup_expired_sessions()

    # Clear all in-memory caches
    from app.routers import candidates
    candidates._candidates_cache.clear()
    candidates._candidates_by_utc_cache.clear()
    candidates._csv_header_cache.clear()
    candidates._psrcat_shortlist_cache.clear()
    # Note: We keep _psrcat_parser cached as it's expensive to reload and doesn't contain user data

    return {"success": True, "message": "Logged out successfully"}


@router.get("/session", response_model=SessionCheckResponse)
async def check_session(session_token: Optional[str] = Cookie(None)):
    """
    Check if current session is valid.
    Returns user info if authenticated.
    """
    if not session_token:
        return SessionCheckResponse(authenticated=False)

    session = db_validate_session(session_token)

    if not session:
        return SessionCheckResponse(authenticated=False)

    return SessionCheckResponse(
        authenticated=True,
        username=session["username"],
        name=session["name"]
    )


@router.post("/register")
async def register(request: LoginRequest):
    """
    Register a new user (optional feature).
    """
    username = request.username.strip()
    password = request.password

    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")

    if len(password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

    # Try to create user
    success = db_create_user(username, password, username.capitalize())
    if not success:
        raise HTTPException(status_code=400, detail="Username already exists")

    return {"success": True, "message": "User registered successfully"}
