# app/main.py

from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Any, Dict, List, Optional, Tuple
import json, os, time, re, logging

from jsonschema import validate, ValidationError, RefResolver
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
from urllib.parse import urljoin

# ---------------- Paths ----------------
APP_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(APP_DIR)
DATA_PATH = os.environ.get("CONFIG_PATH", os.path.join(ROOT_DIR, "data", "projects-config.json"))
SCHEMA_PATH = os.path.join(APP_DIR, "schema.json")
DASHBOARD_DIR = os.path.join(ROOT_DIR, "dashboard")

# ---------------- App ----------------
app = FastAPI()

# Serve dashboard
app.mount("/dashboard", StaticFiles(directory=DASHBOARD_DIR, html=True), name="dashboard")

@app.get("/", include_in_schema=False)
def index():
    return FileResponse(os.path.join(DASHBOARD_DIR, "dashboard.html"))

# ---------------- Schema Loading with $ref Resolution ----------------
_schema_cache = None
_resolver_cache = None

def load_full_schema():
    """Load the complete schema with definitions for $ref resolution."""
    global _schema_cache
    
    if _schema_cache is not None:
        return _schema_cache
    
    if not os.path.exists(SCHEMA_PATH):
        raise HTTPException(status_code=500, detail="Schema file not found")
    
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        _schema_cache = json.load(f)
    
    return _schema_cache

def get_schema_resolver():
    """Get RefResolver for handling $ref pointers."""
    global _resolver_cache
    
    if _resolver_cache is not None:
        return _resolver_cache
    
    full_schema = load_full_schema()
    _resolver_cache = RefResolver.from_schema(full_schema)
    return _resolver_cache

def get_default_config():
    """Get default configuration structure"""
    return {
        "personalInfo": {
            "name": "",
            "title": "",
            "mediumProfile": "",
            "githubProfile": "",
            "updatedLabel": "",
            "defaultTheme": "light"
        },
        "about": {
            "tagline": "",
            "bio": "",
            "photo": {"src": "", "alt": ""},
            "cta": {"label": "", "url": ""},
            "personJSONLD": True
        },
        "navigation": [],
        "sidebar": {
            "updates": [],
            "skillsSections": [],
            "quickLinks": []
        },
        "projects": [],
        "openSource": [],
        "academics": {
            "education": [],
            "exams": [],
            "internships": []
        },
        "blog": {
            "showOnHomepage": True,
            "mode": "manual",
            "cacheMinutes": 15,
            "manualPosts": [],
            "normalized": [],
            "taxonomy": {
                "categories": [],
                "tagSuggestions": [],
                "series": []
            }
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

def clean_empty_strings(obj):
    """Recursively remove empty strings and replace with None or remove keys"""
    if isinstance(obj, dict):
        cleaned = {}
        for k, v in obj.items():
            cleaned_v = clean_empty_strings(v)
            # Only include non-empty strings or other data types
            if cleaned_v != "":
                cleaned[k] = cleaned_v
        return cleaned
    elif isinstance(obj, list):
        return [clean_empty_strings(item) for item in obj if clean_empty_strings(item) != ""]
    elif isinstance(obj, str):
        return obj if obj.strip() else ""
    else:
        return obj

# ---------------- Config get/put ----------------
@app.get("/api/config")
def get_config():
    """Get configuration with proper error handling for empty/corrupt files"""
    
    # If file doesn't exist, return defaults
    if not os.path.exists(DATA_PATH):
        return JSONResponse(content=get_default_config())
    
    try:
        # Check if file is empty
        file_size = os.path.getsize(DATA_PATH)
        if file_size == 0:
            return JSONResponse(content=get_default_config())
        
        # Try to load JSON
        with open(DATA_PATH, "r", encoding="utf-8") as f:
            config_data = json.load(f)
            
        # If loaded successfully but empty dict, return defaults
        if not config_data:
            return JSONResponse(content=get_default_config())
            
        return JSONResponse(content=config_data)
        
    except json.JSONDecodeError as e:
        # Corrupt JSON file - return defaults and optionally backup the corrupt file
        backup_path = DATA_PATH + ".corrupt.backup"
        try:
            if os.path.exists(DATA_PATH):
                os.rename(DATA_PATH, backup_path)
                print(f"Corrupt config file backed up to: {backup_path}")
        except:
            pass
        return JSONResponse(content=get_default_config())
    except Exception as e:
        print(f"Error reading config file: {e}")
        return JSONResponse(content=get_default_config())

class ConfigPayload(BaseModel):
    data: Dict[str, Any]

@app.put("/api/config")
def put_config(payload: ConfigPayload):
    """Update configuration with data cleaning and validation"""
    
    # Clean empty strings from data before validation
    cleaned_data = clean_empty_strings(payload.data)
    
    # Load schema with resolver
    try:
        full_schema = load_full_schema()
        resolver = get_schema_resolver()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Schema loading error: {str(e)}")
    
    # Validate with resolver
    try:
        validate(instance=cleaned_data, schema=full_schema, resolver=resolver)
    except ValidationError as e:
        # Provide detailed error information
        error_path = " -> ".join(str(p) for p in e.absolute_path) if e.absolute_path else "root"
        raise HTTPException(
            status_code=400, 
            detail=f"Schema validation error at {error_path}: {e.message}"
        )
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    
    # Atomic write with temporary file
    tmp_path = DATA_PATH + ".tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(cleaned_data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, DATA_PATH)
    except Exception as e:
        # Clean up temp file if write failed
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise HTTPException(status_code=500, detail=f"Failed to save configuration: {str(e)}")
    
    return {"status": "ok", "message": "Configuration saved successfully"}

# ---------------- Project Import Functionality ----------------

def load_project_schema_with_resolver():
    """Load project schema with proper $ref resolution context."""
    full_schema = load_full_schema()
    
    if 'definitions' not in full_schema or 'project' not in full_schema['definitions']:
        raise HTTPException(status_code=500, detail="Project definition not found in schema")
    
    # Create project schema that maintains reference to definitions
    project_schema = {
        "$schema": full_schema.get("$schema", "http://json-schema.org/draft-07/schema#"),
        "type": "object",
        "properties": full_schema["definitions"]["project"]["properties"],
        "required": full_schema["definitions"]["project"]["required"],
        "additionalProperties": full_schema["definitions"]["project"]["additionalProperties"],
        "definitions": full_schema["definitions"]  # Include all definitions for $ref resolution
    }
    
    return project_schema

@app.post("/api/projects/import")
async def import_project(file: UploadFile = File(...)):
    """Import project from uploaded JSON file with proper $ref resolution"""
    
    # Validate file type
    if not file.filename or not file.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="Only JSON files are supported")
    
    # Read file content
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")
    
    # Check file size (10MB limit)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 10MB")
    
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File is empty")
    
    try:
        # Parse JSON
        project_data = json.loads(content.decode('utf-8'))
        
        # Clean empty strings from project data
        cleaned_project = clean_empty_strings(project_data)
        
        # Load project schema with definitions
        project_schema = load_project_schema_with_resolver()
        resolver = get_schema_resolver()
        
        # Validate with resolver to handle $ref pointers
        validate(instance=cleaned_project, schema=project_schema, resolver=resolver)
        
        return {
            "status": "success",
            "project": cleaned_project,
            "filename": file.filename,
            "message": "Project imported successfully"
        }
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON file format: {str(e)}")
    except ValidationError as e:
        # Provide detailed validation error with path
        error_path = " -> ".join(str(p) for p in e.absolute_path) if e.absolute_path else "root"
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid project structure at {error_path}: {e.message}"
        )
    except UnicodeDecodeError as e:
        raise HTTPException(status_code=400, detail=f"File encoding error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@app.post("/api/projects/validate")
def validate_project(project_data: Dict[str, Any]):
    """Validate project data against schema"""
    try:
        cleaned_project = clean_empty_strings(project_data)
        project_schema = load_project_schema_with_resolver()
        resolver = get_schema_resolver()
        validate(instance=cleaned_project, schema=project_schema, resolver=resolver)
        return {"status": "valid", "message": "Project data is valid"}
    except ValidationError as e:
        error_path = " -> ".join(str(p) for p in e.absolute_path) if e.absolute_path else "root"
        raise HTTPException(
            status_code=400, 
            detail=f"Validation error at {error_path}: {e.message}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation error: {str(e)}")

# ---------------- Blog preview/normalize (simplified) ----------------
BLOG_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
DEFAULT_TTL_SECONDS = 15 * 60

@app.get("/api/blog/preview")
def blog_preview(url: str = Query(..., min_length=10)):
    """Simple blog preview - implement full functionality as needed"""
    # Return basic preview for now
    return {
        "url": url,
        "title": "Blog Post Title",
        "summary": "Blog post summary...",
        "image": "",
        "date": "",
        "tags": [],
        "readMinutes": 3
    }

class NormalizePayload(BaseModel):
    urls: List[str]
    overrides: Optional[Dict[str, Dict[str, str]]] = None
    categories: Optional[Dict[str, str]] = None
    pinned: Optional[Dict[str, bool]] = None
    ttl: Optional[int] = 15

@app.post("/api/blog/normalize")
def blog_normalize(payload: NormalizePayload):
    """Normalize blog posts - simplified version"""
    normalized = []
    for url in payload.urls:
        item = {
            "url": url,
            "title": "Sample Title",
            "summary": "Sample summary",
            "image": "",
            "date": "",
            "tags": [],
            "readMinutes": 3
        }
        if payload.categories and url in payload.categories:
            item["category"] = payload.categories[url]
        if payload.pinned and payload.pinned.get(url, False):
            item["pinned"] = True
        normalized.append(item)
    
    return {"normalized": normalized}

# ---------------- Utility Endpoints ----------------
@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "portfolio-api", "timestamp": time.time()}

@app.get("/api/schema/project")
def get_project_schema_debug():
    """Get the project schema for debugging purposes"""
    try:
        project_schema = load_project_schema_with_resolver()
        return JSONResponse(content=project_schema)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Schema loading error: {str(e)}")

@app.post("/api/config/reset")
def reset_config():
    """Reset configuration to defaults (useful for debugging)"""
    try:
        default_config = get_default_config()
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
        
        # Write default config
        with open(DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(default_config, f, ensure_ascii=False, indent=2)
        
        return {"status": "ok", "message": "Configuration reset to defaults"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset configuration: {str(e)}")

# ---------------- Main ----------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
