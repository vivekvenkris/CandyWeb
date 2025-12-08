import sqlite3
import hashlib
import secrets
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict
import json

# Database path
DB_PATH = Path(__file__).parent.parent.parent / "users.db"


def get_db_connection():
    """Get a database connection"""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    """Initialize the database with required tables"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_login TEXT
        )
    """)

    # Sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (username) REFERENCES users(username)
        )
    """)

    conn.commit()

    # Check if admin user exists, if not create it
    cursor.execute("SELECT username FROM users WHERE username = ?", ("admin",))
    if not cursor.fetchone():
        password_hash = hashlib.sha256("admin".encode()).hexdigest()
        cursor.execute(
            "INSERT INTO users (username, password_hash, name, created_at) VALUES (?, ?, ?, ?)",
            ("admin", password_hash, "Administrator", datetime.now().isoformat())
        )
        conn.commit()
        print("Created default admin user (username: admin, password: admin)")

    conn.close()


# User management functions
def create_user(username: str, password: str, name: str) -> bool:
    """Create a new user"""
    try:
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (username, password_hash, name, created_at) VALUES (?, ?, ?, ?)",
            (username, password_hash, name, datetime.now().isoformat())
        )
        conn.commit()
        conn.close()
        return True
    except sqlite3.IntegrityError:
        return False


def verify_user(username: str, password: str) -> Optional[Dict]:
    """Verify user credentials and return user info"""
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT username, name FROM users WHERE username = ? AND password_hash = ?",
        (username, password_hash)
    )
    row = cursor.fetchone()

    if row:
        # Update last login
        cursor.execute(
            "UPDATE users SET last_login = ? WHERE username = ?",
            (datetime.now().isoformat(), username)
        )
        conn.commit()
        conn.close()
        return {"username": row["username"], "name": row["name"]}

    conn.close()
    return None


def get_user(username: str) -> Optional[Dict]:
    """Get user info by username"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT username, name, created_at, last_login FROM users WHERE username = ?",
        (username,)
    )
    row = cursor.fetchone()
    conn.close()

    if row:
        return {
            "username": row["username"],
            "name": row["name"],
            "created_at": row["created_at"],
            "last_login": row["last_login"]
        }
    return None


# Session management functions
def create_session(username: str, duration_hours: int = 24) -> str:
    """Create a new session for a user"""
    token = secrets.token_urlsafe(32)
    created_at = datetime.now()
    expires_at = created_at + timedelta(hours=duration_hours)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, username, created_at.isoformat(), expires_at.isoformat())
    )
    conn.commit()
    conn.close()

    return token


def validate_session(token: str) -> Optional[Dict]:
    """Validate a session token and return user info"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT s.username, s.expires_at, u.name
        FROM sessions s
        JOIN users u ON s.username = u.username
        WHERE s.token = ?
        """,
        (token,)
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    expires_at = datetime.fromisoformat(row["expires_at"])
    if datetime.now() > expires_at:
        # Session expired, delete it
        delete_session(token)
        return None

    return {
        "username": row["username"],
        "name": row["name"]
    }


def delete_session(token: str):
    """Delete a session"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()


def cleanup_expired_sessions():
    """Remove all expired sessions from database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM sessions WHERE expires_at < ?",
        (datetime.now().isoformat(),)
    )
    conn.commit()
    conn.close()


# Initialize database on module import
init_database()
