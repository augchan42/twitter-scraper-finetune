FROM node:23-alpine

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 3000

ENV PORT 3000

CMD ["npm", "run", "start"]