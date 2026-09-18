FROM python:3.11-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends aapt openssl python3-pil && rm -rf /var/lib/apt/lists/*
ENV PYTHONPATH=/usr/lib/python3/dist-packages PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY --chown=10001:10001 app/ /app/
RUN useradd --uid 10001 --no-create-home apkhub
USER 10001:10001
EXPOSE 8091
CMD ["python3", "server.py"]
