<!DOCTYPE html>
<html>
<head>
<title>${title}</title>
</head>
<body>
<h1>La tabla Estudiante:</h1>
<table border="1">
<tr>
    <th>C&oacutedigo</th>
    <th>Primer nombre</th>
    <th>Segundo nombre</th>
    <th>Primer apellido</th>
    <th>Segundo apellido</th>
    <th>Semestre</th>
    <th>Fecha de ingreso</th>
	</tr>
		<#list lista as estudiante>
			<tr>
			<td>${estudiante.id}</td>
			<td>${estudiante.primerNombre}</td>
			<td>${estudiante.segundoNombre}</td>
			<td>${estudiante.primerApellido}</td>
			<td>${estudiante.segundoApellido}</td>
			<td>${estudiante.semestre}</td>
			<td>${estudiante.fechaIngreso}</td>
			</tr>
		</#list>
	</table>
</body>
</html>