from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sse_starlette.sse import EventSourceResponse
from models.schemas import TutorRequest, SessionSummaryRequest
from services.ai_service import stream_tutor_response, generate_session_summary
from core.security import decode_token

router = APIRouter(prefix="/tutor", tags=["tutor"])
security = HTTPBearer()


def _require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return payload


@router.post("/chat")
async def chat(
    req: TutorRequest,
    auth: dict = Depends(_require_auth),
):
    """
    Stream Socratic tutor responses via Server-Sent Events.
    The AI never gives direct answers — only guiding questions and Socratic coaching.
    """

    async def event_generator():
        async for chunk in stream_tutor_response(
            config=req.session_config,
            subject=req.current_subject,
            history=req.conversation_history,
            child_message=req.child_message,
        ):
            yield chunk

    return EventSourceResponse(event_generator(), media_type="text/event-stream")


@router.post("/summary")
async def session_summary(
    req: SessionSummaryRequest,
    auth: dict = Depends(_require_auth),
):
    """
    Generate a parent-facing end-of-session report.
    Requires parent role.
    """
    if auth.get("role") != "parent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only parents can view session summaries",
        )

    summary = await generate_session_summary(req)
    return {"summary": summary}
