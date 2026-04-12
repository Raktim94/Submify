FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY . .
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/submify-api ./cmd/server

FROM alpine:3.20
WORKDIR /app
RUN adduser -D -g '' submify
COPY --from=builder /out/submify-api /app/submify-api
USER submify
EXPOSE 8080
ENTRYPOINT ["/app/submify-api"]
