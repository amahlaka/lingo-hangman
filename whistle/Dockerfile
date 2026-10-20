# Whistle speech-to-text for Say it (see server.py and README.md). The model
# and its engine are downloaded while the image builds, so the running
# container needs no internet: HF_HUB_OFFLINE stops the package checking
# Hugging Face, and its anonymous usage counts are switched off.
FROM python:3.12-slim

ARG NEEDLE_VERSION=3.2.8
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NEEDLE_TELEMETRY=0 \
    DO_NOT_TRACK=1 \
    NEEDLE_WHISTLE_WEIGHTS=/opt/whistle/whistle.cact \
    NEEDLE3_LIB_PATH=/opt/whistle/libneedle.so \
    PORT=8000

COPY fetch_model.py /tmp/fetch_model.py
RUN pip install --no-cache-dir "cactus-needle==${NEEDLE_VERSION}" \
 && python /tmp/fetch_model.py \
 && rm -rf /tmp/fetch_model.py /tmp/whistle /root/.cache \
 && chmod -R a+rX /opt/whistle

ENV HF_HUB_OFFLINE=1
COPY server.py /opt/whistle/server.py

USER nobody
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --start-interval=2s --retries=3 \
  CMD ["python", "-c", "import json,sys,urllib.request; sys.exit(0 if json.load(urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=4)).get('ok') else 1)"]

CMD ["python", "/opt/whistle/server.py"]
