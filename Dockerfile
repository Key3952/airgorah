FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    build-essential \
    ruby \
    ruby-dev \
    rubygems \
    rpm \
    zstd \
    libarchive-tools \
    tar \
    gzip \
  && gem install --no-document fpm \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

CMD ["bash", "-c", "if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi && bash scripts/package-linux.sh /workspace/release-artifacts"]
