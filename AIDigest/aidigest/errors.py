"""Error taxonomy. Each class carries the HTTP status it maps to (finding 8):
4xx for caller input, 502 for upstream sources and the AI, 503 for DB/readiness."""


class AIDigestError(Exception):
    status_code = 500
    public_message = "Internal error"

    def __init__(self, message: str | None = None):
        super().__init__(message or self.public_message)

    @property
    def message(self) -> str:
        return str(self)


class InputError(AIDigestError):
    status_code = 400
    public_message = "Invalid input"


class UnsafeURLError(InputError):
    public_message = "URL is not allowed"


class UpstreamError(AIDigestError):
    status_code = 502
    public_message = "Upstream source failed"


class AIError(AIDigestError):
    status_code = 502
    public_message = "AI provider failed or returned invalid output"


class StorageError(AIDigestError):
    status_code = 503
    public_message = "Database unavailable"


class NotReadyError(AIDigestError):
    status_code = 503
    public_message = "SCHEMA_NOT_READY"

    def __init__(self, missing_tables: list[str]):
        self.missing_tables = missing_tables
        super().__init__("SCHEMA_NOT_READY: missing tables " + ", ".join(missing_tables))
