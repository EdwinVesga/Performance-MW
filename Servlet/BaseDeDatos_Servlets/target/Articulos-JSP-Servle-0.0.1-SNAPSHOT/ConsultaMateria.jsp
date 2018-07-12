<%@ page language="java" contentType="text/html; charset=ISO-8859-1"
    pageEncoding="ISO-8859-1"%>
    
  <%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">
<title>Consulta Materias</title>
</head>
<body>
	<h1>Lista Materias</h1>
	<table>
		<tr>
		 <td> ID</td>
		 <td> NOMBRE</td>
		 <td> SALON</td>
		 <td> HORARIO</td>
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