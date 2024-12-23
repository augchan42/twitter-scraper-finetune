FROM node:23-slim

WORKDIR /app

COPY . .

RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-liberation \
    libasound2 \
    libx11-xcb1 \
    libxshmfence1 \
    ca-certificates \
    curl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
    
RUN npm install

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox"

EXPOSE 3000

ENV PORT 3000

CMD ["npm", "run", "start"]
