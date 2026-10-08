import importlib.util
import unittest
from datetime import datetime, timezone

spec = importlib.util.spec_from_file_location("validator","scripts/validate_news_watch.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def valid():
    return {"schema_version":1,"checked_at_utc":datetime.now(timezone.utc).isoformat(),
      "sports":{name:{"status":"NO_SIGNALS_IN_FEED","articles":[]} for name in
        ["nba","nfl","nhl","soccer","tennis"]}}

class SnapshotSchemaTests(unittest.TestCase):
    def test_valid(self): self.assertTrue(mod.validate(valid()))
    def test_missing_sport_fails(self):
        p=valid(); del p["sports"]["nfl"]
        with self.assertRaises(AssertionError): mod.validate(p)
    def test_unknown_schema_fails(self):
        p=valid(); p["schema_version"]=2
        with self.assertRaises(AssertionError): mod.validate(p)
    def test_error_cannot_claim_articles(self):
        p=valid(); p["sports"]["nhl"]={"status":"SOURCE_ERROR","articles":[{"title":"x","url":"https://example.org/x","published_at":datetime.now(timezone.utc).isoformat()}]}
        with self.assertRaises(AssertionError): mod.validate(p)
    def test_stale_snapshot_fails(self):
        p=valid(); p["checked_at_utc"]="2020-01-01T00:00:00+00:00"
        with self.assertRaises(AssertionError): mod.validate(p)

if __name__=="__main__": unittest.main()
