from fastapi import APIRouter, Depends, Request
from sse_starlette.sse import EventSourceResponse

from core.audit import AuditEvent, audit_from_request, log_event
from core.deps import require_auth, require_parent
from models.schemas import SessionSummaryRequest, TutorRequest
from services.ai_service import generate_session_summary, stream_tutor_response

router = APIRouter(prefix="/tutor", tags=["tutor"])


@router.post("/chat")
async def chat(
    req: TutorRequest,
    request: Request,
    auth: dict = Depends(require_auth),
):
    """
    Stream Socratic tutor responses via Server-Sent Events.
    Accessible to both parent and child tokens.
    """
    log_event(
        AuditEvent.TUTOR_CHAT,
        role=auth.get("role"),
        student_name=req.session_config.student_name,
        success=True,
        **audit_from_request(request),
    )

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
    request: Request,
    auth: dict = Depends(require_parent),   # parent only
):
    """Generate end-of-session parent report. Parent role required."""
    log_event(
        AuditEvent.SESSION_END,
        role="parent",
        student_name=req.session_config.student_name,
        detail=f"duration={req.duration_minutes}min",
        **audit_from_request(request),
    )
    summary = await generate_session_summary(req)
    return {"summary": summary}
