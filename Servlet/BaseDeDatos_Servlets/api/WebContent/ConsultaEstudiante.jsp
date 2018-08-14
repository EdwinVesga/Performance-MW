<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<!DOCTYPE html>
<html>
<head>
<title>Servlet</title>
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
		<c:forEach var="estudiante" items="${lista}">
			<tr>
				<td><c:out value="${estudiante.id}"/></td>
				<td><c:out value="${estudiante.primerNombre}"/></td>
				<td><c:out value="${estudiante.segundoNombre}"/></td>
				<td><c:out value="${estudiante.primerApellido}"/></td>
				<td><c:out value="${estudiante.segundoApellido}"/></td>
				<td><c:out value="${estudiante.semestre}"/></td>
				<td><c:out value="${estudiante.fechaIngreso}"/></td>

			</tr>
		</c:forEach>
	</table>

</body>
</html>
