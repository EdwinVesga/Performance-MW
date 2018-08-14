CREATE DATABASE IF NOT EXISTS universidad; use universidad;
CREATE TABLE IF NOT EXISTS estudiante (
  id_est int(11) NOT NULL,
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
  id_materia int(11) NOT NULL,
  nombre_materia varchar(50) NOT NULL,
  salon_materia varchar(50) NOT NULL,
  horario_materia varchar(50) NOT NULL,
  PRIMARY KEY (id_materia),
  UNIQUE KEY id_materia (id_materia)
);
CREATE TABLE IF NOT EXISTS profesor (
  id_prof int(11) NOT NULL,
  primer_nombre_prof varchar(50) NOT NULL,
  segundo_nombre_prof varchar(50) DEFAULT NULL,
  primer_apellido_prof varchar(50) NOT NULL,
  segundo_apellido_prof varchar(50) NOT NULL,
  escuela_prof varchar(50) NOT NULL,
  fecha_incorporacion_prof date NOT NULL,
  PRIMARY KEY (id_prof),
  UNIQUE KEY id_prof (id_prof)
);
