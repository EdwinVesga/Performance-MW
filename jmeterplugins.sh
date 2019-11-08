#! /bin/bash
# Jmeter Plugin Manager

jmeter=$HOME/apache-jmeter-4.0
File=$jmeter/bin/user.properties
if [ ! -f "$jmeter/lib/ext/jmeter-plugins-manager-1.3.jar" ]
then
	wget -c http://search.maven.org/remotecontent?filepath=kg/apc/jmeter-plugins-manager/1.3/jmeter-plugins-manager-1.3.jar -O $jmeter/lib/ext/jmeter-plugins-manager-1.3.jar
else
	echo "jmeter-plugins-manager ya se encuentra instalado"
fi
if [ ! -f "$jmeter/lib/cmdrunner-2.2.jar" ]
then
	wget -c http://search.maven.org/remotecontent?filepath=kg/apc/cmdrunner/2.2/cmdrunner-2.2.jar -O $jmeter/lib/cmdrunner-2.2.jar
else
	echo "jmeter-cmdrunner ya se encuentra instalado"
fi
if [ ! -f "$jmeter/bin/PluginsManagerCMD.bat" ] && [ ! -f "$JMeterLocation/bin/PluginsManagerCMD.sh" ]
then
	java -cp $jmeter/lib/ext/jmeter-plugins-manager-1.3.jar org.jmeterplugins.repository.PluginManagerCMDInstaller
else
	echo "PluginsManagerCMD ya se encuentra instalado"
fi
if [ ! -f "$jmeter/lib/ext/jmeter-plugins-filterresults-2.2.jar" ]
then
	$jmeter/bin/PluginsManagerCMD.sh install jpgc-filterresults=2.2
else
	echo "jmeter-plugins-filterresults ya se encuentra instalado"
fi
if [ ! -f "$jmeter/lib/ext/jmeter-plugins-synthesis-2.2.jar" ]
then
	$jmeter/bin/PluginsManagerCMD.sh install jpgc-synthesis=2.2
else
	echo "jmeter-plugins-synthesis ya se encuentra instalado"
fi
if [ ! -f "$jmeter/lib/ext/jmeter-plugins-perfmon-2.1.jar" ]
then
	$jmeter/bin/PluginsManagerCMD.sh install jpgc-perfmon=2.1
else
	echo "jmeter-plugins-perfmon ya se encuentra instalado"
fi
if [ ! -f "$jmeter/lib/ext/jmeter-plugins-cmd-2.2.jar" ]
then
	$jmeter/bin/PluginsManagerCMD.sh install jpgc-cmd=2.2
else
	echo "jmeter-plugins-cmd ya se encuentra instalado"
fi
if [ ! -f "$jmeter/lib/ext/jmeter-plugins-casutg-2.6.jar" ]
then
	$jmeter/bin/PluginsManagerCMD.sh install jpgc-casutg=2.6
else
	echo "jmeter-plugins-casutg ya se encuentra instalado"
fi
if ! grep -q "jmeterPlugin.perfmon.interval" "$File"
then
	(echo ""; echo "jmeterPlugin.perfmon.interval=1000") >> $File
else
	echo "jmeterPlugin.perfmon.interval ya ha sido definido."
fi
