FROM tomcat:8.0.53-jre8

ENV PATH_WAR /api/target/BaseDeDatos_Servlets-0.0.1-SNAPSHOT.war

ADD /tomcat-conf/tomcat-users.xml /usr/local/tomcat/conf/tomcat-users.xml

ADD /tomcat-conf/context.xml /usr/local/tomcat/conf/context.xml

COPY $PATH_WAR /usr/local/tomcat/webapps/

RUN mv /usr/local/tomcat/webapps/ROOT /usr/local/tomcat/webapps/ROOT.OLD

RUN mkdir /usr/local/tomcat/webapps/ROOT

COPY /api/target/BaseDeDatos_Servlets-0.0.1-SNAPSHOT /usr/local/tomcat/webapps/ROOT/
