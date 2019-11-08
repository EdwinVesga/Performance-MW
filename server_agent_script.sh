#! /bin/bash

# Se descarga el agente del jmeter-plugin-perfmon en el servidor

if [ ! -f "./ServerAgent-2.2.3/startAgent.sh" ]
then
	wget https://github.com/undera/perfmon-agent/releases/download/2.2.3/ServerAgent-2.2.3.zip >/dev/null 2>&1
	unzip ServerAgent-2.2.3.zip >/dev/null 2>&1
	rm -f ServerAgent-2.2.3.zip >/dev/null 2>&1
fi

# Se inicia el Agente del PerfMon en el Servidor donde se ejecuta la aplicación
./ServerAgent-2.2.3/startAgent.sh &
sleep 2
