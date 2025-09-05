# Dockerfile for dataFolio
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY ./app /app/app
COPY ./dashboard /app/dashboard
COPY ./schema.json /app/
COPY ./data /app/data

# Expose port
EXPOSE 8000

# Set environment variable
ENV CONFIG_PATH=/app/data/projects-config.json

# Start the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
