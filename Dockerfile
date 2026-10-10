FROM golang:1.27-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./

RUN go mod download

COPY main.go ./
COPY internal/ ./internal/

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/app .

FROM alpine:3.24

RUN addgroup -S app && adduser -S -G app app

WORKDIR /app

COPY --from=builder /out/app ./app

COPY frontend/ ./frontend/

USER app

EXPOSE 8080

CMD ["./app"]
