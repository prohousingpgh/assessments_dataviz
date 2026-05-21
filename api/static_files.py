from __future__ import annotations

import logging

from fastapi import FastAPI
from starlette.staticfiles import StaticFiles

from api.config import STATIC_DIR

logger = logging.getLogger(__name__)


def install_static_files(app: FastAPI) -> None:
    """Serve the Vite production build; html=True enables SPA deep links."""
    if not STATIC_DIR.is_dir():
        logger.warning("Static directory missing (%s); UI will not be served", STATIC_DIR)
        return
    app.mount(
        "/",
        StaticFiles(directory=STATIC_DIR, html=True),
        name="spa",
    )
