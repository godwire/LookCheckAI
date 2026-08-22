FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_ENV=production

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Most free hosts inject the port via $PORT.
ENV PORT=8000
EXPOSE 8000

# 2 workers is the sweet spot on a free 512MB instance. Note: the in-process
# rate limiter counts per worker, so effective limits are multiplied by the
# worker count until you move the counters to Redis.
CMD gunicorn --bind 0.0.0.0:${PORT} --workers 2 --timeout 90 app:app
