import importlib.util
import io
import unittest
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("news_watch", "scripts/news_watch.py")
news = importlib.util.module_from_spec(spec)
spec.loader.exec_module(news)

class FakeResponse:
    def __init__(self, xml):
        self.xml = xml.encode("utf-8")
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self, length): return self.xml[:length]

def feed(items):
    return "<rss><channel>" + "".join(
        "<item><title>" + title + "</title><link>" + url +
        "</link><pubDate>" + date + "</pubDate></item>"
        for title, url, date in items
    ) + "</channel></rss>"

class NewsWatchTests(unittest.TestCase):
    def test_fresh_items_kept_and_old_rejected(self):
        new = format_datetime(datetime.now(timezone.utc) - timedelta(hours=1))
        old = format_datetime(datetime.now(timezone.utc) - timedelta(days=3))
        xml = feed([("NHL goalie change","https://example.org/new",new),
                    ("NHL injury old","https://example.org/old",old)])
        with patch.object(news.urllib.request,"urlopen",return_value=FakeResponse(xml)):
            items=news.read_feed("NHL")
        self.assertEqual(len(items),1)
        self.assertEqual(items[0]["url"],"https://example.org/new")

    def test_insecure_links_filtered(self):
        now = format_datetime(datetime.now(timezone.utc))
        with patch.object(news.urllib.request,"urlopen",return_value=FakeResponse(feed(
            [("NFL injury","http://example.org/no",now)
        ))):
            self.assertEqual(news.read_feed("NFL"),[])

    def test_signal_filter_does_not_call_odds_or_model(self):
        self.assertIsNotNone(news.re.search(news.SIGNALS["tennis"],"ATP player withdrawal",news.re.I))
        self.assertIsNone(news.re.search(news.SIGNALS["tennis"],"ATP final match score",news.re.I))
        self.assertEqual(set(news.QUERIES),{"nba","nfl","nhl","tennis","soccer"})

    def test_invalid_xml_raises_so_monitor_can_mark_source_error(self):
        with patch.object(news.urllib.request,"urlopen",return_value=FakeResponse("<broken")):
            with self.assertRaises(news.ET.ParseError):
                news.read_feed("NBA")

if __name__ == "__main__":
    unittest.main()
