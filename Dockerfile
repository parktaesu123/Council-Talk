FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=10s \
  CMD wget -q -O - http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1
