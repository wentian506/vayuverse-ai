"""
Database Engine & Session Configuration — VAYUVERSE AI
Supports:
  1. Supabase Free-Tier PostgreSQL (Supavisor IPv4 Transaction Pooler :6543 or Session Pooler :5432)
  2. Standard PostgreSQL (Neon / Render / Docker)
  3. Local SQLite zero-config development fallback (when DATABASE_URL is unset)
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_SQLITE = f"sqlite:///{DATA_DIR / 'vayuverse.db'}"


def _normalize_database_url(raw_url: str) -> tuple[str, Dict[str, Any], Dict[str, Any]]:
    """
    Normalize DATABASE_URL for SQLAlchemy 2.0 + psycopg3, including seamless support
    for Supabase Supavisor Transaction Pooler (:6543) on Render's IPv4-only free tier.
    """
    url = (raw_url or "").strip()
    if not url:
        url = DEFAULT_SQLITE

    if url.startswith("sqlite"):
        return url, {"check_same_thread": False}, {}

    # Normalize postgres:// or postgresql:// -> postgresql+psycopg://
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]

    parts = urlsplit(url)
    query_pairs = dict(parse_qsl(parts.query, keep_blank_values=True))

    # Strip PgBouncer/Prisma-only query params that psycopg3 rejects as unknown libpq options
    is_pgbouncer = query_pairs.pop("pgbouncer", "").lower() in {"true", "1", "yes"}
    query_pairs.pop("connection_limit", None)
    query_pairs.pop("schema", None)

    host = (parts.hostname or "").lower()
    port = parts.port
    is_supabase = "supabase.co" in host or "supabase.com" in host
    is_transaction_pooler = is_pgbouncer or port == 6543 or "pooler.supabase.com" in host

    # Enforce TLS for Supabase & managed cloud Postgres unless explicitly overridden
    if is_supabase and "sslmode" not in query_pairs:
        query_pairs["sslmode"] = "require"

    clean_query = urlencode(query_pairs)
    normalized_url = urlunsplit(
        (parts.scheme, parts.netloc, parts.path, clean_query, parts.fragment)
    )

    connect_args: Dict[str, Any] = {"connect_timeout": 10}
    engine_kwargs: Dict[str, Any] = {"pool_pre_ping": True}

    if is_transaction_pooler:
        # Critical for Supabase Supavisor Transaction Pooler (:6543):
        # disable server-side prepared statements to avoid DuplicatePreparedStatement errors,
        # and keep connection footprint tiny for Free-Tier limits.
        connect_args["prepare_threshold"] = None
        if os.getenv("DB_USE_NULL_POOL", "false").lower() in {"1", "true", "yes"}:
            engine_kwargs["poolclass"] = NullPool
        else:
            engine_kwargs.update(
                {
                    "pool_size": int(os.getenv("DB_POOL_SIZE", "4")),
                    "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "4")),
                    "pool_recycle": 240,
                    "pool_timeout": 20,
                }
            )
    else:
        # Session pooler (:5432) or dedicated PostgreSQL — still conservative for free tier
        connect_args["prepare_threshold"] = None
        engine_kwargs.update(
            {
                "pool_size": int(os.getenv("DB_POOL_SIZE", "5")),
                "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "5")),
                "pool_recycle": 300,
                "pool_timeout": 20,
            }
        )

    return normalized_url, connect_args, engine_kwargs


DATABASE_URL, _CONNECT_ARGS, _ENGINE_KWARGS = _normalize_database_url(
    os.getenv("DATABASE_URL", DEFAULT_SQLITE)
)
DB_BACKEND = "sqlite" if DATABASE_URL.startswith("sqlite") else "postgresql"

engine = create_engine(
    DATABASE_URL,
    connect_args=_CONNECT_ARGS,
    **_ENGINE_KWARGS,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
