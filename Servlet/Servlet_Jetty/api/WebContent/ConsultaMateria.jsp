<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<!DOCTYPE html>
<html>
<head>
<title>Servlet</title>
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
		<c:forEach var="materia" items="${lista}">
			<tr>
				<td><c:out value="${materia.id_materia}"/></td>
				<td><c:out value="${materia.nombre_materia}"/></td>
				<td><c:out value="${materia.salon_materia}"/></td>
				<td><c:out value="${materia.horario_materia}"/></td>
			</tr>
		</c:forEach>
	</table>

</body>
</html>
