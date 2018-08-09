CREATE DATABASE IF NOT EXISTS universidad;
USE universidad;

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

INSERT INTO estudiante (id_est, primer_nombre_est, segundo_nombre_est, primer_apellido_est, segundo_apellido_est, semestre_est, fecha_ingreso_est) VALUES (2141392, 'Viviana', 'Andrea', 'Maldonado', 'Beltrán', 10, '2014-04-04');

CREATE TABLE IF NOT EXISTS materia (
  id_materia int(11) NOT NULL,
  nombre_materia varchar(50) NOT NULL,
  salon_materia varchar(50) NOT NULL,
  horario_materia varchar(50) NOT NULL,
  PRIMARY KEY (id_materia),
  UNIQUE KEY id_materia (id_materia)
);

INSERT INTO materia (id_materia, nombre_materia, salon_materia, horario_materia) VALUES (123456, 'Fundamentos de programación', 'CENTIC 202', 'L-M 8:00 a.m');

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

INSERT INTO profesor (id_prof, primer_nombre_prof, segundo_nombre_prof, primer_apellido_prof, segundo_apellido_prof, escuela_prof, fecha_incorporacion_prof) VALUES (2000111, 'Gabriel', 'Rodrigo', 'Pedraza', 'Ferreira', 'Ingeniería de sistemas', '2000-02-02');
