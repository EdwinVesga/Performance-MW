<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<!DOCTYPE html>
<html>
<head>
<title>Consulta Profesores por Escuela</title>
</head>
<body>
	<h1>La cantidad de profesores que pertenecen a la escuela de <c:out value="${escuela}"/> son:</h1>
  <h1>
    <font color="blue">
        <c:out value="${count}"/>
    </font>
  </h1>
</body>
</html>
