# Schema Reference

## JSON Schema Overview

The portfolio data follows a comprehensive JSON Schema that enforces structure, data types, and validation rules. All data is validated before storage to ensure integrity.

## Major Sections

### personalInfo
- `name` (required): Full name
- `title` (required): Professional title
- `mediumProfile`: Medium profile URL
- `githubProfile`: GitHub profile URL
- `defaultTheme`: UI theme preference

### projects (array)
Each project contains:
- `id` (required): Unique identifier
- `title` (required): Project name
- `meta` (required): Category, status, date
- `summary` (required): Project description
- `content` (required): Content paragraphs
- `featured`: Boolean for highlighting
- `media`: Videos, galleries, diagrams
- `techSpecs`: Technology specifications
- `links`: External project links
- `caseStudy`: Detailed case study

### academics
- `education`: Academic qualifications
- `exams`: Test scores and certifications
- `internships`: Professional experiences

### blog
- `manualPosts`: Manual blog entries
- `normalized`: Processed blog data
- `taxonomy`: Categories and tags

## Required vs Optional Fields

### Required Fields
- `personalInfo.name`
- `personalInfo.title`
- `projects[].id`
- `projects[].title`
- `projects[].meta`
- `projects[].summary`
- `projects[].content`

### Optional Fields
Most other fields are optional, allowing gradual portfolio building.

## Validation Rules

### String Constraints
- `minLength: 1` for required text fields
- `pattern` validation for IDs (alphanumeric, hyphens, underscores)
- `format: "uri"` for URL fields

### Object References
- Complex objects use `$ref` to shared definitions
- Conditional validation for media types
- Nested object validation with `additionalProperties: false`

### Media Type Validation
- **Video**: Requires `videoId`, optional `placeholder`
- **Gallery**: Requires `mainImage` and `thumbnails` array
- **Diagram**: Requires `src` and `alt`, optional `caption`

## Schema Definitions

Key reusable definitions include:
- `imageRef`: Image with src and alt text
- `mediaTab`: Multi-type media content
- `techSpecs`: Technology specifications
- `projectLinks`: External project links
- `caseStudy`: Detailed project analysis

For complete schema details, refer to `app/schema.json`.
