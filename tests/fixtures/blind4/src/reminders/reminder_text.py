def format_reminder(name: str, start: str) -> str:
    """Build the reminder message with the patient name and the local time."""
    day, time = start.split("T")
    return f"Hello {name}, your appointment is on {day} at {time}."
