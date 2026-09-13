FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=10000
ENV NODE_ENV=production
EXPOSE 10000

CMD ["node", "index.js"]
