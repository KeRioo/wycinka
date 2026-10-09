ARG TIPPECANOE_VERSION=2.79.0
ARG PYTHON_IMAGE=python:3.12-slim-bookworm
ARG DEB_IMAGE=debian:bookworm-slim

FROM ${DEB_IMAGE} AS tippecanoe-builder
ARG TIPPECANOE_VERSION=2.79.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        git \
        make \
        g++ \
        libsqlite3-dev \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch "${TIPPECANOE_VERSION}" https://github.com/felt/tippecanoe.git /src

WORKDIR /src
RUN make -j"$(nproc)" && make install PREFIX=/tippecanoe


FROM ${PYTHON_IMAGE} AS egib-builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libsqlite3-dev \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY pyproject.toml ./
COPY egib_sync ./egib_sync

RUN pip install --upgrade pip setuptools wheel \
    && pip wheel --wheel-dir=/wheels .


FROM ${PYTHON_IMAGE} AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    EGIB_LOG_JSON=true \
    TIPPECANOE_PATH=tippecanoe \
    EGIB_DATA_DIR=/app/data

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        libsqlite3-0 \
        zlib1g \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1000 etluser \
    && useradd --system --uid 1000 --gid etluser --create-home --shell /usr/sbin/nologin etluser

COPY --from=tippecanoe-builder /tippecanoe/bin/ /usr/local/bin/

COPY --from=egib-builder /wheels /wheels
RUN pip install --no-index /wheels/*.whl \
    && rm -rf /wheels \
    && tippecanoe --version

WORKDIR /app

RUN mkdir -p /app/data \
    && chown -R etluser:etluser /app

USER etluser

CMD ["/bin/bash", "/usr/local/bin/scheduler.sh"]
