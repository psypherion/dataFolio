# API Reference

## Configuration Management

### GET `/api/config`
Retrieve the current portfolio configuration.

**Response:**

```
{
"personalInfo": {...},
"projects": [...],
"academics": {...}
}

```

### PUT `/api/config`
Update the portfolio configuration.

**Request Body:**

```
{
"data": {
"personalInfo": {...},
"projects": [...]
}
}
```


**Response:**
```

{
"status": "ok",
"message": "Configuration saved successfully"
}
```


## Project Management

### POST `/api/projects/import`
Import a project from a JSON file.

**Request:** Multipart form upload with JSON file

**Response:**


```
{
"status": "success",
"project": {...},
"filename": "project.json"
}


```


### POST `/api/projects/validate`
Validate a project JSON object.

**Request Body:** Project JSON object

**Response:**
```

{
"status": "valid",
"message": "Project data is valid"
}

```


## Blog Management

### GET `/api/blog/preview`
Fetch blog metadata using URL.

**Parameters:** `url` (query parameter)

**Response:**
```

{
"url": "https://example.com/post",
"title": "Blog Post Title",
"summary": "Post summary...",
"image": "https://example.com/image.jpg",
"tags": ["tech", "tutorial"]
}

```

### POST `/api/blog/normalize`
Normalize multiple blog posts.

**Request Body:**
```

{
"urls": ["url1", "url2"],
"overrides": {"url1": {"title": "Custom Title"}},
"categories": {"url1": "tutorial"}
}
```


## Utility Endpoints

### GET `/api/health`
Health check endpoint.

**Response:**
```

{
"status": "healthy",
"service": "portfolio-api",
"timestamp": 1757104885.638
}
```


### GET `/api/schema/project`
Return the project JSON schema for reference.

### POST `/api/config/reset`
Reset the configuration to default values.

## Error Responses

All endpoints return errors in this format:
```

{
"detail": "Error description",
"field": "problematic_field_name"
}
```


**Common HTTP Status Codes:**
- `200`: Success
- `400`: Bad Request (validation error)
- `422`: Unprocessable Entity (schema error)
- `500`: Internal Server Error
