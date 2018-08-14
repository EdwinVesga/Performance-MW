#!/bin/bash
# -*- ENCODING: UTF-8 -*-
mysql -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE < db.sql
