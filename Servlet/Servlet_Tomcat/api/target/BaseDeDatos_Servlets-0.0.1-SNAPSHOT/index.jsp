<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">
<title>Servlet</title>
</head>
<body>
<h1>Bienvenido</h1>

<b>Seleccione la consulta que desea hacer:</b><br><br>

<form action='/ConsultaEstudiante' method='GET'>
<input type='submit' value='Estudiantes' /><br>
</form>
</br>

<form action='/ConsultaProfesor' method='GET'>
<input type='submit' value='Profesores' /><br>
</form>
</br>

<form action='/ConsultaMateria' method='GET'>
<input type='submit' value='Materias' /><br>
</form>
</br>

<b>Insertar 1000 Estudiantes:</b>
Ingrese el id:<br>
<form action='/Insertar1000' method='GET'>
<input type= 'text' name='id' />
<br><br>
<input type='submit' value='Insertar' />
</form>
<br>

<b>Insertar 10000 Estudiantes:</b>
Ingrese el id:<br>
<form action='/Insertar10000' method='GET'>
<input type= 'text' name='id' />
<br><br>
<input type='submit' value='Insertar' />
</form>
<br>

<b>Insertar 100000 Estudiantes:</b>
Ingrese el id:<br>
<form action='/Insertar100000' method='GET'>
<input type= 'text' name='id' />
<br><br>
<input type='submit' value='Insertar' />
</form>
<br>

<b>Consultar cantidad de estudiantes por semestre A:</b><br><br>
Ingrese el semestre: </br>
<form action='/ConsultaEstudianteSemestreA' method='GET'>
<input type='text' name='semestre' /><br><br>
<input type='submit' value='Consultar' /><br><br>
</form>
</br>

<b>Consultar cantidad de estudiantes por semestre B:</b><br><br>
Ingrese el semestre: </br>
<form action='/ConsultaEstudianteSemestreB' method='GET'>
<input type='text' name='semestre' /><br><br>
<input type='submit' value='Consultar' /><br><br>
</form>
</br>

<b>Consultar cantidad de estudiantes por semestre C:</b><br><br>
Ingrese el semestre: </br>
<form action='/ConsultaEstudianteSemestreC' method='GET'>
<input type='text' name='semestre' /><br><br>
<input type='submit' value='Consultar' /><br><br>
</form>
</br>

<b>Consultar cantidad de profesores por escuela:</b><br><br>
Ingrese el nombre de la escuela: </br>
<form action='/ConsultaProfesorEscuela' method='GET'>
<input type='text' name='escuela' /><br><br>
<input type='submit' value='Consultar' />
</form>

<h1>Insertar y eliminar registros:</h1>
Ingrese el id:<br>
<form action='/InsertarEliminar' method='GET'>
<input type= 'text' name='id' />
<br><br>
<input type='submit' value='Insertar y eliminar' />
</form>
<br>

<h1>Contar Primos:</h1>
<form action='/ContarPrimos' method='GET'>
<input type='submit' value='Contar Primos' />
</form>
</br>

</body>
</html>
