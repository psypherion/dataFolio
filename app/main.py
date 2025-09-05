# app/main.py

from fastapi import FastAPI, HTTPException, Query, UploadFile, File
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
app = FastAPI()  # FastAPI application root [1]

# Serve dashboard (ensure dashboard.html, dashboard.js, schema.json exist here)
app.mount("/dashboard", StaticFiles(directory=DASHBOARD_DIR, html=True), name="dashboard")  # StaticFiles mount pattern [1]

@app.get("/", include_in_schema=False)
def index():
    # Serve the dashboard HTML from root; assets referenced with /dashboard/... paths
    return FileResponse(os.path.join(DASHBOARD_DIR, "dashboard.html"))  # StaticFiles usage aligns with mounted prefix [1]

# ---------------- Config get/put ----------------
@app.get("/api/config")
def get_config():
    if not os.path.exists(DATA_PATH):
        # initialize empty structure including new sections: about, openSource, academics, taxonomy, settings [custom defaults]
        default_config = {
            "personalInfo": {},
            "about": {
                "tagline": "",
                "bio": "",
                "photo": {"src": "", "alt": ""},
                "cta": {"label": "", "url": ""},
                "personJSONLD": True
            },
            "navigation": [],
            "sidebar": {"updates": [], "skillsSections": [], "quickLinks": []},
            "projects": [],
            "openSource": [],
            "academics": {"education": [], "exams": [], "internships": []},
            "blog": {
                "showOnHomepage": True,
                "mode": "manual",
                "cacheMinutes": 15,
                "manualPosts": [],
                "normalized": [],
                "taxonomy": {"categories": [], "tagSuggestions": [], "series": []}
            },
            "settings": {
                "accessibility": {
                    "skipLinkLabel": "Skip to content",
                    "forceFocusVisible": True,
                    "minContrastAA": True,
                    "requireCaptions": False
                },
                "performance": {
                    "lazyLoadImagesDefault": True,
                    "responsiveImagesDefault": True,
                    "maxImageWidth": 2560,
                    "deferNonCriticalJS": True
                }
            }
        }
        return JSONResponse(content=default_config)  # Return base schema-aligned defaults [1]

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return JSONResponse(content=json.load(f))  # Serve current configuration [1]

class ConfigPayload(BaseModel):
    data: Dict[str, Any]

@app.put("/api/config")
def put_config(payload: ConfigPayload):
    # Load schema
    if not os.path.exists(SCHEMA_PATH):
        raise HTTPException(status_code=500, detail="Schema not found on server")  # Ensure server schema present [1]
    
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema = json.load(f)
    
    # Validate
    try:
        validate(instance=payload.data, schema=schema)  # jsonschema validation against draft-07 [13]
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"Schema validation error: {e.message}")  # Structured schema error [13]
    
    # Persist atomically
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    tmp_path = DATA_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload.data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, DATA_PATH)
    
    return {"status": "ok"}  # Success response [1]

# ---------------- Project Import Functionality (NEW) ----------------

@app.post("/api/projects/import")
async def import_project(file: UploadFile = File(...)):
    """Import project from uploaded JSON file"""
    
    # Validate file type
    if not file.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="Only JSON files are supported")
    
    # Check file size (10MB limit)
    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 10MB")
    
    try:
        # Read and parse the uploaded file
        content = await file.read()
        project_data = json.loads(content.decode('utf-8'))
        
        # Validate against project schema
        project_schema = load_project_schema()
        validate(instance=project_data, schema=project_schema)
        
        return {
            "status": "success",
            "project": project_data,
            "filename": file.filename
        }
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file format")
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"Invalid project structure: {e.message}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@app.post("/api/projects/validate")
def validate_project(project_data: Dict[str, Any]):
    """Validate project data against schema"""
    try:
        project_schema = load_project_schema()
        validate(instance=project_data, schema=project_schema)
        return {"status": "valid"}
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"Validation error: {e.message}")

def load_project_schema():
    """Extract project schema definition from main schema"""
    if not os.path.exists(SCHEMA_PATH):
        raise HTTPException(status_code=500, detail="Schema file not found")
    
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        main_schema = json.load(f)
    
    # Extract the project definition from the main schema
    project_def = main_schema.get("definitions", {}).get("project", {})
    
    if not project_def:
        raise HTTPException(status_code=500, detail="Project schema definition not found")
    
    return {
        "type": "object",
        "properties": project_def.get("properties", {}),
        "required": project_def.get("required", []),
        "additionalProperties": project_def.get("additionalProperties", False)
    }

# ---------------- Blog preview/normalize (Open Graph) ----------------

# Cache: { url: (expires_epoch, data) }
BLOG_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}  # expiry + data tuple [1]
DEFAULT_TTL_SECONDS = 15 * 60  # 15 minutes default [1]

log = logging.getLogger("blog")

# Hardened Session with retries for transient upstream issues (429/5xx)
SESSION = requests.Session()  # persistent session for connection reuse [11]
retries = Retry(
    total=3,
    backoff_factor=0.5,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["GET", "HEAD"]
)  # robust retry policy using urllib3 Retry [11]
SESSION.mount("http://", HTTPAdapter(max_retries=retries))  # adapter with retries [11]
SESSION.mount("https://", HTTPAdapter(max_retries=retries))  # adapter with retries [11]

REQ_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
}  # realistic browser headers help avoid blocked/incomplete responses [11]

def _text_meta(soup: BeautifulSoup, name_or_prop: str) -> str:
    # Try property first then name to support both attribute styles in OG/meta
    tag = soup.find("meta", attrs={"property": name_or_prop}) or soup.find("meta", attrs={"name": name_or_prop})
    if not tag:
        return ""
    return (tag.get("content") or "").strip()  # extract content attribute [7]

def _first_paragraph(soup: BeautifulSoup) -> str:
    # Reasonable paragraph fallback for previews when og:description is missing
    for p in soup.select("article p, .post p, .section-content p, p"):
        t = p.get_text(" ", strip=True)
        if len(t) > 60:
            return t
    return ""  # fallback summary when OG description absent [7]

def _parse_og(soup: BeautifulSoup, base_url: str) -> Dict[str, Any]:
    # Open Graph and article meta extraction
    title = _text_meta(soup, "og:title")
    if not title and soup.title and soup.title.string:
        title = soup.title.string.strip()
    description = _text_meta(soup, "og:description") or _text_meta(soup, "description")
    image = _text_meta(soup, "og:image")
    if image:
        image = urljoin(base_url, image)  # resolve relative URL if needed [7]
    date = _text_meta(soup, "article:published_time") or _text_meta(soup, "og:updated_time") or _text_meta(soup, "article:modified_time")
    tags = [m.get("content", "").strip() for m in soup.find_all("meta", attrs={"property": "article:tag"}) if m.get("content")]
    return {"title": title, "description": description, "image": image, "date": date, "tags": tags}  # normalized OG data [7]

def _estimate_read_minutes(text: str) -> int:
    words = re.findall(r"\w+", text or "")
    return max(1, round(len(words) / 200.0))  # ~200 wpm heuristic for read time [7]

def fetch_preview(url: str) -> Dict[str, Any]:
    # HTTP fetch with robust headers and retries; parse OG; fallback to first meaningful paragraph for description
    r = SESSION.get(url, headers=REQ_HEADERS, timeout=15)
    if r.status_code >= 400:
        log.warning("Preview fetch failed %s for %s", r.status_code, url)
        raise HTTPException(status_code=502, detail=f"Upstream error {r.status_code}")
    
    # Prefer lxml if installed; fall back to html.parser for portability
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
    }  # normalized preview payload [7]

@app.get("/api/blog/preview")
def blog_preview(url: str = Query(..., min_length=10)):
    # Use TTL cache to avoid repeated upstream hits while editing
    now = time.time()
    cached = BLOG_CACHE.get(url)
    if cached and cached[0] > now:
        return cached[1]  # return cached data while fresh
    
    try:
        data = fetch_preview(url)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Preview fetch failed: {e}")
    
    BLOG_CACHE[url] = (now + DEFAULT_TTL_SECONDS, data)
    return data  # preview result [11]

class NormalizePayload(BaseModel):
    urls: List[str]
    overrides: Optional[Dict[str, Dict[str, str]]] = None  # { url: {title, summary, image, date} }
    categories: Optional[Dict[str, str]] = None            # { url: "category" }
    pinned: Optional[Dict[str, bool]] = None               # { url: true/false }
    ttl: Optional[int] = 15                                 # minutes

@app.post("/api/blog/normalize")
def blog_normalize(payload: NormalizePayload):
    # Adjust TTL for subsequent previews in this process
    global DEFAULT_TTL_SECONDS
    try:
        ttl_minutes = max(1, int(payload.ttl or 15))
    except Exception:
        ttl_minutes = 15
    DEFAULT_TTL_SECONDS = ttl_minutes * 60  # update cache TTL baseline [11]

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

    return {"normalized": normalized}  # batch normalized response [11]

# Optional: clear blog cache endpoint (useful during editing)
@app.post("/api/blog/cache/clear")
def clear_blog_cache():
    count = len(BLOG_CACHE)
    BLOG_CACHE.clear()
    return {"cleared": count}  # simple cache clear utility [1]

# ---------------- Main ----------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)  # development server [1]
