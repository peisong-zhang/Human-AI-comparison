FROM python:3.11-slim AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY config ./config
COPY data ./data

ENV EXPERIMENT_CONFIG_PATH=/app/config/experiment.json \
    EXPERIMENT_DATABASE_URL=sqlite:///./data/experiment.db

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
