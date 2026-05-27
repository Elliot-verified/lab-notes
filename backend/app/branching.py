"""Evaluate branching rules against captured step results.

A rule looks like:

    when: "od600 < 0.4"
    then:
      insert_after: this           # or a specific step id
      steps: [incubate_longer]     # references into the protocol's step_library
      # or: skip_to: harvest
      # or: repeat: this
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from simpleeval import EvalWithCompoundTypes, InvalidExpression


@dataclass
class BranchAction:
    kind: str  # "insert_after" | "skip_to" | "repeat" | "end"
    target: str | None = None  # step id for insert_after / skip_to / repeat
    steps: list[str] | None = None  # step-library ids to insert


def evaluate_rules(
    rules: list[dict[str, Any]],
    results: dict[str, Any],
    current_step_id: str,
) -> BranchAction | None:
    """Return the first matching action, or None if no rule fires.

    `target=None` on insert_after / repeat means "the current step instance"
    — important when the run contains multiple instances of the same step id.
    """
    names = {"true": True, "false": False, **results}
    evaluator = EvalWithCompoundTypes(names=names)
    for rule in rules:
        expr = rule.get("when", "true")
        try:
            matched = bool(evaluator.eval(expr))
        except InvalidExpression as e:
            raise ValueError(f"invalid branching expression {expr!r}: {e}") from e
        if not matched:
            continue

        then = rule.get("then", {})
        if "insert_after" in then:
            raw = then["insert_after"]
            target = None if raw == "this" else raw
            return BranchAction(
                kind="insert_after",
                target=target,
                steps=list(then.get("steps", [])),
            )
        if "skip_to" in then:
            return BranchAction(kind="skip_to", target=then["skip_to"])
        if "repeat" in then:
            raw = then["repeat"]
            target = current_step_id if raw == "this" else raw
            return BranchAction(kind="repeat", target=target)
        if then.get("end"):
            return BranchAction(kind="end")
    return None
