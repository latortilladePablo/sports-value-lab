#!/usr/bin/env python3
"""Fail closed on malformed or incomplete RSS snapshot before publishing."""
import json, sys
from datetime import datetime, timezone

EXPECTED = {"nba", "nhl", "nfl", "soccer", "tennis"}
STATUSES = {"HEADLINES_UNVERIFIED", "NO_SIGNALS_IN_FEED", "SOURCE_ERROR"}

def validate(data):
    assert data.get("schema_version") == 1, "schema_version mismatch"
    timestamp = datetime.fromisoformat(data["checked_at_utc"].replace("Z","+00:00"))
    assert timestamp.tzinfo is not None, "timestamp missing timezone"
    age = (datetime.now(timezone.utc) - timestamp).total_seconds()
    assert -120 <= age <= 900, "timestamp not recent"
    sports = data["sports"]
    assert set(sports) == EXPECTED, "missing or unexpected sport"
    for sport, row in sports.items():
        assert row["status"] in STATUSES, f"{sport}: invalid status"
        assert isinstance(row.get("articles"), list), f"{sport}: invalid articles"
        assert len(row["articles"]) <= 8, f"{sport}: excessive articles"
        for article in row["articles"]:
            assert isinstance(article.get("title"), str) and 0 < len(article["title"]) <= 500
            assert isinstance(article.get("url"), str) and article["url"].startswith("https://")
            dt = datetime.fromisoformat(article["published_at"].replace("Z","+00:00"))
            assert dt.tzinfo is not None
        if row["status"] == "SOURCE_ERROR":
            assert not row["articles"], f"{sport}: error with articles"
        if row["status"] == "NO_SIGNALS_IN_FEED":
            assert not row["articles"], f"{sport}: false no-signals"
    return True

if __name__ == "__main__":
    with open(sys.argv[1],encoding="utf-8") as f:
        validate(json.load(f))
    print("news-watch schema: PASS")
