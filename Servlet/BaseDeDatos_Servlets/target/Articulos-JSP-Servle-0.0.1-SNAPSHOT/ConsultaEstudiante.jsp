<%@ page language="java" contentType="text/html; charset=ISO-8859-1"
    pageEncoding="ISO-8859-1"%>
    
  <%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">
<title>Consulta Estudiantes</title>
</head>
<body>
	<h1>Lista Estudiantes</h1>
	
	<table>
		<tr>
		 <td> CÓDIGO</td>
		 <td> PRIMER NOMBRE</td>
		 <td> SEGUNDO NOMBRE</td>
		 <td> PRIMER APELLIDO</td>
		 <td> SEGUNDO APELLIDO</td>
		 <td> SEMESTRE</td>
		 <td> FECHA INGRESO</td>
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