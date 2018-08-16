<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">
<title>Servlet</title>
</head>
<body>
<h1>Bienvenido</h1>

<b>Seleccione la consulta que desea hacer:</b><br><br>

<form action='ConsultaEstudiante' method='GET'>
<input type='submit' value='Estudiantes' /><br>
</form>
</br>

<form action='ConsultaProfesor' method='GET'>
<input type='submit' value='Profesores' /><br>
</form>
</br>

<form action='ConsultaMateria' method='GET'>
<input type='submit' value='Materias' /><br>
</form>
</br>

<b>Consultar cantidad de estudiantes por semestre:</b><br><br>
Ingrese el semestre: </br>
<form action='ConsultaEstudianteSemestre' method='GET'>
<input type='text' name='semestre' /><br><br>
<input type='submit' value='Consultar' /><br><br>
</form>
</br>

<b>Consultar cantidad de profesores por escuela:</b><br><br>
Ingrese el nombre de la escuela: </br>
<form action='ConsultaProfesorEscuela' method='GET'>
<input type='text' name='escuela' /><br><br>
<input type='submit' value='Consultar' />
</form>

<h1>Insertar y eliminar registros:</h1>
Ingrese el id:<br>
<form action='InsertarEliminar' method='GET'>
<input type= 'text' name='id' />
<br><br>
<input type='submit' value='Insertar y eliminar' />
</form>
<br>

<h1>Contar Primos:</h1>
<form action='ContarPrimos' method='GET'>
<input type='submit' value='Contar Primos' />
</form>
</br>

</body>
</html>
