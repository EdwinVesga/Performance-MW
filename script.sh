#! /bin/bash
#Bloque de comandos para la prueba de Vertx.
#1. Iniciar los contenedores de la aplicación vertx.
menumain(){
echo ""
echo "-- MENU PRINCIPAL --"
PS3='Please enter your choice: '
options=("Desplegar Aplicación" "Ejecutar Prueba" "Detener Contenedores" "Eliminar Contenedores" "Eliminar Imagenes" "Subir a GitHub" "Quit")
select opt in "${options[@]}"
do
	case $opt in
		"Desplegar Aplicación")
		desplegar
		;;
		"Ejecutar Prueba")
		#jmeter -n -t test.jmx -l resultados.jtl
		pruebas
		;;
		"Detener Contenedores")
		sudo docker stop $(sudo docker ps -a -q)>/dev/null 2>&1
		;;
		"Eliminar Contenedores")
		sudo docker rm $(sudo docker ps -a -q)>/dev/null 2>&1
		;;
		"Eliminar Imagenes")
		sudo docker rmi $(sudo docker images -q)>/dev/null 2>&1
		;;
		"Subir a GitHub")
		git add .
		git commit -m "Se actualizaron las pruebas."
		git push origin master
		;;
		"Quit")
		exit
		;;
		*) echo "invalid option $Reply";;
	esac
done
}
desplegar(){
echo ""
echo "-- MENU APLICACIONES --"
PS3="Seleccione la aplicacion a desplegar: "
options=("VertX" "Servlet_Tomcat" "Servlet_Jetty" "NodeJS" "Regresar")
select opt in "${options[@]}"
do
	case $opt in
		"VertX")
		gnome-terminal --tab -e "bash -c 'cd ./VertX/BaseDeDatos_VertX && sudo docker-compose up --build'"
		menumain
		;;
		"Servlet_Tomcat")
		gnome-terminal --tab -e "bash -c 'cd ./Servlet/Servlet_Tomcat && sudo docker-compose up --build'"
		menumain
		;;
		"Servlet_Jetty")
		gnome-terminal --tab -e "bash -c 'cd ./Servlet/Servlet_Jetty && sudo docker-compose up --build'"
		menumain
		;;
		"NodeJS")
		gnome-terminal --tab -e "bash -c 'cd ./NodeJS && sudo docker-compose up --build'"
		menumain
		;;
		"Regresar")
		menumain
		;;
		*) echo "Invalid Option $Reply";;
	esac
done
}
pruebas(){
echo ""
echo "-- MENU PRUEBAS --"
PS3="Seleccione la aplicación a probar: "
options=("VertX" "Servlet_Tomcat" "Servlet_Jetty" "NodeJS" "Regresar")
select opt in "${options[@]}"
do
	case $opt in
		"VertX")
		pruebasVertx
		;;
		"Servlet_Tomcat")
		pruebasServlet_Tomcat
		;;
		"Servlet_Jetty")
		pruebasServlet_Jetty
		;;
		"NodeJS")
		pruebasNodeJS
		;;
		"Regresar")
		menumain
		;;
		*) echo "Invalid Option $Reply";;
	esac
done
}
pruebasVertx(){
echo ""
echo "-- MENU PRUEBAS VERTX --"
PS3="Seleccione la prueba a ejecutar: "
options=("Consulta" "InsertaryEliminar" "ContarPrimos" "MenuPrincipal")
select opt in "${options[@]}"
do
	case $opt in
		"Consulta")
		jmeter -n -t Consulta.jmx -l ./VertX/Resultados/Consulta.jtl
		;;
		"InsertaryEliminar")
		jmeter -n -t InsertaryEliminar.jmx -l ./VertX/Resultados/InsertaryEliminar.jtl
		;;
		"ContarPrimos")
		jmeter -n -t ContarPrimos.jmx -l ./VertX/Resultados/ContarPrimos.jtl
		;;
		"MenuPrincipal")
		menumain
		;;
		*) echo "Invalid Option $Reply";;
	esac
done
}
pruebasServlet_Tomcat(){
echo ""
echo "-- MENU PRUEBAS SERVLET_TOMCAT --"
PS3="Seleccione la prueba a ejecutar: "
options=("Consulta" "InsertaryEliminar" "ContarPrimos" "MenuPrincipal")
select opt in "${options[@]}"
do
	case $opt in
		"Consulta")
		jmeter -n -t Consulta.jmx -l ./Servlet/ResultadosTomcat/Consulta.jtl
		;;
		"InsertaryEliminar")
		jmeter -n -t InsertaryEliminar.jmx -l ./Servlet/ResultadosTomcat/InsertaryEliminar.jtl
		;;
		"ContarPrimos")
		jmeter -n -t ContarPrimos.jmx -l ./Servlet/ResultadosTomcat/ContarPrimos.jtl
		;;
		"MenuPrincipal")
		menumain
		;;
		*) echo "Invalid Option $Reply";;
	esac
done
}
pruebasServlet_Jetty(){
echo ""
echo "-- MENU PRUEBAS SERVLET_JETTY --"
PS3="Seleccione la prueba a ejecutar: "
options=("Consulta" "InsertaryEliminar" "ContarPrimos" "MenuPrincipal")
select opt in "${options[@]}"
do
	case $opt in
		"Consulta")
		jmeter -n -t Consulta.jmx -l ./Servlet/ResultadosJetty/Consulta.jtl
		;;
		"InsertaryEliminar")
		jmeter -n -t InsertaryEliminar.jmx -l ./Servlet/ResultadosJetty/InsertaryEliminar.jtl
		;;
		"ContarPrimos")
		jmeter -n -t ContarPrimos.jmx -l ./Servlet/ResultadosJetty/ContarPrimos.jtl
		;;
		"MenuPrincipal")
		menumain
		;;
		*) echo "Invalid Option $Reply";;
	esac
done
}
pruebasNodeJS(){
echo ""
echo "-- MENU PRUEBAS NODEJS --"
PS3="Seleccione la prueba a ejecutar: "
options=("Consulta" "InsertaryEliminar" "ContarPrimos" "MenuPrincipal")
select opt in "${options[@]}"
do
	case $opt in
		"Consulta")
		jmeter -n -t Consulta.jmx -l ./NodeJS/Resultados/Consulta.jtl
		;;
		"InsertaryEliminar")
		jmeter -n -t InsertaryEliminar.jmx -l ./NodeJS/Resultados/InsertaryEliminar.jtl
		;;
		"ContarPrimos")
		jmeter -n -t ContarPrimos.jmx -l ./NodeJS/Resultados/ContarPrimos.jtl
		;;
		"MenuPrincipal")
		menumain
		;;
		*)echo "Invalid Option $Reply";;
	esac
done
}
menumain
