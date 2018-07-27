<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">
<title>Servlet</title>
</head>
<body>
<h1>Bienvenido</h1>

<b>Seleccione la consulta que desea hacer:</b><br><br>

<form action='adminEstudiante' method='GET'>
<input type="hidden" name ='action' value='consultaEstudiante' />
<input type='submit' value='Estudiantes' /><br>
</form>
</br>

<form action='adminEstudiante' method='GET'>
<input type="hidden" name ='action' value='consultaProfesor' />
<input type='submit' value='Profesores' /><br>
</form>
</br>

<form action='adminEstudiante' method='GET'>
<input type="hidden" name ='action' value='consultaMateria' />
<input type='submit' value='Materias' /><br>
</form>
</br>

<b>Consultar cantidad de estudiantes por semestre:</b><br><br>
Ingrese el semestre: </br>
<form action='adminEstudiante' method='GET'>
<input type="hidden" name ='action' value='consultaEstudianteSemestre' />
<input type='text' name='semestre' /><br><br>
<input type='submit' value='Consultar' /><br><br>
</form>
</br>

<b>Consultar cantidad de profesores por escuela:</b><br><br>
Ingrese el nombre de la escuela: </br>
<form action='adminEstudiante' method='POST'>
<input type="hidden" name='action' value='consultaProfesorEscuela'/>
<input type='text' name='escuela' /><br><br>
<input type='submit' value='Consultar' />
</form>

<h1>Insertar y eliminar registros:</h1>
Ingrese el id:<br>
<form action='adminEstudiante' method='GET'>
<input type="hidden" name ='action' value='insertaryeliminar' />
<input type= 'text' name='id' />
<br><br>
<input type='submit' value='Insertar y eliminar' />
</form>
<br>

<h1>Contar Primos:</h1>
<form action='adminEstudiante' method='GET'>
<input type="hidden" name ='action' value='contarprimos' />
<input type='submit' value='Contar Primos' />
</form>
</br>

</body>
</html>
