FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps (requirements.txt is at repo root)
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# Node deps
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Source files and Python converters
COPY backend/ .

EXPOSE 5000
CMD ["node", "server.js"]

