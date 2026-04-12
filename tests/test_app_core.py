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
