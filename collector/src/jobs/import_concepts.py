from __future__ import annotations

import csv
import logging
from pathlib import Path

from ..db import finish_job, get_conn, start_job

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CSV = ROOT / "data" / "concept_members.csv"


def run(csv_path: Path | None = None, apply_theme: bool = True) -> int:
    """
    Import concept_members.csv into concept_members.
    Optionally set instruments.theme_id when CSV provides theme_id.
    """
    path = csv_path or DEFAULT_CSV
    job_id = start_job("import_concepts")
    try:
        if not path.exists():
            raise FileNotFoundError(f"concept CSV not found: {path}")

        rows: list[tuple] = []
        theme_updates: list[tuple[str, str]] = []
        with path.open(encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                code = (r.get("stock_code") or "").strip()
                if len(code) != 6:
                    continue
                concept_code = (r.get("concept_code") or "").strip()
                concept_name = (r.get("concept_name") or concept_code).strip()
                theme_id = (r.get("theme_id") or "").strip() or None
                note = (r.get("note") or "").strip() or None
                rows.append((concept_code, concept_name, code, theme_id, note, "csv"))
                if apply_theme and theme_id:
                    theme_updates.append((theme_id, code))

        if not rows:
            finish_job(job_id, "success", rows_affected=0, message="empty csv after filter")
            return 0

        with get_conn() as conn:
            with conn.cursor() as cur:
                # Drop unknown codes so FK does not fail
                codes = {r[2] for r in rows}
                cur.execute(
                    "SELECT code FROM instruments WHERE code = ANY(%s)",
                    (list(codes),),
                )
                known = {r[0] for r in cur.fetchall()}
                rows = [r for r in rows if r[2] in known]
                theme_updates = [(t, c) for t, c in theme_updates if c in known]

                for r in rows:
                    cur.execute(
                        """
                        INSERT INTO concept_members (
                          concept_code, concept_name, stock_code, theme_id, note, source, updated_at
                        ) VALUES (%s,%s,%s,%s,%s,%s,NOW())
                        ON CONFLICT (concept_code, stock_code) DO UPDATE SET
                          concept_name = EXCLUDED.concept_name,
                          theme_id = EXCLUDED.theme_id,
                          note = EXCLUDED.note,
                          source = EXCLUDED.source,
                          updated_at = NOW()
                        """,
                        r,
                    )
                if apply_theme and theme_updates:
                    for theme_id, code in theme_updates:
                        cur.execute(
                            """
                            UPDATE instruments
                            SET theme_id = %s
                            WHERE code = %s
                              AND (theme_id IS NULL OR theme_id = '' OR theme_id = %s)
                            """,
                            (theme_id, code, theme_id),
                        )

        logger.info(
            "import-concepts done rows=%s theme_touch=%s path=%s",
            len(rows),
            len(theme_updates),
            path,
        )
        finish_job(
            job_id,
            "success",
            rows_affected=len(rows),
            message=f"theme_updates={len(theme_updates)}",
        )
        return len(rows)
    except Exception as exc:
        logger.exception("import-concepts failed")
        finish_job(job_id, "failed", message=str(exc))
        raise
