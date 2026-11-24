# syntax=docker/dockerfile:1
FROM ubuntu:24.04 AS runtime
ARG NTNT_VERSION=0.6.4
ARG NTNT_ARCHIVE_SHA256=d41515e32f8c4bb6834283eb5dd0fbe05739d92a3b8af19f327ae57518544513
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libssl3t64 libgcc-s1 \
    && curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
      "https://github.com/ntntlang/ntnt/releases/download/v${NTNT_VERSION}/ntnt-linux-x64.tar.gz" -o /tmp/ntnt.tar.gz \
    && printf '%s  %s\n' "$NTNT_ARCHIVE_SHA256" /tmp/ntnt.tar.gz | sha256sum --check --strict \
    && tar -xzf /tmp/ntnt.tar.gz -C /usr/local/bin ntnt \
    && chmod 0755 /usr/local/bin/ntnt \
    && rm /tmp/ntnt.tar.gz && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 app && useradd --uid 10001 --gid 10001 --no-create-home app \
    && mkdir -p /app/data && chown app:app /app/data
WORKDIR /app
ENV NTNT_ENV=production NTNT_LISTEN_PORT=8080 NTNT_TIMEOUT=15 NTNT_WORKERS=2

FROM runtime AS app
ARG APP_REVISION=development
LABEL org.opencontainers.image.source="https://github.com/joshcramer/iowa-plume-watch" \
      org.opencontainers.image.revision="$APP_REVISION" \
      org.opencontainers.image.version="ntnt-0.6.4"
COPY --chown=root:root server.tnt worker.tnt ntnt.toml ./
COPY --chown=root:root lib/ ./lib/
COPY --chown=root:root db/ ./db/
COPY --chown=root:root middleware/ ./middleware/
COPY --chown=root:root routes/ ./routes/
COPY --chown=root:root views/ ./views/
COPY --chown=root:root public/ ./public/
COPY --chown=root:root jobs/ ./jobs/
COPY --chown=root:root seed/ ./seed/
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["curl", "--fail", "--silent", "--max-time", "2", "http://127.0.0.1:8080/health"]
CMD ["ntnt", "run", "server.tnt"]
