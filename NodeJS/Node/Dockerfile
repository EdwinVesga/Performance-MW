FROM node:latest

WORKDIR /node/

COPY . .

ENV UV_THREADPOOL_SIZE 128

RUN npm install

EXPOSE 4000

CMD [ "npm", "start" ]
