# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
ARG VITE_MAPTILER_KEY=
ARG VITE_CESIUM_ION_TOKEN=
ENV VITE_MAPTILER_KEY=$VITE_MAPTILER_KEY VITE_CESIUM_ION_TOKEN=$VITE_CESIUM_ION_TOKEN
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN npm ci --no-audit --no-fund --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/web packages/web
RUN npm run build -w @contrail/shared && npm run build -w @contrail/web

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 80
