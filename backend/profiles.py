# backend/profiles.py
"""Account profile store: a single-row-per-user SQLite table.

Single-tenant dev convention: when no `user_id` is provided we use the
sentinel `"local"` so the app still works before auth lands.
"""
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Optional

_SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    user_id         TEXT PRIMARY KEY,
    full_name       TEXT,
    username        TEXT,
    email           TEXT,
    phone           TEXT,
    avatar_path     TEXT,
    work_type       TEXT,
    axis_preference TEXT,
    render_prefs    TEXT,
    preferences     TEXT NOT NULL DEFAULT '{}',
    created_at      REAL NOT NULL,
    updated_at      REAL NOT NULL
);
"""

LOCAL_USER_ID = "local"


class ProfileStore:
    """Thin SQLite wrapper. One row per user."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialise()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _initialise(self) -> None:
        with self._connect() as conn:
            conn.executescript(_SCHEMA)

    def get(self, user_id: str = LOCAL_USER_ID) -> dict:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM profiles WHERE user_id = ?", (user_id,),
            ).fetchone()
        if row is None:
            return self._seed(user_id)
        return _row_to_dict(row)

    def _seed(self, user_id: str) -> dict:
        now = time.time()
        defaults = {
            "user_id": user_id,
            "full_name": None,
            "username": None,
            "email": None,
            "phone": None,
            "avatar_path": None,
            "work_type": None,
            "axis_preference": "y",
            "render_prefs": None,
            "preferences": json.dumps(_default_preferences()),
            "created_at": now,
            "updated_at": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO profiles
                    (user_id, full_name, username, email, phone, avatar_path,
                     work_type, axis_preference, render_prefs, preferences,
                     created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                tuple(defaults.values()),
            )
        return self.get(user_id)

    def update(
        self,
        user_id: str = LOCAL_USER_ID,
        *,
        full_name: Optional[str] = None,
        username: Optional[str] = None,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        avatar_path: Optional[str] = None,
        work_type: Optional[str] = None,
        axis_preference: Optional[str] = None,
        render_prefs: Optional[str] = None,
        preferences: Optional[dict] = None,
    ) -> dict:
        self.get(user_id)  # ensure row exists
        updates: list[tuple[str, object]] = []
        if full_name is not None:       updates.append(("full_name", full_name))
        if username is not None:        updates.append(("username", username))
        if email is not None:           updates.append(("email", email))
        if phone is not None:           updates.append(("phone", phone))
        if avatar_path is not None:     updates.append(("avatar_path", avatar_path))
        if work_type is not None:       updates.append(("work_type", work_type))
        if axis_preference is not None: updates.append(("axis_preference", axis_preference))
        if render_prefs is not None:    updates.append(("render_prefs", render_prefs))
        if preferences is not None:
            merged = _merge_prefs(self.get(user_id).get("preferences", {}), preferences)
            updates.append(("preferences", json.dumps(merged)))

        if updates:
            updates.append(("updated_at", time.time()))
            set_clause = ", ".join(f"{k} = ?" for k, _ in updates)
            values = [v for _, v in updates] + [user_id]
            with self._connect() as conn:
                conn.execute(
                    f"UPDATE profiles SET {set_clause} WHERE user_id = ?",
                    values,
                )
        return self.get(user_id)


def _default_preferences() -> dict:
    return {
        "notifications": {
            "render_complete": True,
            "render_failed":   True,
            "low_credits":     True,
            "product_updates": False,
        },
        "appearance": {
            "color_mode":      "dark",
            "reduce_motion":   False,
            "compact_density": False,
        },
        "privacy": {
            "public_gallery_opt_in": False,
            "training_opt_out":      False,
        },
        "defaults": {
            "duration": "3s",
            "engine":   "standard",
        },
    }


def _merge_prefs(existing: dict, incoming: dict) -> dict:
    out = dict(existing or {})
    for key, value in incoming.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = {**out[key], **value}
        else:
            out[key] = value
    return out


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "user_id":         row["user_id"],
        "full_name":       row["full_name"],
        "username":        row["username"],
        "email":           row["email"],
        "phone":           row["phone"],
        "avatar_path":     row["avatar_path"],
        "work_type":       row["work_type"],
        "axis_preference": row["axis_preference"],
        "render_prefs":    row["render_prefs"],
        "preferences":     json.loads(row["preferences"] or "{}"),
        "created_at":      row["created_at"],
        "updated_at":      row["updated_at"],
    }
