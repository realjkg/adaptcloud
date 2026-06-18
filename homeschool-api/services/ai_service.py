import anthropic
import json
from typing import AsyncIterator, List
from models.schemas import (
    SessionConfig,
    Subject,
    ChatMessage,
    GradeStage,
    SUBJECT_LABELS,
    SessionSummaryRequest,
)
from core.config import settings


# Agentic tools the tutor can invoke during a session
TUTOR_TOOLS = [
    {
        "name": "request_narration",
        "description": (
            "Prompt the child to narrate (tell back in their own words) what they just learned. "
            "Use this after a discovery moment. Charlotte Mason narration builds memory and comprehension."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "The narration invitation, e.g. 'Tell me everything you remember about...'",
                }
            },
            "required": ["prompt"],
        },
    },
    {
        "name": "offer_socratic_hint",
        "description": (
            "Give a gentle Socratic hint when a child is stuck — never the answer, "
            "always a question or analogy that points them toward discovery."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "hint_question": {
                    "type": "string",
                    "description": "A guiding question that helps without giving away the answer",
                },
                "analogy": {
                    "type": "string",
                    "description": "Optional real-world analogy to make the concept concrete",
                },
            },
            "required": ["hint_question"],
        },
    },
    {
        "name": "celebrate_discovery",
        "description": (
            "Celebrate a specific insight the child just made. "
            "Specific praise ('I noticed you connected X to Y') beats generic praise ('good job')."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "specific_insight": {
                    "type": "string",
                    "description": "The exact thing the child discovered or reasoned well",
                },
                "encouragement": {
                    "type": "string",
                    "description": "Warm, specific encouragement connecting to their growth",
                },
            },
            "required": ["specific_insight", "encouragement"],
        },
    },
    {
        "name": "connect_to_faith",
        "description": (
            "Weave a natural, non-forced connection between the lesson content and Christian faith, "
            "wonder at creation, or biblical wisdom. Keep it brief and genuine."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "connection": {
                    "type": "string",
                    "description": "The faith connection or wonder-at-creation moment",
                },
                "reflection_question": {
                    "type": "string",
                    "description": "A question inviting the child to reflect on God's design",
                },
            },
            "required": ["connection"],
        },
    },
]


def _build_system_prompt(config: SessionConfig, subject: Subject) -> str:
    stage_guidance = {
        GradeStage.foundations: (
            "This child is in the Grammar Stage (K-2). Use very simple language, short sentences, "
            "lots of pictures with words, stories, rhymes, and playful questions. "
            "Lessons should feel like adventure and play. Attention span is short — keep it lively!"
        ),
        GradeStage.core_mastery: (
            "This child is in the Logic Stage (grades 3-5). They can handle cause-and-effect thinking, "
            "categorizing, and 'why' questions. Encourage them to find patterns, make connections, "
            "and begin to form their own opinions backed by reasons."
        ),
        GradeStage.independent: (
            "This child is in the Rhetoric Stage (grades 6-8). They are ready for Socratic debate, "
            "persuasive arguments, nuanced analysis, and real-world application. "
            "Challenge them to defend their thinking, consider opposing views, and synthesize ideas."
        ),
    }

    subject_context = {
        Subject.morning_time: (
            "This is Morning Time — the heart of the Charlotte Mason day. "
            "Open with warmth and wonder. Touch on Scripture, a hymn, or poetry. "
            "Set a joyful, expectant tone for the day."
        ),
        Subject.living_books: (
            "You are guiding a Living Books session. Charlotte Mason believed children should "
            "encounter ideas through real books written by real people with passion, not dry textbooks. "
            "Ask questions about the story, characters, themes, and ideas. Invite narration."
        ),
        Subject.mathematics: (
            "Math session. Use discovery-based questioning — never show the algorithm first. "
            "Ask the child to figure out patterns, use manipulatives in imagination, "
            "and reason through problems step by step. Math should develop logical thinking."
        ),
        Subject.nature_study: (
            "Nature Study session. Charlotte Mason believed in unhurried observation of the real world. "
            "Invite the child to describe, wonder, hypothesize, and connect to God's design in creation. "
            "Ask them to imagine they are a naturalist making a discovery."
        ),
        Subject.history: (
            "History & Geography session. Use the story of history — real people, real choices, real consequences. "
            "Ask: 'Why do you think they chose that?' and 'What would YOU have done?' "
            "Connect past to present and to the child's own life."
        ),
        Subject.language_arts: (
            "Language Arts session. Focus on narration (oral or written), copywork discussion, "
            "and grammar through real usage. Ask the child to tell back, re-tell from a different "
            "character's view, or explain what makes a sentence powerful."
        ),
        Subject.free_study: (
            "Free Study time. The child leads. Ask what they are curious about and follow their interest. "
            "Socratic questions still apply — help them think deeper about whatever they choose."
        ),
    }

    faith_note = ""
    if config.faith_emphasis:
        faith_note = f"\nToday's faith focus: {config.faith_emphasis}"

    lesson_note = ""
    if config.lesson_focus:
        lesson_note = f"\nParent's note for today: {config.lesson_focus}"

    unit_note = ""
    if config.current_unit:
        unit_note = f"\nCurrent unit of study: {config.current_unit}"

    return f"""You are Sage — a warm, wise, and patient Socratic tutor following the Charlotte Mason educational philosophy. You are tutoring {config.student_name}, a {config.grade}th-grade student.

{stage_guidance[config.grade_stage]}

CURRENT SUBJECT: {SUBJECT_LABELS[subject]}
{subject_context[subject]}{faith_note}{lesson_note}{unit_note}

SACRED RULES — never break these:
1. NEVER give the answer directly. Always respond to a question with a guiding question.
2. Keep every response UNDER 120 words — short lessons, frequent engagement.
3. End EVERY response with exactly one question that invites the child to think further.
4. Celebrate effort and specific reasoning, not just correct answers.
5. If the child is frustrated, slow down and use a gentler analogy — never lecture.
6. Weave faith naturally (wonder at creation, gratitude, virtue) — never preachy.
7. Use the child's name ({config.student_name}) naturally in conversation.
8. Speak to them as a capable, interesting person — Charlotte Mason: "children are born persons."

You have access to tools: use `request_narration` after learning moments, `offer_socratic_hint` when stuck, `celebrate_discovery` for breakthroughs, and `connect_to_faith` when it fits naturally.

Remember: your goal is to kindle delight in learning, not to transfer information. The child who discovers is the child who remembers."""


def _process_tool_use(tool_name: str, tool_input: dict) -> str:
    """Convert tool calls into natural tutor responses."""
    if tool_name == "request_narration":
        return f"📖 *Narration Time* — {tool_input['prompt']}"

    if tool_name == "offer_socratic_hint":
        hint = tool_input["hint_question"]
        analogy = tool_input.get("analogy", "")
        if analogy:
            return f"🔍 Here's a thought to try: {analogy} ... so with that in mind — {hint}"
        return f"🔍 Let me ask it this way: {hint}"

    if tool_name == "celebrate_discovery":
        insight = tool_input["specific_insight"]
        encouragement = tool_input["encouragement"]
        return f"✨ {encouragement} I noticed you saw that {insight} — that's genuine thinking!"

    if tool_name == "connect_to_faith":
        connection = tool_input["connection"]
        reflection = tool_input.get("reflection_question", "")
        if reflection:
            return f"🌿 {connection} {reflection}"
        return f"🌿 {connection}"

    return ""


async def stream_tutor_response(
    config: SessionConfig,
    subject: Subject,
    history: List[ChatMessage],
    child_message: str,
) -> AsyncIterator[str]:
    """
    Stream the Socratic tutor response token by token using Claude Sonnet.
    Uses agentic tool calls when appropriate (narration, hints, celebration, faith).
    """
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    messages = [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": child_message})

    system_prompt = _build_system_prompt(config, subject)

    with client.messages.stream(
        model=settings.tutor_model,
        max_tokens=400,  # Keep responses tight — Charlotte Mason lesson brevity
        system=system_prompt,
        messages=messages,
        tools=TUTOR_TOOLS,
    ) as stream:
        tool_calls_buffer = {}

        for event in stream:
            event_type = type(event).__name__

            if event_type == "ContentBlockStart":
                block = event.content_block
                if hasattr(block, "type"):
                    if block.type == "tool_use":
                        tool_calls_buffer[block.id] = {
                            "name": block.name,
                            "input_str": "",
                        }

            elif event_type == "ContentBlockDelta":
                delta = event.delta
                delta_type = type(delta).__name__

                if delta_type == "TextDelta":
                    yield f"data: {json.dumps({'type': 'text', 'content': delta.text})}\n\n"

                elif delta_type == "InputJsonDelta":
                    # Accumulate tool input JSON
                    block_id = None
                    for bid, tc in tool_calls_buffer.items():
                        block_id = bid
                    if block_id:
                        tool_calls_buffer[block_id]["input_str"] += delta.partial_json

            elif event_type == "ContentBlockStop":
                # Emit completed tool call as a formatted response
                for block_id, tc in list(tool_calls_buffer.items()):
                    if tc["input_str"]:
                        try:
                            tool_input = json.loads(tc["input_str"])
                            tool_response = _process_tool_use(tc["name"], tool_input)
                            if tool_response:
                                yield f"data: {json.dumps({'type': 'tool', 'tool': tc['name'], 'content': tool_response})}\n\n"
                        except json.JSONDecodeError:
                            pass
                        tool_calls_buffer.pop(block_id, None)

        yield f"data: {json.dumps({'type': 'done'})}\n\n"


async def generate_session_summary(req: SessionSummaryRequest) -> str:
    """
    Generate a parent-facing session summary using the faster Haiku model.
    Lists what was covered, narrations recorded, and suggested follow-up.
    """
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    conversation_text = "\n".join(
        f"{m.role.upper()}: {m.content}" for m in req.conversation_history[-40:]
    )

    subjects_done = ", ".join(
        s.value.replace("_", " ").title() for s in req.subjects_completed
    )

    prompt = f"""You are summarizing a {req.duration_minutes}-minute homeschool session for the parent.

Student: {req.session_config.student_name} (Grade {req.session_config.grade})
Subjects covered: {subjects_done}
Faith focus: {req.session_config.faith_emphasis or 'general'}
Current unit: {req.session_config.current_unit or 'not specified'}

Session transcript (last 40 exchanges):
{conversation_text}

Write a parent summary with these sections:
1. **Session Highlights** (2-3 bullet points of genuine learning moments)
2. **Narrations** (what the child demonstrated understanding of)
3. **Areas to Revisit** (where the child seemed uncertain — be encouraging not critical)
4. **Tomorrow's Springboard** (one concrete suggestion to build on today's momentum)
5. **Virtue Observed** (one character quality the child showed today)

Keep it warm, specific, and under 300 words. Address the parent directly."""

    response = client.messages.create(
        model=settings.session_model,
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )

    return response.content[0].text
