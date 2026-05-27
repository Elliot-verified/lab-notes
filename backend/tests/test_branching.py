from app.branching import evaluate_rules


def test_first_matching_rule_wins():
    rules = [
        {"when": "x < 0.5", "then": {"skip_to": "early"}},
        {"when": "x < 1.0", "then": {"skip_to": "late"}},
    ]
    action = evaluate_rules(rules, {"x": 0.3}, current_step_id="s")
    assert action.kind == "skip_to"
    assert action.target == "early"


def test_no_match_returns_none():
    rules = [{"when": "x > 10", "then": {"end": True}}]
    assert evaluate_rules(rules, {"x": 1}, "s") is None


def test_this_resolves_to_current():
    rules = [{"when": "true", "then": {"insert_after": "this", "steps": ["a"]}}]
    action = evaluate_rules(rules, {}, current_step_id="measure")
    assert action.target is None  # sentinel: anchor on current instance
    assert action.steps == ["a"]


def test_repeat_action():
    rules = [{"when": "fail == True", "then": {"repeat": "this"}}]
    action = evaluate_rules(rules, {"fail": True}, current_step_id="pcr")
    assert action.kind == "repeat"
    assert action.target == "pcr"
