FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    REMBG_MODEL=birefnet-general \
    U2NET_HOME=/models

WORKDIR /service

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

RUN mkdir -p ${U2NET_HOME} \
    && python -c "from rembg import new_session; new_session('birefnet-general')"

COPY app ./app
COPY tests ./tests
RUN python -m unittest discover -s tests -p "test_*.py"

RUN useradd --create-home --uid 10001 processor \
    && chown -R processor:processor /service ${U2NET_HOME}
USER processor

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
