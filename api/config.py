from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = Path(os.environ.get("STATIC_DIR", ROOT / "web" / "dist"))

_default_origins = "http://localhost:5173,http://127.0.0.1:5173"
_extra = os.environ.get("ALLOWED_ORIGINS", "").strip()
CORS_ORIGINS = [
    o.strip()
    for o in (_default_origins + ("," + _extra if _extra else "")).split(",")
    if o.strip()
]

PORT = int(os.environ.get("PORT", "8000"))
