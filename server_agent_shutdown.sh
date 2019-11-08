#! /bin/bash
# parameter=host
(
echo open "$1 4444"
sleep 2
echo "shutdown"
sleep 2
)|telnet
