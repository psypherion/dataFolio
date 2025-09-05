# Getting Started

## Installation Steps

1. **Clone the repository:**
```
git clone <repo-url>
cd portfolio-builder
```

2. **Create and activate a Python virtual environment:**
```
python -m venv venv
source venv/bin/activate 

# on windows : venv\Scripts\activate
```


3. **Install dependencies:**
```
pip install -r requirements.txt
```

4. **Ensure `schema.json` is located in `app/` directory.**

5. **Start the FastAPI server:**
```
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Creating Your First Portfolio

1. Open browser at `http://localhost:8000`
2. Use the dashboard interface to enter your personal information
3. Add projects, academic records, and blogs as desired
4. Save your configuration by publishing to the server

## Basic Concepts

- **JSON-based data storage**: All data is stored in JSON following a strict schema
- **Schema-driven validation**: Data integrity is enforced via JSON Schema
- **Modular design**: Separate sections such as projects, academics, and blogs
- **API-driven**: Full REST API available for integration and automation
