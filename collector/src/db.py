from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator, Sequence

import psycopg
from psycopg.rows import dict_row

from .config import get_settings


def connect() -> psycopg.Connection:
    return psycopg.connect(get_settings().database_url, row_factory=dict_row)


@contextmanager
def get_conn() -> Iterator[psycopg.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def execute(sql: str, params: Sequence[Any] | None = None) -> None:
    with get_conn() as conn:
        conn.execute(sql, params)


def fetch_all(sql: str, params: Sequence[Any] | None = None) -> list[dict]:
    with get_conn() as conn:
        cur = conn.execute(sql, params)
        return list(cur.fetchall())


def fetch_one(sql: str, params: Sequence[Any] | None = None) -> dict | None:
    with get_conn() as conn:
        cur = conn.execute(sql, params)
        return cur.fetchone()


def start_job(job_name: str) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO job_runs (job_name, status)
            VALUES (%s, 'running')
            RETURNING id
            """,
            (job_name,),
        )
        row = cur.fetchone()
        assert row is not None
        return int(row["id"])


def finish_job(
    job_id: int,
    status: str,
    rows_affected: int = 0,
    message: str | None = None,
    detail: dict | None = None,
) -> None:
    import json

    with get_conn() as conn:
        conn.execute(
            """
            UPDATE job_runs
            SET finished_at = NOW(),
                status = %s,
                rows_affected = %s,
                message = %s,
                detail = %s::jsonb
            WHERE id = %s
            """,
            (
                status,
                rows_affected,
                message,
                json.dumps(detail) if detail is not None else None,
                job_id,
            ),
        )
