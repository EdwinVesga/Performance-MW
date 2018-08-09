FROM node:latest

WORKDIR /node/

COPY package*.json /node/

RUN npm install

COPY . .

EXPOSE 4000

CMD [ "npm", "start" ]


