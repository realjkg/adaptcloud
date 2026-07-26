"""Azure OpenAI client factory.

`get_client()` returns an AzureOpenAI client backed by DefaultAzureCredential
when MODE=azure — so a container with a user-assigned managed identity attached
lights up automatically. Locally (`az login`), it uses your CLI identity. No
API keys are used or accepted here — proving the MSI story is the whole point
of the demo.

In MODE=local we return None; the triage service switches to a canned response
so the demo runs without any cloud calls.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional

from .config import settings

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_client() -> Optional["object"]:
    if settings.mode == "local":
        log.info("MODE=local — Azure OpenAI client not initialised (using canned triage).")
        return None

    if not settings.azure_openai_endpoint:
        raise RuntimeError(
            "MODE=azure requires AZURE_OPENAI_ENDPOINT (e.g. https://aoai-insurance-app.openai.azure.com)."
        )

    # Lazy import — MODE=local can boot without these packages installed.
    from azure.identity import DefaultAzureCredential, get_bearer_token_provider
    from openai import AzureOpenAI

    token_provider = get_bearer_token_provider(
        DefaultAzureCredential(),
        "https://cognitiveservices.azure.com/.default",
    )
    log.info(
        "MODE=azure — AzureOpenAI client via DefaultAzureCredential @ %s (deployment=%s)",
        settings.azure_openai_endpoint,
        settings.azure_openai_deployment,
    )
    return AzureOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        azure_ad_token_provider=token_provider,
        api_version=settings.azure_openai_api_version,
    )
