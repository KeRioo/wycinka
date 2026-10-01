FROM python:3.12-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libsqlite3-dev \
        zlib1g-dev \
        g++ \
        make \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY pyproject.toml ./
COPY egib_sync ./egib_sync

RUN pip install --upgrade pip setuptools wheel \
    && pip wheel --wheel-dir=/wheels .[dev]

FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    EGIB_PYTHON=python \
    TIPPECANOE_PATH=tippecanoe

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libsqlite3-0 \
        libgomp1 \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1000 etluser \
    && useradd --system --uid 1000 --gid etluser --create-home --shell /bin/bash etluser

WORKDIR /app

COPY --from=builder /wheels /wheels
COPY --from=builder /build/egib_sync ./egib_sync
COPY --from=builder /build/pyproject.toml ./pyproject.toml
RUN pip install --no-index --find-links=/wheels egib_sync \
    && rm -rf /wheels

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER etluser

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["--help"]