# syntax=docker/dockerfile:1
# TARGETARCH is set by BuildKit (buildx); default suits native linux/amd64 builds.
ARG TARGETARCH=amd64

FROM golang:1.26-alpine AS builder
# Default when classic docker build omits BuildKit platform args (empty GOARCH breaks compile).
ARG TARGETARCH=amd64
# Resolved from a real git tag at publish time by docker-publish.yml (git
# describe --tags, matching that workflow's own image-tag convention);
# local `docker compose build` (no build-arg passed) falls back to this
# default, same as that workflow's own fallback.
ARG VERSION=0.0.0-dev
WORKDIR /src
COPY . .
# Transitive deps (e.g. via gin) may require Go 1.23+; image must match.
# go build -o /out/... does not mkdir parents; /out must exist.
# Avoid `go mod tidy` in image builds; it mutates module files and is brittle in CI/containers.
RUN mkdir -p /out \
  && go mod download all \
  && CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -mod=mod -o /out/submify-api ./cmd/server

# Docker CLI (optional in-container "update & restart" against mounted docker.sock).
FROM docker:cli AS dockercli

FROM alpine:3.20
ARG TARGETARCH
RUN apk add --no-cache ca-certificates curl git \
  && mkdir -p /usr/local/lib/docker/cli-plugins \
  && case "$TARGETARCH" in \
       amd64) DARCH=x86_64 ;; \
       arm64) DARCH=aarch64 ;; \
       arm) DARCH=armv7 ;; \
       *) DARCH=$TARGETARCH ;; \
     esac \
  && curl -fsSL --retry 3 --retry-delay 2 \
     "https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-${DARCH}" \
     -o /usr/local/lib/docker/cli-plugins/docker-compose \
     && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
ENV PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin
ARG VERSION=0.0.0-dev
ENV SUBMIFY_VERSION=$VERSION

WORKDIR /app
COPY --from=builder /out/submify-api /app/submify-api
# Runs as root — a deliberate, documented consequence of the self-update
# feature (docs/decisions/0009-s3-backup-and-self-update.md), not an
# oversight: docker.sock access already grants host-root-equivalent
# control regardless of the container's own UID, so keeping a separate
# unprivileged in-container user provides no real additional isolation
# once that mount exists. Was `USER submify` (adduser -D -g '' submify)
# before this feature.
EXPOSE 8080
ENTRYPOINT ["/app/submify-api"]
