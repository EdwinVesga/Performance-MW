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
<br>

<form action='/ConsultaProfesor' method='GET'>
<input type='submit' value='Profesores' /><br>
</form>
<br>

<form action='/ConsultaMateria' method='GET'>
<input type='submit' value='Materias' /><br>
</form>
<br>

<b>Consultar cantidad de estudiantes por semestre A:</b><br><br>
<form action='/ConsultaEstudianteSemestreA' method='GET'>
<input type='submit' value='Consultar' /><br>
</form>
<br><br>

<b>Consultar cantidad de estudiantes por semestre B:</b><br><br>
<form action='/ConsultaEstudianteSemestreB' method='GET'>
<input type='submit' value='Consultar' /><br>
</form>
<br><br>

<b>Consultar cantidad de estudiantes por semestre C:</b><br><br>
<form action='/ConsultaEstudianteSemestreC' method='GET'>
<input type='submit' value='Consultar' /><br>
</form>
<br><br>

<b>Consultar cantidad de profesores por escuela:</b><br><br>
Ingrese el nombre de la escuela: </br>
<form action='/ConsultaProfesorEscuela' method='GET'>
<input type='text' name='escuela' /><br><br>
<input type='submit' value='Consultar' />
</form>

<h1>Insertar registros:</h1>
Ingrese el id:<br>
<form action='/Insertar1' method='GET'>
<input type= 'text' name='id' />
<br><br>
<input type='submit' value='Insertar' />
</form>
<br>

<h1>Insertar 3 registros:</h1>
Ingrese el id:<br>
<form action='/Insertar3' method='GET'>
<input type= 'text' name='id1' />
<br>
<input type= 'text' name='id2' />
<br>
<input type= 'text' name='id3' />
<br><br>
<input type='submit' value='Insertar' />
</form>
<br>

<h1>Insertar 6 registros:</h1>
Ingrese el id:<br>
<form action='/Insertar6' method='GET'>
<input type= 'text' name='id1' />
<br>
<input type= 'text' name='id2' />
<br>
<input type= 'text' name='id3' />
<br>
<input type= 'text' name='id4' />
<br>
<input type= 'text' name='id5' />
<br>
<input type= 'text' name='id6' />
<br><br>
<input type='submit' value='Insertar' />
</form>
<br>

<h1>Contar Primos menores a 1000:</h1>
<form action='/ContarPrimos1000' method='GET'>
<input type='submit' value='Contar Primos' />
</form>
<br>

<h1>Contar Primos menores a 2000:</h1>
<form action='/ContarPrimos2000' method='GET'>
<input type='submit' value='Contar Primos' />
</form>
<br>

<h1>Contar Primos menores a 3000:</h1>
<form action='/ContarPrimos3000' method='GET'>
<input type='submit' value='Contar Primos' />
</form>
<br>

</body>
</html>