<!DOCTYPE html>
<html>
<head>
<title>${title}</title>
</head>
<body>
<h1>La tabla Profesor:</h1>
<table border="1">
	<tr>
    <th>C&oacutedigo</th>
    <th>Primer nombre</th>
    <th>Segundo nombre</th>
    <th>Primer apellido</th>
    <th>Segundo apellido</th>
    <th>Escuela</th>
    <th>Fecha de incorporaci&oacuten</th>
	</tr>
	<#list lista as profesor>
		<tr>
		<td>${profesor.id_prof}</td>
		<td>${profesor.primer_nombre_prof}</td>
		<td>${profesor.segundo_nombre_prof}</td>
		<td>${profesor.primer_apellido_prof}</td>
		<td>${profesor.segundo_apellido_prof}</td>
		<td>${profesor.escuela_prof}</td>
		<td>${profesor.fecha_incorporacion_prof}</td>
		</tr>
	</#list>
</table>
</body>
</html>