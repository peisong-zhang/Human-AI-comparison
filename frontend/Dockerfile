FROM node:20-alpine AS base

WORKDIR /app

COPY frontend/package*.json ./
RUN npm install

COPY frontend .

ENV VITE_API_BASE=http://localhost:8000

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
