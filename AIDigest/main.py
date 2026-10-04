"""uvicorn entry point: uvicorn main:app --host 0.0.0.0 --port 8000"""

import logging
import sys

from aidigest.app import create_app
from aidigest.config import Settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", stream=sys.stdout)

app = create_app(Settings())
