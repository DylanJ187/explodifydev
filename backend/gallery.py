# backend/gallery.py
"""Gallery persistence: SQLite store for saved videos (base, styled, stitched).

Design notes:
- Single-file SQLite DB under the shared upload directory.
- Items reference absolute video paths on disk; the DB is the index, not the
  storage. Video bytes remain in their job directories (or the stitched dir).
- Immutable write pattern: `add_item` returns a fresh dict; update helpers
  fetch then write a new row without mutating Python objects in place.
- No ORM — keeps the dependency surface minimal and avoids schema migration
  complexity for a small table.
"""
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Literal, Optional

# --- Schema ----------------------------------------------------------------

GalleryKind = Literal["base", "styled", "stitched", "loop"]

_SCHEMA = """
CREATE TABLE IF NOT EXISTS gallery_items (
    id              TEXT PRIMARY KEY,
    job_id          TEXT,
    variant         TEXT,
    kind            TEXT NOT NULL,
    title           TEXT NOT NULL,
    video_path      TEXT NOT NULL,
    thumbnail_path  TEXT,
    duration_s      REAL,
    created_at      REAL NOT NULL,
    metadata_json   TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_gallery_created_at
    ON gallery_items(created_at DESC);
"""


class GalleryStore:
    """Thin SQLite wrapper. Thread-safe by opening a new connection per call."""

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

    # -- Writes ----------------------------------------------------------

    def add_item(
        self,
        *,
        kind: GalleryKind,
        title: str,
        video_path: Path,
        thumbnail_path: Optional[Path] = None,
        duration_s: Optional[float] = None,
        job_id: Optional[str] = None,
        variant: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> dict:
        item_id = str(uuid.uuid4())
        created_at = time.time()
        meta_json = json.dumps(metadata or {})

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO gallery_items
                    (id, job_id, variant, kind, title, video_path,
                     thumbnail_path, duration_s, created_at, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item_id, job_id, variant, kind, title,
                    str(video_path),
                    str(thumbnail_path) if thumbnail_path else None,
                    duration_s, created_at, meta_json,
                ),
            )
        return self.get_item(item_id)  # type: ignore[return-value]

    def update_title(self, item_id: str, title: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE gallery_items SET title = ? WHERE id = ?",
                (title, item_id),
            )
            return cur.rowcount > 0

    def delete_item(self, item_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM gallery_items WHERE id = ?", (item_id,),
            )
            return cur.rowcount > 0

    # -- Reads -----------------------------------------------------------

    def get_item(self, item_id: str) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM gallery_items WHERE id = ?", (item_id,),
            ).fetchone()
        return _row_to_dict(row) if row else None

    def list_items(
        self, kind: Optional[GalleryKind] = None, limit: int = 200,
    ) -> list[dict]:
        sql = "SELECT * FROM gallery_items"
        params: tuple = ()
        if kind is not None:
            sql += " WHERE kind = ?"
            params = (kind,)
        sql += " ORDER BY created_at DESC LIMIT ?"
        params = params + (limit,)

        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [_row_to_dict(r) for r in rows]


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "job_id": row["job_id"],
        "variant": row["variant"],
        "kind": row["kind"],
        "title": row["title"],
        "video_path": row["video_path"],
        "thumbnail_path": row["thumbnail_path"],
        "duration_s": row["duration_s"],
        "created_at": row["created_at"],
        "metadata": json.loads(row["metadata_json"] or "{}"),
    }
