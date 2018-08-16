#!/bin/bash
# -*- ENCODING: UTF-8 -*-
mysql -u root -p$MYSQL_PASSWORD -e "CREATE USER 'performance'@'localhost' IDENTIFIED BY '123456'; GRANT ALL ON *.* TO 'performance'@'localhost'; FLUSH PRIVILEGES;"
mysql -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE < db.sql
