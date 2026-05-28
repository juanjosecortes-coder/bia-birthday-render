FROM node:20-slim

# Instala Chromium y sus dependencias
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-noto \
    fonts-noto-color-emoji \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer usará el Chromium del sistema (no descarga el suyo)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

# Copia el servidor y las imágenes de fondo
COPY server.js ./
COPY img/ ./img/

EXPOSE 3000
CMD ["node", "server.js"]
