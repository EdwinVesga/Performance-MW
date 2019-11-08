#! /bin/bash
#Bloque de comandos para la prueba de Vertx.
#1. Iniciar los contenedores de la aplicación vertx.
menumain(){
echo ""
echo "-- MENU PRINCIPAL --"
PS3='Please enter your choice: '
options=("Desplegar Aplicación" "Ejecutar Prueba" "Detener Contenedores" "Eliminar Contenedores" "Eliminar Imagenes" "Clean Docker" "Detener PerfMon"
 "Instalar Plugins JMeter" "Quit")
select opt in "${options[@]}"
do
	case $opt in
		"Desplegar Aplicación")
		desplegar
		;;
		"Ejecutar Prueba")
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
		"Clean Docker")
		sudo docker system prune
		sudo docker rmi $(sudo docker images -q)>/dev/null 2>&1
		sudo docker volume rm $(sudo docker volume ls -qf dangling=true)
		;;
		"Detener PerfMon")
		echo "Ingrese la dirección IP del servidor"
		read k
		./server_agent_shutdown.sh $k
		rm -rf ./ServerAgent-2.2.3
		;;
		"Instalar Plugins JMeter")
		./jmeterplugins.sh
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
options=("Activar PerfMon" "VertX" "Servlet_Tomcat" "Servlet_Jetty" "NodeJS" "Regresar")
select opt in "${options[@]}"
do
	case $opt in
		"Activar PerfMon")
		./server_agent_script.sh
		;;
		"VertX")
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		if [ $y -eq 1 ]
		then
		bash -c 'cd ./VertX/BaseDeDatos_VertX && sudo docker-compose up --build'
		elif [ $y -eq 2 ]
		then
		gnome-terminal --tab -e "bash -c 'cd ./VertX/BaseDeDatos_VertX && sudo docker-compose up --build'"
		menumain
		else
		menumain
		fi
		;;
		"Servlet_Tomcat")
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		if [ $y -eq 1 ]
		then
		bash -c 'cd ./Servlet/Servlet_Tomcat && sudo docker-compose up --build'
		elif [ $y -eq 2 ]
		then
		gnome-terminal --tab -e "bash -c 'cd ./Servlet/Servlet_Tomcat && sudo docker-compose up --build'"
		menumain
		else
		menumain
		fi
		;;
		"Servlet_Jetty")
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		if [ $y -eq 1 ]
		then
		bash -c 'cd ./Servlet/Servlet_Jetty && sudo docker-compose up --build'
		elif [ $y -eq 2 ]
		then
		gnome-terminal --tab -e "bash -c 'cd ./Servlet/Servlet_Jetty && sudo docker-compose up --build'"
		menumain
		else
		menumain
		fi
		;;
		"NodeJS")
		echo -n "Modo de Prueba: 1)Remoto 2)Local 3)Regresar: "
		read y
		if [ $y -eq 1 ]
		then
		bash -c 'cd ./NodeJS && sudo docker-compose up --build'
		elif [ $y -eq 2 ]
		then
		gnome-terminal --tab -e "bash -c 'cd ./NodeJS && sudo docker-compose up --build'"
		menumain
		else
		menumain
		fi
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
options=("VertX" "Tomcat" "Jetty" "NodeJS" "Regresar")
select opt in "${options[@]}"
do
	case $opt in
		"VertX")
		p="VertX"
		pruebaApp $p
		;;
		"Tomcat")
		p="Tomcat"
		pruebaApp $p
		;;
		"Jetty")
		p="Jetty"
		pruebaApp $p
		;;
		"NodeJS")
		p="NodeJS"
		pruebaApp $p
		;;
		"Regresar")
		menumain
		;;
		*) echo "Invalid Option $Reply";;
	esac
done
}

pruebaApp(){
echo ""
echo "-- MENU PRUEBAS $1 --"
PS3="Seleccione la prueba a ejecutar: "
options=("PruebaRendimientoConsulta" "PruebaRendimientoInsertar" "PruebaRendimientoContarPrimos" "PruebaCargaConsulta" "PruebaEstrésConsulta" "MenuPrincipal")
select opt in "${options[@]}"
do
	case $opt in
		"PruebaRendimientoConsulta")
		p="Consulta"
		dirPrueba $1 $p
		;;
		"PruebaRendimientoInsertar")
		p="Insertar"
		dirPrueba $1 $p
		;;
		"PruebaRendimientoContarPrimos")
		p="ContarPrimos"
		dirPrueba $1 $p
		;;
		"PruebaCargaConsulta")
		p="CargaConsulta"
		dirPruebaExclusiva $1 $p
		;;
		"PruebaEstrésConsulta")
		p="PicoConsulta"
		dirPruebaExclusiva $1 $p
		;;
		"MenuPrincipal")
		menumain
		;;
		*) echo "Invalid Option $Reply";;
	esac
done
}

dirPrueba(){
echo -n "Modo de Prueba: 1)AWS 2)Local 3)Regresar: "
read y
echo -n "Ingrese el número de veces que desea ejecutar la prueba: "
read x
echo -n "Ingrese el Periodo: "
read z
if [ $1 = "VertX" ] || [ $1 = "NodeJS" ]
then
	if [ $y -eq 1 ]
	then
	p=./$1/ResultadosRemotosAWS/Periodo$z
	echo ""
	echo "Ingrese el host del servidor AWS: "
	read j
	elif [ $y -eq 2 ]
	then
	p=./$1/Resultados/Periodo$z
	j=localhost
	else
	menumain
	fi
	prueba$2 $x $p $j $z
elif [ $1 = "Tomcat" ] || [ $1 = "Jetty" ]
then
	if [ $y -eq 1 ]
	then
	p=./Servlet/Resultados$1RemotosAWS/Periodo$z
	echo ""
	echo "Ingrese el host del servidor AWS: "
	read j
	elif [ $y -eq 2 ]
	then
	p=./Servlet/Resultados$1/Periodo$z
	j=localhost
	else
	menumain
	fi
	prueba$2 $x $p $j $z
fi
}

dirPruebaExclusiva(){
echo -n "Modo de Prueba: 1)AWS 2)Local 3)Regresar: "
read y
echo -n "Ingrese el valor Limite de Solicitudes: "
read x
if [ $1 = "VertX" ] || [ $1 = "NodeJS" ]
then
		if [ $y -eq 1 ]
		then
		p=./$1/ResultadosRemotosAWS/Prueba$2
		echo ""
		echo "Ingrese el host del servidor AWS: "
		read j
		elif [ $y -eq 2 ]
		then
		p=./$1/Resultados/Prueba$2
		j=localhost
		else
		menumain
		fi
		prueba$2 $p $j $x
elif [ $1 = "Tomcat" ] || [ $1 = "Jetty" ]
then
		if [ $y -eq 1 ]
		then
		p=./Servlet/Resultados$1RemotosAWS/Prueba$2
		echo ""
		echo "Ingrese el host del servidor AWS: "
		read j
		elif [ $y -eq 2 ]
		then
		p=./Servlet/Resultados$1/Prueba$2
		j=localhost
		else
		menumain
		fi
		prueba$2 $p $j $x
fi
}


pruebaConsulta(){
for ((a=1; a <= $1; a++))
do
	rm -rf $2/Consulta$a/*
	mkdir -p $2/Consulta$a
	N=(1000 2000 3000)
	c=(1 2 3)
	ruta=$2/Consulta$a
	for i in ${N[@]}
	do
		for j in ${c[@]}
		do
		resultfile=Consulta"$i"_$j.csv
		perfMonFile=PerfMon_Consulta"$i"_$j.csv
		$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -JDominio=$3 -JPeriodo=$4 -JRuta=$ruta/$perfMonFile -t ./Jmeter_Test/TG_$i/Consulta$j.jmx -l $ruta/$resultfile
		$HOME/apache-jmeter-4.0/bin/shutdown.sh
		done
	done
	for i in ${N[@]}
	do
		for j in ${c[@]}
		do
		resultfile=Consulta"$i"_$j.csv
		$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $ruta/$resultfile -o $ruta/index"$i"_$j/
		$HOME/apache-jmeter-4.0/bin/shutdown.sh
		done
	done
done
}

pruebaInsertar(){
for ((a=1; a <= $1; a++))
do
	rm -rf $2/Insertar$a/*
	mkdir -p $2/Insertar$a
	N=(1000 2000 3000)
	c=(1 2 3)
	ruta=$2/Insertar$a
	for i in ${N[@]}
	do
		for j in ${c[@]}
		do
		resultfile=Insertar"$i"_$j.csv
		perfMonFile=PerfMon_Insertar"$i"_$j.csv
		$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -JDominio=$3 -JPeriodo=$4 -JRuta=$ruta/$perfMonFile -t ./Jmeter_Test/TG_$i/Insertar$j.jmx -l $ruta/$resultfile
		$HOME/apache-jmeter-4.0/bin/shutdown.sh
		done
	done
	for i in ${N[@]}
	do
		for j in ${c[@]}
		do
		resultfile=Insertar"$i"_$j.csv
		$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $ruta/$resultfile -o $ruta/index"$i"_$j/
		$HOME/apache-jmeter-4.0/bin/shutdown.sh
		done
	done
done
}

pruebaContarPrimos(){
for ((a=1; a <= $1; a++))
do
	rm -rf $2/ContarPrimos$a/*
	mkdir -p $2/ContarPrimos$a
	N=(1000 2000 3000)
	c=(1 2 3)
	ruta=$2/ContarPrimos$a
	for i in ${N[@]}
	do
		for j in ${c[@]}
		do
		resultfile=ContarPrimos"$i"_$j.csv
		perfMonFile=PerfMon_ContarPrimos"$i"_$j.csv
		$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -JDominio=$3 -JPeriodo=$4 -JRuta=$ruta/$perfMonFile -t ./Jmeter_Test/TG_$i/ContarPrimos$j.jmx -l $ruta/$resultfile
		$HOME/apache-jmeter-4.0/bin/shutdown.sh
		done
	done
	for i in ${N[@]}
	do
		for j in ${c[@]}
		do
		resultfile=ContarPrimos"$i"_$j.csv
		$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $ruta/$resultfile -o $ruta/index"$i"_$j/
		$HOME/apache-jmeter-4.0/bin/shutdown.sh
		done
	done
done
}


pruebaCargaConsulta(){

mkdir -p $1/
resultfile=CargaConsulta_$3.csv
perfMonFile=PerfMon_CargaConsulta_$3.csv
$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -JDominio=$2 -JRuta=$1/$perfMonFile -JLimite=$3 -t ./Jmeter_Test/PruebaCarga/CargaConsulta.jmx -l $1/$resultfile
$HOME/apache-jmeter-4.0/bin/shutdown.sh
$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $1/$resultfile -o $1/index_$3/
$HOME/apache-jmeter-4.0/bin/shutdown.sh

}


pruebaPicoConsulta(){

mkdir -p $1/
resultfile=PicoConsulta_$3.csv
perfMonFile=PerfMon_PicoConsulta_$3.csv
$HOME/apache-jmeter-4.0/bin/jmeter.sh -n -JDominio=$2 -JRuta=$1/$perfMonFile -JLimite=$3 -t ./Jmeter_Test/PruebaPico/PicoConsulta.jmx -l $1/$resultfile
$HOME/apache-jmeter-4.0/bin/shutdown.sh
$HOME/apache-jmeter-4.0/bin/jmeter.sh -g $1/$resultfile -o $1/index_$3/
$HOME/apache-jmeter-4.0/bin/shutdown.sh

}

menumain
