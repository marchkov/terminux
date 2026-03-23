FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/storage

VOLUME ["/app/storage"]

EXPOSE 3000

CMD ["npm", "start"]
