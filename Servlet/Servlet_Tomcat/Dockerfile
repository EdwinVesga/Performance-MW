FROM tomcat:8.5.34-jre8

ENV PATH_API /api/target/ROOT.war

ADD /api/WebContent/WEB-INF/server.xml /usr/local/tomcat/conf/server.xml

RUN rm -r /usr/local/tomcat/webapps/ROOT

COPY $PATH_API /usr/local/tomcat/webapps/
