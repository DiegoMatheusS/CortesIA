FROM python:3.12-slim-bookworm AS base
WORKDIR /app
RUN groupadd -g 10001 cortes && useradd -u 10001 -g cortes -m cortes
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=cortes:cortes . .
ENV PYTHONUNBUFFERED=1
USER cortes
CMD ["python","-m","cortes_worker.runner"]
FROM base AS media
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
USER cortes
CMD ["python","-m","cortes_worker.media_runner"]
