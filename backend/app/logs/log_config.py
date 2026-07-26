"""Minimal logging setup (shim for the app.logs package missing from the v1.0.0 repo).
main.py imports setup_logging and calls it once with no args."""
import logging
import sys


def setup_logging(level: int = logging.INFO) -> None:
    root = logging.getLogger()
    if root.handlers:  # idempotent
        return
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
    )
