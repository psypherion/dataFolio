# app/main.py
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Any, Dict, List, Optional, Tuple
import json, os, time, re, logging

from jsonschema import validate, ValidationError  # server-side schema validation
import requests  # HTTP fetch for blog pages
from requests.adapters import HTTPAdapter  # mount retries on Session
from urllib3.util.retry import Retry  # robust retry/backoff policy
from bs4 import BeautifulSoup  # parse Open Graph and fallbacks
from urllib.parse import urljoin  # resolve relative og:image, etc.

# ---------------- Paths ----------------
APP_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(APP_DIR)
DATA_PATH = os.environ.get("CONFIG_PATH", os.path.join(ROOT_DIR, "data", "projects-config.json"))
SCHEMA_PATH = os.path.join(APP_DIR, "schema.json")
DASHBOARD_DIR = os.path.join(ROOT_DIR, "dashboard")

# ---------------- App ----------------
app = FastAPI()  # [14]

# Serve dashboard
app.mount("/dashboard", StaticFiles(directory=DASHBOARD_DIR, html=True), name="dashboard")  # [14]

@app.get("/", include_in_schema=False)
def index():
    return FileResponse(os.path.join(DASHBOARD_DIR, "dashboard.html"))  # [14]

# ---------------- Config get/put ----------------
@app.get("/api/config")
def get_config():
    if not os.path.exists(DATA_PATH):
        return JSONResponse(content={
            "personalInfo": {},
            "navigation": [],
            "sidebar": {"updates": [], "skillsSections": [], "quickLinks": []},
            "projects": [],
            "blog": {"showOnHomepage": True, "mode": "manual", "cacheMinutes": 15, "manualPosts": [], "normalized": []}
        })  # [14]
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return JSONResponse(content=json.load(f))  # [14]

class ConfigPayload(BaseModel):
    data: Dict[str, Any]

@app.put("/api/config")
def put_config(payload: ConfigPayload):
    if not os.path.exists(SCHEMA_PATH):
        raise HTTPException(status_code=500, detail="Schema not found on server")  # [15]
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema = json.load(f)
    try:
        validate(instance=payload.data, schema=schema)  # [15]
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"Schema validation error: {e.message}")  # [15]
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    tmp_path = DATA_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload.data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, DATA_PATH)
    return {"status": "ok"}  # [14]

# ---------------- Blog preview/normalize (Open Graph) ----------------
# Cache: { url: (expires_epoch, data) }
BLOG_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}  # [11]
DEFAULT_TTL_SECONDS = 15 * 60  # [14]

log = logging.getLogger("blog")

# Hardened Session with retries
SESSION = requests.Session()  # [12]
retries = Retry(
    total=3,
    backoff_factor=0.5,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["GET", "HEAD"]
)  # [12]
SESSION.mount("http://", HTTPAdapter(max_retries=retries))  # [12]
SESSION.mount("https://", HTTPAdapter(max_retries=retries))  # [12]

REQ_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
}  # [12]

def _text_meta(soup: BeautifulSoup, name_or_prop: str) -> str:
    tag = soup.find("meta", attrs={"property": name_or_prop}) or soup.find("meta", attrs={"name": name_or_prop})
    if not tag:
        return ""
    return (tag.get("content") or "").strip()  # [16]

def _first_paragraph(soup: BeautifulSoup) -> str:
    for p in soup.select("article p, .post p, .section-content p, p"):
        t = p.get_text(" ", strip=True)
        if len(t) > 60:
            return t
    return ""  # [16]

def _parse_og(soup: BeautifulSoup, base_url: str) -> Dict[str, Any]:
    title = _text_meta(soup, "og:title")
    if not title and soup.title and soup.title.string:
        title = soup.title.string.strip()
    description = _text_meta(soup, "og:description") or _text_meta(soup, "description")
    image = _text_meta(soup, "og:image")
    if image:
        image = urljoin(base_url, image)
    date = _text_meta(soup, "article:published_time") or _text_meta(soup, "og:updated_time") or _text_meta(soup, "article:modified_time")
    tags = [m.get("content", "").strip() for m in soup.find_all("meta", attrs={"property": "article:tag"}) if m.get("content")]
    return {"title": title, "description": description, "image": image, "date": date, "tags": tags}  # [16]

def _estimate_read_minutes(text: str) -> int:
    words = re.findall(r"\w+", text or "")
    return max(1, round(len(words) / 200.0))  # [16]

def fetch_preview(url: str) -> Dict[str, Any]:
    r = SESSION.get(url, headers=REQ_HEADERS, timeout=15)
    if r.status_code >= 400:
        log.warning("Preview fetch failed %s for %s", r.status_code, url)
        raise HTTPException(status_code=502, detail=f"Upstream error {r.status_code}")
    try:
        soup = BeautifulSoup(r.text, "lxml")
    except Exception:
        soup = BeautifulSoup(r.text, "html.parser")
    og = _parse_og(soup, url)
    summary = og["description"] or _first_paragraph(soup)
    read_minutes = _estimate_read_minutes(summary)
    return {
      "url": url,
      "title": og["title"] or url,
      "summary": (summary or "")[:1000],
      "image": og["image"] or "",
      "date": og["date"] or "",
      "tags": og["tags"] or [],
      "readMinutes": read_minutes
    }  # [7]

@app.get("/api/blog/preview")
def blog_preview(url: str = Query(..., min_length=10)):
    now = time.time()
    cached = BLOG_CACHE.get(url)
    # Fix: Compare expiry time (first element of tuple) with current time
    if cached and cached[0] > now:
        return cached[1]  # Return data (second element of tuple)

    try:
        data = fetch_preview(url)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Preview fetch failed: {e}")

    BLOG_CACHE[url] = (now + DEFAULT_TTL_SECONDS, data)
    return data


class NormalizePayload(BaseModel):
    urls: List[str]
    overrides: Optional[Dict[str, Dict[str, str]]] = None  # { url: {title, summary, image, date} }
    categories: Optional[Dict[str, str]] = None            # { url: "category" }
    pinned: Optional[Dict[str, bool]] = None               # { url: true/false }
    ttl: Optional[int] = 15                                 # minutes

@app.post("/api/blog/normalize")
def blog_normalize(payload: NormalizePayload):
    global DEFAULT_TTL_SECONDS
    try:
        ttl_minutes = max(1, int(payload.ttl or 15))
    except Exception:
        ttl_minutes = 15
    DEFAULT_TTL_SECONDS = ttl_minutes * 60  # [12]

    normalized: List[Dict[str, Any]] = []
    for u in payload.urls:
        prev = blog_preview(u)  # uses cache when present
        item = dict(prev)
        if payload.categories and u in payload.categories:
            item["category"] = payload.categories[u]
        if payload.pinned and payload.pinned.get(u, False):
            item["pinned"] = True
        if payload.overrides and u in payload.overrides:
            ov = payload.overrides[u] or {}
            for k in ("title", "summary", "image", "date"):
                if ov.get(k):
                    item[k] = ov[k]
        normalized.append(item)

    return {"normalized": normalized}  # [14]

# ---------------- Main ----------------
if "__main__" == __name__:
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)  # [14]
