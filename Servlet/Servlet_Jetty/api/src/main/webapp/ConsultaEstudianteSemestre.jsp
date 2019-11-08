<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<!DOCTYPE>
<html>
<head>
<title>Servlet</title>
</head>
<body>
<h1>Tabla de Cantidad de Estudiantes en el semestre <c:out value="${semestre}"/>:</h1>
<table border="1">
<tr>
<th>Semestre</th>
<th>Cantidad Estudiantes</th>
</tr>
<tr>
<td><c:out value="${semestre}"/></td>
<td><c:out value="${total}"/></td>
</tr>
</table>
</body>
</html>
