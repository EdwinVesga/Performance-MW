<!DOCTYPE html>
<html>
<head>
<title>${title}</title>
</head>
<body>
<h1>La tabla Materia:</h1>
<table border="1">
	<tr>
    <th>C&oacutedigo</th>
    <th>Materia</th>
    <th>Sal&oacuten</th>
    <th>Horario</th>
	</tr>
	<#list lista as materia>
		<tr>
		<td>${materia.id_materia}</td>
		<td>${materia.nombre_materia}</td>
		<td>${materia.salon_materia}</td>
		<td>${materia.horario_materia}</td>
		</tr>
	</#list>
</table>
</body>
</html>