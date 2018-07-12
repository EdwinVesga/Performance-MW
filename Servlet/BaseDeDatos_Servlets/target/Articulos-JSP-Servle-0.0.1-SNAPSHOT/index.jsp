<%@ page language="java" contentType="text/html; charset=ISO-8859-1"
	pageEncoding="ISO-8859-1"%>
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<title>Servlet</title>      
</head>
<body>
<h1>Bienvenido</h1>

<b>Seleccione la consulta que desea hacer</b>
</br>
<form action='adminEstudiante' method='POST'>
<input type="hidden" name ='action' value='consultaEstudiante' />
<input type='submit' value='Estudiantes' />
</form>
</br>

<form action='adminEstudiante' method='POST'>
<input type="hidden" name ='action' value='consultaProfesor' />
<input type='submit' value='Profesores' />
</form>
</br>

<form action='adminEstudiante' method='POST'>
<input type="hidden" name ='action' value='consultaMateria' />
<input type='submit' value='Materias' />
</form>
</br>

<b>Consultar cantidad de estudiantes por semestre:</b>
</br>
Ingrese el semestre: </br>
<form action='adminEstudiante' method='POST'>
<input type="hidden" name ='action' value='consultaEstudianteSemestre' />
<input type='text' name='semestre' />
</br>
<input type='submit' value='Consultar' />
</form>
</br>

<b>Consultar cantidad de profesores por escuela:</b>
</br>
Ingrese el nombre de la escuela: </br>
<form action='adminEstudiante' method='POST'>
<input type="hidden" name='action' value='consultaProfesorEscuela'/>
<input type='text' name='escuela' />
</br>
<input type='submit' value='Consultar' />
</form>
</br>

<h1>Insertar Estudiante:</h1>
<form action='adminEstudiante' method='POST'>
<input type="hidden" name ='action' value='insertar' />
<input type= 'text' name='id' />
</br>
<input type='submit' value='Insertar' />
</form>
</br>

<h1>Contar Primos:</h1>
<form action='adminEstudiante' method='POST'>
<input type="hidden" name ='action' value='contarprimos' />
</br>
<input type='submit' value='Submit' />
</form>
</br>

</body>
</html>