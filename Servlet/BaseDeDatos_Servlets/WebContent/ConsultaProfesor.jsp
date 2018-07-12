<%@ page language="java" contentType="text/html; charset=ISO-8859-1"
    pageEncoding="ISO-8859-1"%>
    
  <%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">
<title>Consulta Profesores</title>
</head>
<body>
	<h1>Lista Profesores</h1>

	<table>
		<tr>
		 <td> ID</td>
		 <td> PRIMER_NOMBRE</td>
		 <td> SEGUNDO NOMBRE</td>
		 <td> PRIMER APELLIDO</td>
		 <td> SEGUNDO APELLIDO</td>
		 <td> ESCUELA</td>
	   	 <td> FECHA INCORPORACION</td>
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