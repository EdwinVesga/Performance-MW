FROM jetty:latest

ENV PATH_XML /api/src/main/webapp/WEB-INF

ADD /api/target/ROOT.war $JETTY_BASE/webapps/

ADD $PATH_XML/jetty.xml $JETTY_HOME/etc/jetty.xml

ADD $PATH_XML/jetty-threadpool.xml $JETTY_HOME/etc/jetty-threadpool.xml

EXPOSE 8080
