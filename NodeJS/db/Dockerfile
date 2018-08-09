FROM mysql:5.7.23

COPY . .

ADD db.sql /docker-entrypoint-initdb.d

ADD db.sql /db.sql

ADD start.sh /start.sh

RUN chmod +x /start.sh

CMD ["./start.sh"]

