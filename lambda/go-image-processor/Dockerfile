# syntax=docker/dockerfile:1

ARG GO_VERSION=1.25

FROM --platform=$TARGETPLATFORM golang:${GO_VERSION}-bookworm AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libheif-dev \
    libjpeg-dev \
    libpng-dev \
    libvips-dev \
    libwebp-dev \
    pkg-config \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

ENV CGO_ENABLED=1 \
  GOOS=linux

RUN go test ./... -run 'TestNativeCapabilities|TestGolden' -count=1
RUN go build -tags lambda.norpc -ldflags='-s -w' -o /out/bootstrap ./cmd/bootstrap

FROM --platform=$TARGETPLATFORM debian:bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libaom3 \
    libde265-0 \
    libheif1 \
    libjpeg62-turbo \
    libpng16-16 \
    libvips42 \
    libwebp7 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /out/bootstrap /bootstrap

ENTRYPOINT ["/bootstrap"]
