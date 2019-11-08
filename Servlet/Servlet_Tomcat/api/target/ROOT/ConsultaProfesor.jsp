<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<!DOCTYPE html>
<html>
<head>
<title>Servlet</title>
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
		<c:forEach var="profesor" items="${lista}">
			<tr>
				<td><c:out value="${profesor.id_prof}"/></td>
				<td><c:out value="${profesor.primer_nombre_prof}"/></td>
				<td><c:out value="${profesor.segundo_nombre_prof}"/></td>
				<td><c:out value="${profesor.primer_apellido_prof}"/></td>
				<td><c:out value="${profesor.segundo_apellido_prof}"/></td>
				<td><c:out value="${profesor.escuela_prof}"/></td>
				<td><c:out value="${profesor.fecha_incorporacion_prof}"/></td>
			</tr>
		</c:forEach>
	</table>

</body>
</html>
