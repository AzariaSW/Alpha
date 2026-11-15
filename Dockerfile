FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

COPY backend ./backend
COPY frontend ./frontend
COPY shared ./shared

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER node

WORKDIR /app/backend
CMD ["npm", "start"]
