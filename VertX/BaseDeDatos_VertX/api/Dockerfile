FROM java:8-jre

ENV VERTICLE_FILE Consulta-0.0.1-SNAPSHOT-fat.jar

ENV VERTICLE_HOME /usr/verticles

WORKDIR $VERTICLE_HOME

ADD /target/$VERTICLE_FILE .

EXPOSE 4000

ENTRYPOINT ["sh", "-c"]

CMD ["exec java -Xms10g -Xmx10g -jar $VERTICLE_FILE"]
