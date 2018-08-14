<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<!DOCTYPE>
<html>
<head>
<title>Servlet</title>
</head>
<body>
	<h1>La cantidad de estudiantes que pertenecen al semestre <c:out value="${semestre}"/> son:</h1>
  <h1>
    <font color="blue">
        <c:out value="${count}"/>
    </font>
  </h1>

</body>
</html>
