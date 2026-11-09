import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src" / "reminders"))

from reminder_text import format_reminder


def test_message_names_patient_and_local_time():
    text = format_reminder("Ada", "2026-03-02T09:30")
    assert "Ada" in text
    assert "09:30" in text
