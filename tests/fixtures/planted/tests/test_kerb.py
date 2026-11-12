# kerb-style/R1.1
def test_kerb_sheet_is_flat():
    with open("src/kerb.css", encoding="utf-8") as sheet:
        text = sheet.read()
    assert "gradient" not in text
