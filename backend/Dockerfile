# --- build stage ---
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# 시드 JSON 은 go:embed 로 바이너리에 포함되므로 별도 복사 불필요.
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server ./cmd/server

# --- run stage ---
FROM alpine:3.20
RUN adduser -D -u 10001 app
WORKDIR /app
COPY --from=build /out/server /app/server
USER app
EXPOSE 8080
ENTRYPOINT ["/app/server"]
