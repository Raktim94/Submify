FROM golang:1.24-alpine AS builder
ARG TARGETARCH=amd64
WORKDIR /src
COPY . .
# Transitive deps (e.g. via gin) may require Go 1.23+; image must match.
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -o /out/submify-api ./cmd/server

# Docker CLI (for optional in-container "update & restart" against mounted docker.sock)
FROM docker:cli AS dockercli

FROM alpine:3.20
ARG TARGETARCH=amd64

RUN apk add --no-cache ca-certificates curl \
  && mkdir -p /usr/local/lib/docker/cli-plugins \
  && case "$TARGETARCH" in \
       amd64) DARCH=x86_64 ;; \
       arm64) DARCH=aarch64 ;; \
       arm) DARCH=armv7 ;; \
       *) DARCH=$TARGETARCH ;; \
     esac \
  && curl -fsSL "https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-${DARCH}" \
     -o /usr/local/lib/docker/cli-plugins/docker-compose \
  && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
ENV PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin

WORKDIR /app
RUN adduser -D -g '' submify
COPY --from=builder /out/submify-api /app/submify-api
USER submify
EXPOSE 8080
ENTRYPOINT ["/app/submify-api"]
