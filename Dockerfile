FROM node:20-alpine

WORKDIR /app
COPY . .

RUN npm install

ENV PORT=3131
CMD ["node", "index.js"]
