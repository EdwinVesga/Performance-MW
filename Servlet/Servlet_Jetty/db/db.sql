CREATE DATABASE IF NOT EXISTS universidad; use universidad;
CREATE TABLE IF NOT EXISTS estudiante (
  id_est varchar(36) NOT NULL,
  primer_nombre_est varchar(50) NOT NULL,
  segundo_nombre_est varchar(50) DEFAULT NULL,
  primer_apellido_est varchar(50) NOT NULL,
  segundo_apellido_est varchar(50) NOT NULL,
  semestre_est int(11) NOT NULL,
  fecha_ingreso_est date NOT NULL,
  PRIMARY KEY (id_est),
  UNIQUE KEY id_est (id_est)
);
CREATE TABLE IF NOT EXISTS materia (
  id_materia varchar(36) NOT NULL,
  nombre_materia varchar(50) NOT NULL,
  salon_materia varchar(50) NOT NULL,
  horario_materia varchar(50) NOT NULL,
  PRIMARY KEY (id_materia),
  UNIQUE KEY id_materia (id_materia)
);
CREATE TABLE IF NOT EXISTS profesor (
  id_prof varchar(36) NOT NULL,
  primer_nombre_prof varchar(50) NOT NULL,
  segundo_nombre_prof varchar(50) DEFAULT NULL,
  primer_apellido_prof varchar(50) NOT NULL,
  segundo_apellido_prof varchar(50) NOT NULL,
  escuela_prof varchar(50) NOT NULL,
  fecha_incorporacion_prof date NOT NULL,
  PRIMARY KEY (id_prof),
  UNIQUE KEY id_prof (id_prof)
);

CREATE TABLE IF NOT EXISTS `estudianteA` (
  `id_est` varchar(36) NOT NULL,
  `primer_nombre_est` varchar(50) NOT NULL,
  `segundo_nombre_est` varchar(50) DEFAULT NULL,
  `primer_apellido_est` varchar(50) NOT NULL,
  `segundo_apellido_est` varchar(50) NOT NULL,
  `semestre_est` int(11) NOT NULL,
  `fecha_ingreso_est` date NOT NULL,
  PRIMARY KEY (`id_est`),
  UNIQUE KEY `id_est` (`id_est`)
);
CREATE TABLE IF NOT EXISTS `materiaA` (
  `id_materia` varchar(36) NOT NULL,
  `nombre_materia` varchar(50) NOT NULL,
  `salon_materia` varchar(50) NOT NULL,
  `horario_materia` varchar(50) NOT NULL,
  PRIMARY KEY (`id_materia`),
  UNIQUE KEY `id_materia` (`id_materia`)
);
CREATE TABLE IF NOT EXISTS `profesorA` (
  `id_prof` varchar(36) NOT NULL,
  `primer_nombre_prof` varchar(50) NOT NULL,
  `segundo_nombre_prof` varchar(50) DEFAULT NULL,
  `primer_apellido_prof` varchar(50) NOT NULL,
  `segundo_apellido_prof` varchar(50) NOT NULL,
  `escuela_prof` varchar(50) NOT NULL,
  `fecha_incorporacion_prof` date NOT NULL,
  PRIMARY KEY (`id_prof`),
  UNIQUE KEY `id_prof` (`id_prof`)
);

CREATE TABLE IF NOT EXISTS `estudianteB` (
  `id_est` varchar(36) NOT NULL,
  `primer_nombre_est` varchar(50) NOT NULL,
  `segundo_nombre_est` varchar(50) DEFAULT NULL,
  `primer_apellido_est` varchar(50) NOT NULL,
  `segundo_apellido_est` varchar(50) NOT NULL,
  `semestre_est` int(11) NOT NULL,
  `fecha_ingreso_est` date NOT NULL,
  PRIMARY KEY (`id_est`),
  UNIQUE KEY `id_est` (`id_est`)
);
CREATE TABLE IF NOT EXISTS `materiaB` (
  `id_materia` varchar(36) NOT NULL,
  `nombre_materia` varchar(50) NOT NULL,
  `salon_materia` varchar(50) NOT NULL,
  `horario_materia` varchar(50) NOT NULL,
  PRIMARY KEY (`id_materia`),
  UNIQUE KEY `id_materia` (`id_materia`)
);
CREATE TABLE IF NOT EXISTS `profesorB` (
  `id_prof` varchar(36) NOT NULL,
  `primer_nombre_prof` varchar(50) NOT NULL,
  `segundo_nombre_prof` varchar(50) DEFAULT NULL,
  `primer_apellido_prof` varchar(50) NOT NULL,
  `segundo_apellido_prof` varchar(50) NOT NULL,
  `escuela_prof` varchar(50) NOT NULL,
  `fecha_incorporacion_prof` date NOT NULL,
  PRIMARY KEY (`id_prof`),
  UNIQUE KEY `id_prof` (`id_prof`)
);

CREATE TABLE IF NOT EXISTS `estudianteC` (
  `id_est` varchar(36) NOT NULL,
  `primer_nombre_est` varchar(50) NOT NULL,
  `segundo_nombre_est` varchar(50) DEFAULT NULL,
  `primer_apellido_est` varchar(50) NOT NULL,
  `segundo_apellido_est` varchar(50) NOT NULL,
  `semestre_est` int(11) NOT NULL,
  `fecha_ingreso_est` date NOT NULL,
  PRIMARY KEY (`id_est`),
  UNIQUE KEY `id_est` (`id_est`)
);
CREATE TABLE IF NOT EXISTS `materiaC` (
  `id_materia` varchar(36) NOT NULL,
  `nombre_materia` varchar(50) NOT NULL,
  `salon_materia` varchar(50) NOT NULL,
  `horario_materia` varchar(50) NOT NULL,
  PRIMARY KEY (`id_materia`),
  UNIQUE KEY `id_materia` (`id_materia`)
);
CREATE TABLE IF NOT EXISTS `profesorC` (
  `id_prof` varchar(36) NOT NULL,
  `primer_nombre_prof` varchar(50) NOT NULL,
  `segundo_nombre_prof` varchar(50) DEFAULT NULL,
  `primer_apellido_prof` varchar(50) NOT NULL,
  `segundo_apellido_prof` varchar(50) NOT NULL,
  `escuela_prof` varchar(50) NOT NULL,
  `fecha_incorporacion_prof` date NOT NULL,
  PRIMARY KEY (`id_prof`),
  UNIQUE KEY `id_prof` (`id_prof`)
);

DELIMITER //
CREATE DEFINER=`performance`@`%` PROCEDURE `InsertarTablasDeConsultas`()
BEGIN
DECLARE aleatorio VARCHAR(11);
DECLARE x  INT;

SET x = 1;

WHILE x  <= 1000 DO

 SET  x = x + 1; 
 SET aleatorio = TRUNCATE(RAND()*10000,0);
 INSERT INTO estudianteA VALUES(UUID(), aleatorio, aleatorio, aleatorio, aleatorio, aleatorio, '2014-11-11');
 INSERT INTO estudianteB VALUES(UUID(), aleatorio, aleatorio, aleatorio, aleatorio, aleatorio, '2014-11-11');
 INSERT INTO estudianteC VALUES(UUID(), aleatorio, aleatorio, aleatorio, aleatorio, aleatorio, '2014-11-11');

END WHILE;

WHILE x  <= 5000 DO

 SET  x = x + 1; 
 SET aleatorio = TRUNCATE(RAND()*10000,0);
 INSERT INTO estudianteB VALUES(UUID(), aleatorio, aleatorio, aleatorio, aleatorio, aleatorio, '2014-11-11');
 INSERT INTO estudianteC VALUES(UUID(), aleatorio, aleatorio, aleatorio, aleatorio, aleatorio, '2014-11-11');

END WHILE;

WHILE x  <= 10000 DO

 SET  x = x + 1; 
 SET aleatorio = TRUNCATE(RAND()*10000,0);
 INSERT INTO estudianteC VALUES(UUID(), aleatorio, aleatorio, aleatorio, aleatorio, aleatorio, '2014-11-11');

END WHILE;


END//
DELIMITER ;

CALL InsertarTablasDeConsultas();

