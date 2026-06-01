"""Anthropic-powered suggestion engine.

Takes a Note (title + blocks, optionally with images attached to step
blocks), sends it to Claude with a forced tool-use schema, and returns
a list of proposed edits the user can accept or dismiss individually.
"""

from __future__ import annotations

import base64
import re
from typing import Any

from anthropic import Anthropic

MODEL = "claude-sonnet-4-6"
MAX_IMAGES = 8  # API + payload sanity cap

SYSTEM_PROMPT = """You are a careful lab assistant. The user keeps a structured
lab-notebook note containing a title and an ordered list of blocks: free text
blocks and protocol step blocks. Some steps may have an image attached
(typically a gel photo, plate photo, microscopy image, or instrument readout
of their result).

Your job: based on what's in the note and the images, propose specific,
targeted edits to the protocol that would improve the next iteration or
react to the observed result. Be conservative — only suggest edits that
are clearly motivated by what you can see or by sound molecular-biology
practice. Don't propose edits just to look useful.

Always call the `suggest_edits` tool to return your output (even if you
have nothing to suggest — return an empty edits list with a short
summary explaining why). For each edit, include a brief rationale that
references the specific observation that motivates it.

Edit types:
- modify_step: change an existing step's title, description, or duration.
  Provide target_block_id.
- insert_step_after: insert a new step AFTER the step with target_block_id.
  Provide title (and optionally description/duration).
- append_step: append a new step to the end of the protocol.
  No target_block_id needed.
"""

SUGGEST_EDITS_TOOL: dict[str, Any] = {
    "name": "suggest_edits",
    "description": "Propose targeted edits to the user's protocol note.",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {
                "type": "string",
                "description": "1–2 sentence overview of what you observed and "
                               "why you're suggesting these edits (or why none).",
            },
            "edits": {
                "type": "array",
                "description": "Specific edits to apply. Empty list is fine if "
                               "no changes are warranted.",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["modify_step", "insert_step_after", "append_step"],
                        },
                        "target_block_id": {
                            "type": "string",
                            "description": "Required for modify_step and "
                                           "insert_step_after; the id of an "
                                           "existing step block.",
                        },
                        "title": {
                            "type": "string",
                            "description": "New step title.",
                        },
                        "description": {
                            "type": "string",
                            "description": "New step description (multi-line ok).",
                        },
                        "duration": {
                            "type": "string",
                            "description": "Estimated duration, e.g. '15 min'.",
                        },
                        "rationale": {
                            "type": "string",
                            "description": "Why this edit is suggested.",
                        },
                    },
                    "required": ["type", "rationale"],
                },
            },
        },
        "required": ["summary", "edits"],
    },
}


def _render_note_text(title: str, blocks: list[dict[str, Any]]) -> str:
    """Render the note as compact text for the model."""
    out = [f"# Note: {title or 'Untitled note'}", ""]
    if not blocks:
        out.append("(The note has no blocks yet.)")
        return "\n".join(out)
    for i, b in enumerate(blocks, start=1):
        kind = b.get("type")
        bid = b.get("id", "?")
        if kind == "text":
            content = (b.get("content") or "").strip()
            out.append(f"[{i}] text (id={bid}):")
            out.append(f"    {content or '(empty)'}")
        elif kind == "step":
            status = (b.get("status") or "pending").upper()
            title_ = b.get("title", "(untitled)")
            duration = b.get("duration")
            dur = f" — {duration}" if duration else ""
            out.append(f"[{i}] step (id={bid}) [{status}]: {title_}{dur}")
            desc = (b.get("description") or "").strip()
            if desc:
                for line in desc.splitlines():
                    out.append(f"    {line}")
            if b.get("image"):
                out.append("    [image attached — see following image block]")
        out.append("")
    return "\n".join(out)


_DATA_URI_RE = re.compile(r"^data:(image/(?:png|jpeg|jpg|gif|webp));base64,(.+)$")


def _parse_data_uri(uri: str) -> tuple[str, str] | None:
    """Return (media_type, base64_data) or None if the URI isn't usable."""
    m = _DATA_URI_RE.match(uri.strip())
    if not m:
        return None
    media_type = m.group(1)
    if media_type == "image/jpg":
        media_type = "image/jpeg"
    data = m.group(2)
    # Validate that it actually base64-decodes
    try:
        base64.b64decode(data, validate=True)
    except Exception:
        return None
    return media_type, data


def _build_content(title: str, blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build a single user message's content array.

    Text block first, then each step's image (with a short caption block
    so the model can correlate images to step ids).
    """
    parts: list[dict[str, Any]] = [
        {"type": "text", "text": _render_note_text(title, blocks)}
    ]
    images_added = 0
    for b in blocks:
        if b.get("type") != "step" or not b.get("image"):
            continue
        if images_added >= MAX_IMAGES:
            parts.append({
                "type": "text",
                "text": f"(more images omitted — capped at {MAX_IMAGES})",
            })
            break
        parsed = _parse_data_uri(b["image"])
        if not parsed:
            continue
        media_type, data = parsed
        bid = b.get("id", "?")
        title_ = b.get("title", "")
        parts.append({
            "type": "text",
            "text": f"Image for step id={bid} ({title_}):",
        })
        parts.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": data,
            },
        })
        images_added += 1
    return parts


def suggest_edits(
    *,
    api_key: str,
    title: str,
    blocks: list[dict[str, Any]],
) -> dict[str, Any]:
    """Call Anthropic and return the suggest_edits tool input as a dict."""
    client = Anthropic(api_key=api_key)
    content = _build_content(title, blocks)
    msg = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        tools=[SUGGEST_EDITS_TOOL],
        tool_choice={"type": "tool", "name": "suggest_edits"},
        messages=[{"role": "user", "content": content}],
    )
    for block in msg.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "suggest_edits":
            return dict(block.input)
    # Shouldn't happen with tool_choice forcing the tool.
    raise RuntimeError("model did not return a suggest_edits tool call")
