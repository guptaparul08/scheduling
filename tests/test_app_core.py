import json
from pathlib import Path

import quickjs


ROOT = Path(__file__).resolve().parents[1]


def make_context():
    context = quickjs.Context()
    context.eval((ROOT / "app-core.js").read_text())
    return context


def eval_json(context, expression):
    return json.loads(context.eval(f"JSON.stringify({expression})"))


def test_parse_csv_rows_handles_quotes_and_newlines():
    context = make_context()
    csv_text = 'name,note\n"Evening Reset","Line one\nLine two, still same cell"'
    rows = eval_json(context, f"RitualFlowCore.parseCsvRows({json.dumps(csv_text)})")

    assert rows == [
        ["name", "note"],
        ["Evening Reset", "Line one\nLine two, still same cell"],
    ]


def test_parse_ritual_csv_builds_rituals_and_items():
    context = make_context()
    csv_text = (
        "name,note,active,days,items\n"
        '"Morning, Ritual","Home","yes","Mon, Wed","Tea | Journal"\n'
        '"Evening Reset","Night","no","Sun","Tidy | Plan"'
    )

    context.eval(
        """
        var nextId = 1;
        function testIdFactory() {
          return "id-" + (nextId++);
        }
        """
    )
    rituals = eval_json(
        context,
        f"RitualFlowCore.parseRitualCsv({json.dumps(csv_text)}, testIdFactory)",
    )

    assert [ritual["name"] for ritual in rituals] == ["Morning, Ritual", "Evening Reset"]
    assert rituals[0]["days"] == [1, 3]
    assert [item["label"] for item in rituals[0]["items"]] == ["Tea", "Journal"]
    assert rituals[1]["isActive"] is False


def test_parse_ritual_csv_skips_rows_missing_days_or_items():
    context = make_context()
    csv_text = (
        "name,note,active,days,items\n"
        '"Valid","Note","yes","Fri","One | Two"\n'
        '"No Days","Note","yes","","One"\n'
        '"No Items","Note","yes","Mon",""'
    )

    context.eval(
        """
        var nextId = 1;
        function testIdFactory() {
          return "seed-" + (nextId++);
        }
        """
    )
    rituals = eval_json(
        context,
        f"RitualFlowCore.parseRitualCsv({json.dumps(csv_text)}, testIdFactory)",
    )

    assert len(rituals) == 1
    assert rituals[0]["name"] == "Valid"


def test_parse_ritual_csv_supports_optional_item_day_overrides():
    context = make_context()
    csv_text = (
        "name,note,active,days,items,item_days\n"
        '"Morning","Home","yes","Mon, Tue, Wed","Tea | Journal | Stretch","inherit | Mon, Wed | Tue"\n'
    )

    context.eval(
        """
        var nextId = 1;
        function testIdFactory() {
          return "item-" + (nextId++);
        }
        """
    )
    rituals = eval_json(
        context,
        f"RitualFlowCore.parseRitualCsv({json.dumps(csv_text)}, testIdFactory)",
    )

    assert rituals[0]["items"][0].get("days") is None
    assert rituals[0]["items"][1]["days"] == [1, 3]
    assert rituals[0]["items"][2]["days"] == [2]


def test_escape_csv_escapes_quotes():
    context = make_context()
    escaped = context.eval('RitualFlowCore.escapeCsv(\'He said "hello"\')')

    assert escaped == '"He said ""hello"""'


def test_reorder_items_moves_item_without_mutating_source():
    context = make_context()
    reordered = eval_json(
        context,
        'RitualFlowCore.reorderItems(["a", "b", "c", "d"], 1, 3)',
    )
    original = eval_json(
        context,
        '["a", "b", "c", "d"]',
    )

    assert reordered == ["a", "c", "d", "b"]
    assert original == ["a", "b", "c", "d"]


def test_persisted_snapshot_splits_syncable_and_device_state():
    context = make_context()
    snapshot = eval_json(
        context,
        """
        RitualFlowCore.createPersistedSnapshot(
          {
            screen: "plans",
            isFormOpen: true,
            todayView: "simple",
            plansView: "this-week",
            themePreference: "dark",
            lastViewedDate: "2026-05-02",
            rituals: [{ id: "r1", name: "Morning" }],
            plans: { backlog: [{ id: "p1" }], thisWeek: [] },
            completions: { "2026-05-02": { r1: { i1: true } } },
            expandedRitualIds: { r1: true },
            draftItems: [{ id: "i1", label: "Tea" }],
            draftDays: [1, 3]
          },
          {
            googleClientId: "client-id.apps.googleusercontent.com",
            lastSyncedAt: "2026-05-02T15:30:00.000Z"
          }
        )
        """,
    )

    assert snapshot["syncable"] == {
        "screen": "plans",
        "rituals": [{"id": "r1", "name": "Morning", "note": "", "isActive": True, "days": [], "items": []}],
        "plans": {"backlog": [{"id": "p1"}], "thisWeek": []},
        "completions": {"2026-05-02": {"r1": {"i1": True}}},
        "todayView": "simple",
        "plansView": "this-week",
        "themePreference": "dark",
    }
    assert snapshot["device"] == {
        "isFormOpen": True,
        "lastViewedDate": "2026-05-02",
        "expandedRitualIds": {"r1": True},
        "draftItems": [{"id": "i1", "label": "Tea"}],
        "draftDays": [1, 3],
    }
    assert snapshot["cloud"]["googleClientId"] == "client-id.apps.googleusercontent.com"


def test_build_structure_and_progress_state_split_sync_concerns():
    context = make_context()
    structure_state = eval_json(
        context,
        """
        RitualFlowCore.buildStructureState({
          screen: "plans",
          rituals: [{ id: "r1", name: "Morning" }],
          plans: { backlog: [{ id: "p1" }], thisWeek: [] },
          completions: { "2026-05-02": { r1: { i1: true } } },
          todayView: "simple",
          plansView: "this-week",
          themePreference: "dark"
        })
        """,
    )
    progress_state = eval_json(
        context,
        """
        RitualFlowCore.buildProgressState({
          screen: "plans",
          rituals: [{ id: "r1", name: "Morning" }],
          plans: { backlog: [{ id: "p1" }], thisWeek: [] },
          completions: { "2026-05-02": { r1: { i1: true } } },
          todayView: "simple",
          plansView: "this-week",
          themePreference: "dark"
        })
        """,
    )

    assert "completions" not in structure_state
    assert structure_state["rituals"] == [{"id": "r1", "name": "Morning", "note": "", "isActive": True, "days": [], "items": []}]
    assert progress_state == {"completions": {"2026-05-02": {"r1": {"i1": True}}}}


def test_hydrate_persisted_state_supports_new_snapshot_shape():
    context = make_context()
    restored = eval_json(
        context,
        """
        RitualFlowCore.hydratePersistedState(
          {
            syncable: {
              screen: "settings",
              rituals: [{ id: "r9", name: "Night" }],
              plans: { backlog: [], thisWeek: [{ id: "p3" }] },
              completions: {},
              todayView: "simple",
              plansView: "this-week",
              themePreference: "dark"
            },
            device: {
              isFormOpen: true,
              lastViewedDate: "2026-05-02",
              expandedRitualIds: { r9: false },
              draftItems: [{ id: "i3", label: "Read" }],
              draftDays: [0, 6]
            }
          },
          {
            screen: "today",
            isFormOpen: false,
            todayView: "checklist",
            plansView: "backlog",
            themePreference: "system",
            lastViewedDate: "",
            rituals: [],
            plans: { backlog: [], thisWeek: [] },
            completions: {},
            expandedRitualIds: {},
            draftItems: [],
            draftDays: []
          }
        )
        """,
    )

    assert restored["screen"] == "settings"
    assert restored["rituals"] == [{"id": "r9", "name": "Night", "note": "", "isActive": True, "days": [], "items": []}]
    assert restored["plans"]["thisWeek"] == [{"id": "p3"}]
    assert restored["themePreference"] == "dark"
    assert restored["isFormOpen"] is True
    assert restored["draftDays"] == [0, 6]


def test_hydrate_persisted_state_supports_legacy_flat_snapshot():
    context = make_context()
    restored = eval_json(
        context,
        """
        RitualFlowCore.hydratePersistedState(
          {
            screen: "plans",
            rituals: [{ id: "legacy", name: "Legacy" }],
            plansView: "this-week",
            isFormOpen: true
          },
          {
            screen: "today",
            isFormOpen: false,
            todayView: "checklist",
            plansView: "backlog",
            themePreference: "system",
            lastViewedDate: "",
            rituals: [],
            plans: { backlog: [], thisWeek: [] },
            completions: {},
            expandedRitualIds: {},
            draftItems: [],
            draftDays: []
          }
        )
        """,
    )

    assert restored["screen"] == "plans"
    assert restored["rituals"] == [{"id": "legacy", "name": "Legacy", "note": "", "isActive": True, "days": [], "items": []}]
    assert restored["plansView"] == "this-week"
    assert restored["isFormOpen"] is True


def test_create_sync_envelope_and_apply_sync_envelope_round_trip():
    context = make_context()
    envelope = eval_json(
        context,
        """
        RitualFlowCore.createSyncEnvelope(
          {
            screen: "plans",
            isFormOpen: true,
            todayView: "simple",
            plansView: "backlog",
            themePreference: "light",
            lastViewedDate: "2026-05-02",
            rituals: [{ id: "r1", name: "Morning" }],
            plans: { backlog: [{ id: "p1" }], thisWeek: [] },
            completions: { "2026-05-02": { r1: { i1: true } } },
            expandedRitualIds: { r1: true },
            draftItems: [{ id: "i1", label: "Tea" }],
            draftDays: [1]
          },
          "2026-05-02T18:20:00.000Z",
          4
        )
        """,
    )
    applied = eval_json(
        context,
        f"""
        RitualFlowCore.applySyncEnvelope(
          {{
            screen: "today",
            isFormOpen: false,
            todayView: "checklist",
            plansView: "backlog",
            themePreference: "system",
            lastViewedDate: "",
            rituals: [],
            plans: {{ backlog: [], thisWeek: [] }},
            completions: {{}},
            expandedRitualIds: {{}},
            draftItems: [],
            draftDays: []
          }},
          {json.dumps(envelope)}
        )
        """,
    )

    assert envelope["updatedAt"] == "2026-05-02T18:20:00.000Z"
    assert envelope["version"] == 4
    assert envelope["state"]["screen"] == "plans"
    assert "draftItems" not in envelope["state"]
    assert applied["screen"] == "plans"
    assert applied["rituals"] == [{"id": "r1", "name": "Morning", "note": "", "isActive": True, "days": [], "items": []}]
    assert applied["themePreference"] == "light"
    assert applied["isFormOpen"] is False
    assert applied["draftItems"] == []


def test_structure_and_progress_sync_envelopes_apply_only_their_slice():
    context = make_context()
    structure_applied = eval_json(
        context,
        """
        RitualFlowCore.applyStructureSyncEnvelope(
          {
            screen: "today",
            rituals: [{ id: "local", name: "Local" }],
            plans: { backlog: [], thisWeek: [] },
            completions: { "2026-05-02": { local: { i1: true } } },
            todayView: "checklist",
            plansView: "backlog",
            themePreference: "system"
          },
          {
            updatedAt: "2026-05-03T00:00:00.000Z",
            state: {
              screen: "plans",
              rituals: [{ id: "remote", name: "Remote" }],
              plans: { backlog: [{ id: "p1" }], thisWeek: [] },
              completions: { "2026-05-03": { remote: { i2: true } } },
              todayView: "simple",
              plansView: "this-week",
              themePreference: "dark"
            }
          }
        )
        """,
    )
    progress_applied = eval_json(
        context,
        """
        RitualFlowCore.applyProgressSyncEnvelope(
          {
            screen: "today",
            rituals: [{ id: "local", name: "Local" }],
            plans: { backlog: [], thisWeek: [] },
            completions: { "2026-05-02": { local: { i1: true } } },
            todayView: "checklist",
            plansView: "backlog",
            themePreference: "system"
          },
          {
            updatedAt: "2026-05-03T00:00:00.000Z",
            state: {
              screen: "plans",
              rituals: [{ id: "remote", name: "Remote" }],
              plans: { backlog: [{ id: "p1" }], thisWeek: [] },
              completions: { "2026-05-03": { remote: { i2: true } } },
              todayView: "simple",
              plansView: "this-week",
              themePreference: "dark"
            }
          }
        )
        """,
    )

    assert structure_applied["screen"] == "plans"
    assert structure_applied["rituals"] == [{"id": "remote", "name": "Remote", "note": "", "isActive": True, "days": [], "items": []}]
    assert structure_applied["completions"] == {"2026-05-02": {"local": {"i1": True}}}
    assert progress_applied["screen"] == "today"
    assert progress_applied["rituals"] == [{"id": "local", "name": "Local", "note": "", "isActive": True, "days": [], "items": []}]
    assert progress_applied["completions"] == {"2026-05-03": {"remote": {"i2": True}}}


def test_get_ritual_items_for_day_uses_item_overrides_and_inheritance():
    context = make_context()
    items_for_tuesday = eval_json(
        context,
        """
        RitualFlowCore.getRitualItemsForDay(
          {
            days: [1, 2, 3],
            items: [
              { id: "i1", label: "Tea" },
              { id: "i2", label: "Journal", days: [1, 3] },
              { id: "i3", label: "Stretch", days: [2] }
            ]
          },
          2
        )
        """,
    )

    assert [item["label"] for item in items_for_tuesday] == ["Tea", "Stretch"]


def test_decide_sync_direction_prefers_newer_or_missing_remote_state():
    context = make_context()
    upload_when_remote_missing = context.eval(
        """
        RitualFlowCore.decideSyncDirection(
          {
            updatedAt: "2026-05-02T18:20:00.000Z",
            state: { screen: "today" }
          },
          null
        )
        """
    )
    download_when_remote_newer = context.eval(
        """
        RitualFlowCore.decideSyncDirection(
          {
            updatedAt: "2026-05-02T18:20:00.000Z",
            state: { screen: "today" }
          },
          {
            updatedAt: "2026-05-02T18:30:00.000Z",
            state: { screen: "plans" }
          }
        )
        """
    )
    noop_when_same = context.eval(
        """
        RitualFlowCore.decideSyncDirection(
          {
            updatedAt: "2026-05-02T18:30:00.000Z",
            state: { screen: "plans" }
          },
          {
            updatedAt: "2026-05-02T18:30:00.000Z",
            state: { screen: "plans" }
          }
        )
        """
    )

    assert upload_when_remote_missing == "upload"
    assert download_when_remote_newer == "download"
    assert noop_when_same == "noop"


def test_decide_sync_direction_prefers_higher_version_before_timestamp():
    context = make_context()
    download_when_remote_version_is_higher = context.eval(
        """
        RitualFlowCore.decideSyncDirection(
          {
            updatedAt: "2026-05-03T18:30:00.000Z",
            version: 2,
            state: { screen: "today" }
          },
          {
            updatedAt: "2026-05-03T18:20:00.000Z",
            version: 3,
            state: { screen: "plans" }
          }
        )
        """
    )
    upload_when_local_version_is_higher = context.eval(
        """
        RitualFlowCore.decideSyncDirection(
          {
            updatedAt: "2026-05-03T18:20:00.000Z",
            version: 5,
            state: { screen: "today" }
          },
          {
            updatedAt: "2026-05-03T18:30:00.000Z",
            version: 4,
            state: { screen: "plans" }
          }
        )
        """
    )

    assert download_when_remote_version_is_higher == "download"
    assert upload_when_local_version_is_higher == "upload"
