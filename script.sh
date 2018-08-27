#! /bin/bash
#Bloque de comandos para la prueba de Vertx.
#1. Iniciar los contenedores de la aplicación vertx.
menumain(){
echo ""
echo "-- MENU PRINCIPAL --"
PS3='Please enter your choice: '
options=("Desplegar Aplicación" "Llenar Tablas Consulta" "Ejecutar Prueba" "Detener Contenedores" "Eliminar Contenedores" "Eliminar Imagenes" "Subir a GitHub" "Quit")
select opt in "${options[@]}"
do
	case $opt in
		"Desplegar Aplicación")
		desplegar
		;;
		"Llenar Tablas Consulta")
		llenarTablas
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
		rm -rf ./VertX/Resultados/Consulta/*
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		echo -n "Ingrese el número de veces que desea ejecutar la prueba: "
		read x
		if [ $y -eq 1 ]
		then
		p=./VertX/ResultadosRemotos
		j=./Jmeter_Test/Remoto
		elif [ $y -eq 2 ]
		then
		p=./VertX/Resultados
		j=./Jmeter_Test
		else
		menumain
		fi
		for ((a=1; a <= x; a++))
		do
			mkdir -p $p/Consulta$a
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/Consulta1.jmx -l $p/Consulta$a/Consulta100_1.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/Consulta2.jmx -l $p/Consulta$a/Consulta100_2.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/Consulta3.jmx -l $p/Consulta$a/Consulta100_3.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/Consulta1.jmx -l $p/Consulta$a/Consulta500_1.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/Consulta2.jmx -l $p/Consulta$a/Consulta500_2.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/Consulta3.jmx -l $p/Consulta$a/Consulta500_3.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/Consulta1.jmx -l $p/Consulta$a/Consulta1000_1.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/Consulta2.jmx -l $p/Consulta$a/Consulta1000_2.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/Consulta3.jmx -l $p/Consulta$a/Consulta1000_3.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta100_1.csv -o $p/Consulta$a/index100_1/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta100_2.csv -o $p/Consulta$a/index100_2/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta100_3.csv -o $p/Consulta$a/index100_3/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta500_1.csv -o $p/Consulta$a/index500_1/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta500_2.csv -o $p/Consulta$a/index500_2/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta500_3.csv -o $p/Consulta$a/index500_3/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta1000_1.csv -o $p/Consulta$a/index1000_1/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta1000_2.csv -o $p/Consulta$a/index1000_2/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta1000_3.csv -o $p/Consulta$a/index1000_3/
 		done
		;;
		"InsertaryEliminar")
		rm -rf ./VertX/Resultados/InsertaryEliminar/*
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		echo -n "Ingrese el número de veces que desea ejecutar la prueba: "
		read x
		if [ $y -eq 1 ]
		then
		p=./VertX/ResultadosRemotos
		j=./Jmeter_Test/Remoto
		elif [ $y -eq 2 ]
		then
		p=./VertX/Resultados
		j=./Jmeter_Test
		else
		menumain
		fi
		for ((a=1; a <= x; a++))
		do
			mkdir -p $p/InsertaryEliminar$a
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/InsertaryEliminar.jmx -l $p/InsertaryEliminar$a/InsertaryEliminar100.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/InsertaryEliminar.jmx -l $p/InsertaryEliminar$a/InsertaryEliminar500.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/InsertaryEliminar.jmx -l $p/InsertaryEliminar$a/InsertaryEliminar1000.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/InsertaryEliminar$a/InsertaryEliminar100.csv -o $p/InsertaryEliminar$a/index100/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/InsertaryEliminar$a/InsertaryEliminar500.csv -o $p/InsertaryEliminar$a/index500/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/InsertaryEliminar$a/InsertaryEliminar1000.csv -o $p/InsertaryEliminar$a/index1000/
		done
		;;
		"ContarPrimos")
		rm -rf ./VertX/Resultados/ContarPrimos/*
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		echo -n "Ingrese el número de veces que desea ejecutar la prueba: "
		read x
		if [ $y -eq 1 ]
		then
		p=./VertX/ResultadosRemotos
		j=./Jmeter_Test/Remoto
		elif [ $y -eq 2 ]
		then
		p=./VertX/Resultados
		j=./Jmeter_Test
		else
		menumain
		fi
		for ((a=1; a <= x; a++))
		do
			mkdir -p $p/ContarPrimos$a
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/ContarPrimos.jmx -l $p/ContarPrimos$a/ContarPrimos100.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/ContarPrimos.jmx -l $p/ContarPrimos$a/ContarPrimos500.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/ContarPrimos.jmx -l $p/ContarPrimos$a/ContarPrimos1000.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/ContarPrimos$a/ContarPrimos100.csv -o $p/ContarPrimos$a/index100/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/ContarPrimos$a/ContarPrimos500.csv -o $p/ContarPrimos$a/index500/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/ContarPrimos$a/ContarPrimos1000.csv -o $p/ContarPrimos$a/index1000/
		done
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
		rm -rf ./Servlet/ResultadosTomcat/Consulta/*
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		echo -n "Ingrese el número de veces que desea ejecutar la prueba: "
		read x
		if [ $y -eq 1 ]
		then
		p=./Servlet/ResultadosTomcatRemotos
		j=./Jmeter_Test/Remoto
		elif [ $y -eq 2 ]
		then
		p=./Servlet/ResultadosTomcat
		j=./Jmeter_Test
		else
		menumain
		fi
		for ((a=1; a <= x; a++))
		do
			mkdir -p $p/Consulta$a
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/Consulta1.jmx -l $p/Consulta$a/Consulta100_1.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/Consulta2.jmx -l $p/Consulta$a/Consulta100_2.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/Consulta3.jmx -l $p/Consulta$a/Consulta100_3.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/Consulta1.jmx -l $p/Consulta$a/Consulta500_1.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/Consulta2.jmx -l $p/Consulta$a/Consulta500_2.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/Consulta3.jmx -l $p/Consulta$a/Consulta500_3.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/Consulta1.jmx -l $p/Consulta$a/Consulta1000_1.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/Consulta2.jmx -l $p/Consulta$a/Consulta1000_2.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/Consulta3.jmx -l $p/Consulta$a/Consulta1000_3.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta100_1.csv -o $p/Consulta$a/index100_1/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta100_2.csv -o $p/Consulta$a/index100_2/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta100_3.csv -o $p/Consulta$a/index100_3/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta500_1.csv -o $p/Consulta$a/index500_1/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta500_2.csv -o $p/Consulta$a/index500_2/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta500_3.csv -o $p/Consulta$a/index500_3/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta1000_1.csv -o $p/Consulta$a/index1000_1/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta1000_2.csv -o $p/Consulta$a/index1000_2/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta1000_3.csv -o $p/Consulta$a/index1000_3/
 		done
		;;
		"InsertaryEliminar")
		rm -rf ./Servlet/ResultadosTomcat/InsertaryEliminar/*
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		echo -n "Ingrese el número de veces que desea ejecutar la prueba: "
		read x
		if [ $y -eq 1 ]
		then
		p=./Servlet/ResultadosTomcatRemotos
		j=./Jmeter_Test/Remoto
		elif [ $y -eq 2 ]
		then
		p=./Servlet/ResultadosTomcat
		j=./Jmeter_Test
		else
		menumain
		fi
		for ((a=1; a <= x; a++))
		do
			mkdir -p $p/InsertaryEliminar$a
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/InsertaryEliminar.jmx -l $p/InsertaryEliminar$a/InsertaryEliminar100.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/InsertaryEliminar.jmx -l $p/InsertaryEliminar$a/InsertaryEliminar500.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/InsertaryEliminar.jmx -l $p/InsertaryEliminar$a/InsertaryEliminar1000.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/InsertaryEliminar$a/InsertaryEliminar100.csv -o $p/InsertaryEliminar$a/index100/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/InsertaryEliminar$a/InsertaryEliminar500.csv -o $p/InsertaryEliminar$a/index500/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/InsertaryEliminar$a/InsertaryEliminar1000.csv -o $p/InsertaryEliminar$a/index1000/
		done
		;;
		"ContarPrimos")
		rm -rf ./Servlet/ResultadosTomcat/ContarPrimos/*
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		echo -n "Ingrese el número de veces que desea ejecutar la prueba: "
		read x
		if [ $y -eq 1 ]
		then
		p=./Servlet/ResultadosTomcatRemotos
		j=./Jmeter_Test/Remoto
		elif [ $y -eq 2 ]
		then
		p=./Servlet/ResultadosTomcat
		j=./Jmeter_Test
		else
		menumain
		fi
		for ((a=1; a <= x; a++))
		do
			mkdir -p $p/ContarPrimos$a
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/ContarPrimos.jmx -l $p/ContarPrimos$a/ContarPrimos100.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/ContarPrimos.jmx -l $p/ContarPrimos$a/ContarPrimos500.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/ContarPrimos.jmx -l $p/ContarPrimos$a/ContarPrimos1000.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/ContarPrimos$a/ContarPrimos100.csv -o $p/ContarPrimos$a/index100/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/ContarPrimos$a/ContarPrimos500.csv -o $p/ContarPrimos$a/index500/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/ContarPrimos$a/ContarPrimos1000.csv -o $p/ContarPrimos$a/index1000/
		done
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
		rm -rf ./Servlet/ResultadosJetty/Consulta/*
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		echo -n "Ingrese el número de veces que desea ejecutar la prueba: "
		read x
		if [ $y -eq 1 ]
		then
		p=./Servlet/ResultadosJettyRemotos
		j=./Jmeter_Test/Remoto
		elif [ $y -eq 2 ]
		then
		p=./Servlet/ResultadosJetty
		j=./Jmeter_Test
		else
		menumain
		fi
		for ((a=1; a <= x; a++))
		do
			mkdir -p $p/Consulta$a
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/Consulta1.jmx -l $p/Consulta$a/Consulta100_1.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/Consulta2.jmx -l $p/Consulta$a/Consulta100_2.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/Consulta3.jmx -l $p/Consulta$a/Consulta100_3.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/Consulta1.jmx -l $p/Consulta$a/Consulta500_1.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/Consulta2.jmx -l $p/Consulta$a/Consulta500_2.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/Consulta3.jmx -l $p/Consulta$a/Consulta500_3.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/Consulta1.jmx -l $p/Consulta$a/Consulta1000_1.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/Consulta2.jmx -l $p/Consulta$a/Consulta1000_2.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/Consulta3.jmx -l $p/Consulta$a/Consulta1000_3.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta100_1.csv -o $p/Consulta$a/index100_1/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta100_2.csv -o $p/Consulta$a/index100_2/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta100_3.csv -o $p/Consulta$a/index100_3/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta500_1.csv -o $p/Consulta$a/index500_1/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta500_2.csv -o $p/Consulta$a/index500_2/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta500_3.csv -o $p/Consulta$a/index500_3/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta1000_1.csv -o $p/Consulta$a/index1000_1/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta1000_2.csv -o $p/Consulta$a/index1000_2/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta1000_3.csv -o $p/Consulta$a/index1000_3/
 		done
		;;
		"InsertaryEliminar")
		rm -rf ./Servlet/ResultadosJetty/InsertaryEliminar/*
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		echo -n "Ingrese el número de veces que desea ejecutar la prueba: "
		read x
		if [ $y -eq 1 ]
		then
		p=./Servlet/ResultadosJettyRemotos
		j=./Jmeter_Test/Remoto
		elif [ $y -eq 2 ]
		then
		p=./Servlet/ResultadosJetty
		j=./Jmeter_Test
		else
		menumain
		fi
		for ((a=1; a <= x; a++))
		do
			mkdir -p $p/InsertaryEliminar$a
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/InsertaryEliminar.jmx -l $p/InsertaryEliminar$a/InsertaryEliminar100.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/InsertaryEliminar.jmx -l $p/InsertaryEliminar$a/InsertaryEliminar500.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/InsertaryEliminar.jmx -l $p/InsertaryEliminar$a/InsertaryEliminar1000.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/InsertaryEliminar$a/InsertaryEliminar100.csv -o $p/InsertaryEliminar$a/index100/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/InsertaryEliminar$a/InsertaryEliminar500.csv -o $p/InsertaryEliminar$a/index500/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/InsertaryEliminar$a/InsertaryEliminar1000.csv -o $p/InsertaryEliminar$a/index1000/
		done
		;;
		"ContarPrimos")
		rm -rf ./Servlet/ResultadosJetty/ContarPrimos/*
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		echo -n "Ingrese el número de veces que desea ejecutar la prueba: "
		read x
		if [ $y -eq 1 ]
		then
		p=./Servlet/ResultadosJettyRemotos
		j=./Jmeter_Test/Remoto
		elif [ $y -eq 2 ]
		then
		p=./Servlet/ResultadosJetty
		j=./Jmeter_Test
		else
		menumain
		fi
		for ((a=1; a <= x; a++))
		do
			mkdir -p $p/ContarPrimos$a
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/ContarPrimos.jmx -l $p/ContarPrimos$a/ContarPrimos100.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/ContarPrimos.jmx -l $p/ContarPrimos$a/ContarPrimos500.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/ContarPrimos.jmx -l $p/ContarPrimos$a/ContarPrimos1000.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/ContarPrimos$a/ContarPrimos100.csv -o $p/ContarPrimos$a/index100/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/ContarPrimos$a/ContarPrimos500.csv -o $p/ContarPrimos$a/index500/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/ContarPrimos$a/ContarPrimos1000.csv -o $p/ContarPrimos$a/index1000/
		done
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
		rm -rf ./NodeJS/Resultados/Consulta/*
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		echo -n "Ingrese el número de veces que desea ejecutar la prueba: "
		read x
		if [ $y -eq 1 ]
		then
		p=./NodeJS/ResultadosRemotos
		j=./Jmeter_Test/Remoto
		elif [ $y -eq 2 ]
		then
		p=./NodeJS/Resultados
		j=./Jmeter_Test
		else
		menumain
		fi
		for ((a=1; a <= x; a++))
		do
			mkdir -p $p/Consulta$a
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/Consulta1.jmx -l $p/Consulta$a/Consulta100_1.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/Consulta2.jmx -l $p/Consulta$a/Consulta100_2.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/Consulta3.jmx -l $p/Consulta$a/Consulta100_3.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/Consulta1.jmx -l $p/Consulta$a/Consulta500_1.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/Consulta2.jmx -l $p/Consulta$a/Consulta500_2.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/Consulta3.jmx -l $p/Consulta$a/Consulta500_3.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/Consulta1.jmx -l $p/Consulta$a/Consulta1000_1.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/Consulta2.jmx -l $p/Consulta$a/Consulta1000_2.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/Consulta3.jmx -l $p/Consulta$a/Consulta1000_3.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta100_1.csv -o $p/Consulta$a/index100_1/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta100_2.csv -o $p/Consulta$a/index100_2/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta100_3.csv -o $p/Consulta$a/index100_3/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta500_1.csv -o $p/Consulta$a/index500_1/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta500_2.csv -o $p/Consulta$a/index500_2/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta500_3.csv -o $p/Consulta$a/index500_3/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta1000_1.csv -o $p/Consulta$a/index1000_1/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta1000_2.csv -o $p/Consulta$a/index1000_2/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/Consulta$a/Consulta1000_3.csv -o $p/Consulta$a/index1000_3/
 		done
		;;
		"InsertaryEliminar")
		rm -rf ./NodeJS/Resultados/InsertaryEliminar/*
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		echo -n "Ingrese el número de veces que desea ejecutar la prueba: "
		read x
		if [ $y -eq 1 ]
		then
		p=./NodeJS/ResultadosRemotos
		j=./Jmeter_Test/Remoto
		elif [ $y -eq 2 ]
		then
		p=./NodeJS/Resultados
		j=./Jmeter_Test
		else
		menumain
		fi
		for ((a=1; a <= x; a++))
		do
			mkdir -p $p/InsertaryEliminar$a
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/InsertaryEliminar.jmx -l $p/InsertaryEliminar$a/InsertaryEliminar100.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/InsertaryEliminar.jmx -l $p/InsertaryEliminar$a/InsertaryEliminar500.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/InsertaryEliminar.jmx -l $p/InsertaryEliminar$a/InsertaryEliminar1000.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/InsertaryEliminar$a/InsertaryEliminar100.csv -o $p/InsertaryEliminar$a/index100/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/InsertaryEliminar$a/InsertaryEliminar500.csv -o $p/InsertaryEliminar$a/index500/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/InsertaryEliminar$a/InsertaryEliminar1000.csv -o $p/InsertaryEliminar$a/index1000/
		done
		;;
		"ContarPrimos")
		rm -rf ./NodeJS/Resultados/ContarPrimos/*
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		echo -n "Ingrese el número de veces que desea ejecutar la prueba: "
		read x
		if [ $y -eq 1 ]
		then
		p=./NodeJS/ResultadosRemotos
		j=./Jmeter_Test/Remoto
		elif [ $y -eq 2 ]
		then
		p=./NodeJS/Resultados
		j=./Jmeter_Test
		else
		menumain
		fi
		for ((a=1; a <= x; a++))
		do
			mkdir -p $p/ContarPrimos$a
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_100/ContarPrimos.jmx -l $p/ContarPrimos$a/ContarPrimos100.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_500/ContarPrimos.jmx -l $p/ContarPrimos$a/ContarPrimos500.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/TG_1000/ContarPrimos.jmx -l $p/ContarPrimos$a/ContarPrimos1000.csv
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/ContarPrimos$a/ContarPrimos100.csv -o $p/ContarPrimos$a/index100/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/ContarPrimos$a/ContarPrimos500.csv -o $p/ContarPrimos$a/index500/
			$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $p/ContarPrimos$a/ContarPrimos1000.csv -o $p/ContarPrimos$a/index1000/
		done
		;;
		"MenuPrincipal")
		menumain
		;;
		*)echo "Invalid Option $Reply";;
	esac
done
}

llenarTablas(){
	echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
	read y
	if [ $y -eq 1 ]
	then
	j=./Jmeter_Test/Remoto
	elif [ $y -eq 2 ]
	then
	j=./Jmeter_Test
	else
	menumain
	fi
	$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/Insertar1000.jmx -l $j/Insertar1000.csv
	$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/Insertar10000.jmx -l $j/Insertar10000.csv
	$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -t $j/Insertar100000.jmx -l $j/Insertar100000.csv
}

menumain
