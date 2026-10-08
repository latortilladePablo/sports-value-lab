#!/usr/bin/env python3
"""Free, bounded sports headline watch. No LLM/API keys/odds calls."""
import json, os, re, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

QUERIES = {
 "nba": '"NBA" (injury OR out OR doubtful OR lineup OR starter)',
 "nfl": '"NFL" (injury OR quarterback OR inactive OR weather)',
 "nhl": '"NHL" (goalie OR injury OR scratch OR lineup)',
 "soccer": '(soccer OR football) (injury OR suspended OR lineup OR withdrawn)',
 "tennis": '(ATP OR WTA) (withdrawal OR injury OR retired OR walkover)',
}
SIGNALS = {
 "nba": r"\binjur|\bout\b|\bdoubtful\b|lineup|starter|suspend",
 "nfl": r"\binjur|quarterback|inactive|weather|ruled out|concussion",
 "nhl": r"goalie|goaltender|\binjur|scratch|lineup",
 "soccer": r"\binjur|suspend|lineup|ruled out|\bout\b|withdraw",
 "tennis": r"withdraw|\binjur|retire|walkover",
}
def read_feed(q):
 url="https://news.google.com/rss/search?q="+urllib.parse.quote(q)+"&hl=en-US&gl=US&ceid=US:en"
 req=urllib.request.Request(url,headers={"User-Agent":"SVL-NewsWatch/1.0"})
 with urllib.request.urlopen(req,timeout=14) as res:
  body=res.read(2_000_000)
 root=ET.fromstring(body)
 result=[]
 for item in root.findall(".//channel/item")[:30]:
  title=item.findtext("title","").strip()
  link=item.findtext("link","").strip()
  when=item.findtext("pubDate","")
  try: published=parsedate_to_datetime(when).astimezone(timezone.utc)
  except (ValueError,TypeError): continue
  age=(datetime.now(timezone.utc)-published).total_seconds()
  if not 0<=age<=36*3600 or not link.startswith("https://"):continue
  result.append({"title":title,"url":link,"published_at":published.isoformat()})
 return result

def main():
 now=datetime.now(timezone.utc)
 output={"schema_version":1,"checked_at_utc":now.isoformat(),"method":"Google News RSS headline screening (unverified)","sports":{}}
 for sport,query in QUERIES.items():
  try:
   articles=read_feed(query)
   matches=[r for r in articles if re.search(SIGNALS[sport],r["title"],re.I)]
   unique={r["url"]:r for r in matches}
   output["sports"][sport]={"status":"HEADLINES_UNVERIFIED" if unique else "NO_SIGNALS_IN_FEED",
    "articles":list(unique.values())[:8],"note":"Headlines are leads, not confirmed team news or P2 FORCE triggers."}
  except Exception as ex:
   output["sports"][sport]={"status":"SOURCE_ERROR","articles":[],"error":type(ex).__name__}
 os.makedirs("public",exist_ok=True)
 with open("public/news-watch.json","w") as f:json.dump(output,f,indent=2,ensure_ascii=False)
 print({k:len(v["articles"]) for k,v in output["sports"].items()})
if __name__=="__main__":main()
