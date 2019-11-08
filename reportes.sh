#! /bin/bash

CMDRunner=$HOME/apache-jmeter-4.0/bin/JMeterPluginsCMD.sh
results_vertx=./VertX/ResultadosRemotosAWS
results_tomcat=./Servlet/ResultadosTomcatRemotosAWS
results_nodejs=./NodeJS/ResultadosRemotosAWS
results_jetty=./Servlet/ResultadosJettyRemotosAWS
n=(1 2 3 4 5)
casos=(Insertar Consulta ContarPrimos)
periodos=(Periodo6 Periodo8 Periodo10)
requests=(1000 2000 3000)
escenarios=(1 2 3)

for i in $results_vertx $results_tomcat $results_nodejs $results_jetty
do
#	if [ ! -f "$i/PruebaEstres/Summary_EstresInsertar.csv" ]
#	then
#		$CMDRunner --generate-csv $i/PruebaEstres/Summary_EstresInsertar.csv --input-jtl $i/PruebaEstres/EstresInsertar.csv --plugin-type AggregateReport
#	fi
	if [ ! -f "$i/PruebaCargaConsulta/Summary_CargaConsulta.csv" ]
	then
		$CMDRunner --generate-csv $i/PruebaCargaConsulta/Summary_CargaConsulta.csv --input-jtl $i/PruebaCargaConsulta/CargaConsulta.csv --plugin-type AggregateReport
	fi
	if [ ! -f "$i/PruebaCargaConsulta/Summary_CargaConsultaLimite.csv" ]
	then
		$CMDRunner --generate-csv $i/PruebaCargaConsulta/Summary_CargaConsultaLimite.csv --input-jtl $i/PruebaCargaConsulta/CargaConsultaLimite.csv --plugin-type AggregateReport
	fi
	if [ ! -f "$i/PruebaPicoConsulta/Summary_PicoConsulta.csv" ]
	then
		$CMDRunner --generate-csv $i/PruebaPicoConsulta/Summary_PicoConsulta.csv --input-jtl $i/PruebaPicoConsulta/PicoConsulta.csv --plugin-type AggregateReport
	fi
done

for i in $results_vertx $results_tomcat $results_nodejs $results_jetty
do
	for j in ${periodos[@]}
	do
		for k in ${casos[@]}
		do
			for l in ${n[@]}
			do
				for m in ${requests[@]}
				do
					for o in ${escenarios[@]}
					do
						if [ ! -f $i/$j/$k$l/Summary_"$k$m"_$o.csv ]
						then
						$CMDRunner --generate-csv $i/$j/$k$l/Summary_"$k$m"_$o.csv --input-jtl $i/$j/$k$l/"$k$m"_$o.csv --plugin-type AggregateReport
						fi
					done
				done
			done
		done
	done
done
