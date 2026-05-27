from app import runs
from app.protocols import get_protocol


def _ids(run):
    return [s.step_id for s in sorted(run.steps, key=lambda s: s.position)]


def _statuses(run):
    return {s.step_id: s.status for s in sorted(run.steps, key=lambda s: s.position)}


def test_growth_curve_loops_until_mid_log(db_session):
    proto = get_protocol("growth_curve")
    run = runs.create_run(db_session, proto.id, name="test run")

    assert _ids(run) == ["inoculate", "measure_od", "harvest"]

    runs.complete_step(db_session, run, "inoculate", {"starting_od": 0.02}, None, False)

    # Low OD — should insert wait_60_min + another measure_od.
    runs.complete_step(db_session, run, "measure_od", {"od600": 0.1}, None, False)
    assert _ids(run) == [
        "inoculate", "measure_od", "wait_60_min", "measure_od", "harvest",
    ]

    # Mid-range — wait 30 then measure again.
    runs.complete_step(db_session, run, "measure_od", {"od600": 0.3}, None, False)
    assert _ids(run) == [
        "inoculate", "measure_od", "wait_60_min", "measure_od",
        "wait_30_min", "measure_od", "harvest",
    ]

    # We still need to walk the inserted wait step.
    runs.complete_step(db_session, run, "wait_60_min", {}, None, False)
    runs.complete_step(db_session, run, "wait_30_min", {}, None, False)

    # Reached target — should skip nothing extra and proceed to harvest.
    runs.complete_step(db_session, run, "measure_od", {"od600": 0.6}, None, False)
    runs.complete_step(db_session, run, "harvest", {}, None, False)

    assert run.status == "complete"


def test_transformation_branches_on_colony_count(db_session):
    proto = get_protocol("bacterial_transformation")
    run = runs.create_run(db_session, proto.id, name="t1")

    for step_id in ["thaw_cells", "add_dna", "incubate_ice", "heat_shock", "recover", "plate"]:
        results = {"dna_ng": 50} if step_id == "add_dna" else {}
        runs.complete_step(db_session, run, step_id, results, None, False)

    runs.complete_step(
        db_session, run, "count_colonies",
        {"colony_count": 3, "contamination": False},
        None, False,
    )

    ids = _ids(run)
    assert "replate_more_volume" in ids
    # pick_colonies should still be pending (rule was insert_after, not skip_to)
    assert _statuses(run)["pick_colonies"] == "pending"


def test_benchling_sync_creates_entry(db_session):
    proto = get_protocol("growth_curve")
    run = runs.create_run(db_session, proto.id, name="sync test")
    runs.complete_step(db_session, run, "inoculate", {"starting_od": 0.05}, None, False)

    entry_id, web_url = runs.sync_to_benchling(db_session, run)
    assert entry_id.startswith("etr_")
    assert web_url and web_url.startswith("https://mock.benchling.com/")
    assert run.benchling_entry_id == entry_id

    # Second sync updates the existing entry rather than creating a new one.
    entry_id_2, _ = runs.sync_to_benchling(db_session, run)
    assert entry_id_2 == entry_id
