package edu.uis.Consulta;



import io.vertx.core.AbstractVerticle;
import io.vertx.core.CompositeFuture;
import io.vertx.core.Future;
import io.vertx.core.http.HttpServer;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.handler.BodyHandler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.util.List;
/**
 *
 * @author Edwin_Vesga
 */
public class HttpServerVerticle extends AbstractVerticle {

	@Override
	public void start(Future<Void> startFuture){

		HttpServer server = vertx.createHttpServer();
		Router router = Router.router(vertx);
		router.get("/").handler(this::indexHandler);
		router.get("/ConsultaEstudiante").handler(this::consultaEstudianteHandler);
		router.get("/ConsultaProfesor").handler(this::consultaProfesorHandler);
		router.get("/ConsultaMateria").handler(this::consultaMateriaHandler);
		router.get("/ConsultaEstudianteSemestre").handler(this::consultaEstudianteSemestreHandler);
		router.post().handler(BodyHandler.create());
		router.post("/ConsultaProfesorEscuela").handler(this::consultaProfesorEscuelaHandler);
		router.post("/EliminarEstudianteNombre").handler(this::eliminarEstudianteNombreHandler);
		router.get("/Insertar").handler(this::insertarHandler);
		server.requestHandler(router::accept).listen(4000, ar -> {
			if (ar.succeeded()) {
				startFuture.complete();
			} else {
				startFuture.fail(ar.cause());
			}
		});
	}

	private void indexHandler(RoutingContext rc){
		rc.response().setChunked(true);
		rc.response().putHeader("content-type", "text/html;charset=UTF-8");
		rc.response().write("<!DOCTYPE html>");
		rc.response().write("<html>");
		rc.response().write("<head>");
		rc.response().write("<title>Vertx</title>");            
		rc.response().write("</head>");
		rc.response().write("<body>");
		rc.response().write("<h1>Bienvenido</h1>");

		rc.response().write("<b>Seleccione la consulta que desea hacer</b>");
		rc.response().write("</br>");
		rc.response().write("<form action='/ConsultaEstudiante' method='GET'>");
		rc.response().write("<input type='submit' value='Estudiantes' />");
		rc.response().write("</form>");
		rc.response().write("</br>");

		rc.response().write("<form action='/ConsultaProfesor' method='GET'>");
		rc.response().write("<input type='submit' value='Profesores' />");
		rc.response().write("</form>");
		rc.response().write("</br>");

		rc.response().write("<form action='/ConsultaMateria' method='GET'>");
		rc.response().write("<input type='submit' value='Materias' />");
		rc.response().write("</form>");
		rc.response().write("</br>");

		rc.response().write("<b>Consultar cantidad de estudiantes por semestre:</b>");
		rc.response().write("</br>");
		rc.response().write("Ingrese el semestre: </br>");
		rc.response().write("<form action='/ConsultaEstudianteSemestre' method='GET'>");
		rc.response().write("<input type='text' name='semestre' />");
		rc.response().write("</br>");
		rc.response().write("<input type='submit' value='Consultar' />");
		rc.response().write("</form>");
		rc.response().write("</br>");

		rc.response().write("<b>Consultar cantidad de profesores por escuela:</b>");
		rc.response().write("</br>");
		rc.response().write("Ingrese el nombre de la escuela: </br>");
		rc.response().write("<form action='/ConsultaProfesorEscuela' method='POST'>");
		rc.response().write("<input type='text' name='escuela' />");
		rc.response().write("</br>");
		rc.response().write("<input type='submit' value='Consultar' />");
		rc.response().write("</form>");
		rc.response().write("</br>");

		//temporal
		rc.response().write("<b>Eliminar estudiante por nombre:</b>");
		rc.response().write("</br>");
		rc.response().write("Ingrese el nombre de la escuela: </br>");
		rc.response().write("<form action='/EliminarEstudianteNombre' method='POST'>");
		rc.response().write("<input type='text' name='nombre' />");
		rc.response().write("</br>");
		rc.response().write("<input type='submit' value='Eliminar' />");
		rc.response().write("</form>");
		rc.response().write("</br>");

		rc.response().write("<h1>Insertar Estudiante:</h1>");
		rc.response().write("<form action='/Insertar' method='GET'>");
		rc.response().write("<input type='submit' value='Insertar Estudiante:' />");
		rc.response().write("</form>");
		rc.response().write("</br>");

		rc.response().write("</body>");
		rc.response().write("</html>");
		rc.response().end();
	}
	private void insertarHandler(RoutingContext rc) {


		rc.response().setChunked(true);
		rc.response().putHeader("content-type", "text/html;charset=UTF-8");
		rc.response().write("<!DOCTYPE html>");
		rc.response().write("<html>");
		rc.response().write("<head>");
		rc.response().write("<title>Vertx</title>");            
		rc.response().write("</head>");
		rc.response().write("<body>");
		rc.response().write("<h1>Se inserta y elimina un conjunto de datos.</h1>");

		Future<Void> insert1 = Future.future();
		insert1 = eventBus("INSERT INTO estudiante VALUES (2142613,'Edwin','Alfonso','Vesga','Arias',10,'2014-04-04')").
				compose(v -> eventBus("INSERT INTO profesor VALUES (2000112,'Carlos','Alfredo','Perez','Robledo','Ingenieria quimica','2014-04-04')"))
				.compose(v -> eventBus("INSERT INTO materia VALUES (123459,'Discretas','LabPesados','M-V 10:00 a.m')"));
		insert1.setHandler(ar ->{
			if(ar.succeeded()) {
				rc.response().write("<b>Se inserto un Estudiante.</b>");
				rc.response().write("</br>");
				rc.response().write("<b>Se inserto un Profesor.</b>");
				rc.response().write("</br>");
				rc.response().write("<b>Se inserto una Materia.</b>");
				rc.response().write("</br>");
				Future<Void> delete1 = Future.future();
				delete1 = eventBus("DELETE FROM estudiante WHERE id_est=2142613")
						.compose(v -> eventBus("DELETE FROM profesor WHERE id_prof=2000112"))
						.compose(v -> eventBus("DELETE FROM materia WHERE id_materia=123459"));
				delete1.setHandler(arg ->{
					if(arg.succeeded()) {
						rc.response().write("<b>Se elimino un Estudiante.</b>");
						rc.response().write("</br>");
						rc.response().write("<b>Se elimino un Profesor.</b>");
						rc.response().write("</br>");
						rc.response().write("<b>Se elimino una Materia.</b>");	
						rc.response().write("</br>");
						rc.response().end();
					}else {arg.cause();}
				});
			}
			else {ar.cause();}
		});
	}
	private void eliminarEstudianteNombreHandler(RoutingContext rc) {
		vertx.eventBus().send("consulta","DELETE FROM estudiante WHERE primer_nombre_est ="+"'"+rc.request().getParam("nombre")+"'", reply -> {
			if (reply.succeeded()) {
				rc.response().end("Se elimino correctamente.");
			} else {
				// No reply or failure
				reply.cause().printStackTrace();
			}
		});
	}
	private void consultaEstudianteHandler(RoutingContext rc){
		// Sender
		rc.response().setChunked(true);
		rc.response().putHeader("content-type", "text/html;charset=UTF-8");
		rc.response().write("<!DOCTYPE html>");
		rc.response().write("<html>");
		rc.response().write("<head>");
		rc.response().write("<title>Vertx</title>");            
		rc.response().write("</head>");
		rc.response().write("<body>");
		rc.response().write("<h1>La tabla Estudiantes:</h1>");

		vertx.eventBus().send("consulta", "SELECT * FROM estudiante", reply -> {
			if (reply.succeeded()) {

				JsonObject rs = (JsonObject)reply.result().body();
				rc.response().write("<table>");
				rc.response().write("<tr>");
				for(String j : (List<String>)rs.getJsonArray("columnNames").getList()) {
					rc.response().write("<td><b>"+j+"</b></td>");
				}
				rc.response().write("</tr>");
				for(JsonArray j : (List<JsonArray>)rs.getJsonArray("results").getList()) {
					rc.response().write("<tr>");

					for(Object p : (List<Object>)j.getList()){
						rc.response().write("<td>"+String.valueOf(p)+"</td>");
					}

					rc.response().write("</tr>");
				}
				rc.response().write("</table>");

				rc.response().write("</body>");
				rc.response().write("</html>");
				rc.response().end();
			} else {
				// No reply or failure
				reply.cause().printStackTrace();
			}
		});
	}
	private void consultaProfesorHandler(RoutingContext rc){
		// Sender
		rc.response().setChunked(true);
		rc.response().putHeader("content-type", "text/html;charset=UTF-8");
		rc.response().write("<!DOCTYPE html>");
		rc.response().write("<html>");
		rc.response().write("<head>");
		rc.response().write("<title>Vertx</title>");            
		rc.response().write("</head>");
		rc.response().write("<body>");
		rc.response().write("<h1>La tabla Profesor:</h1>");

		vertx.eventBus().send("consulta", "SELECT * FROM profesor", reply -> {
			if (reply.succeeded()) {

				JsonObject rs = (JsonObject)reply.result().body();
				rc.response().write("<table>");
				rc.response().write("<tr>");
				for(String j : (List<String>)rs.getJsonArray("columnNames").getList()) {
					rc.response().write("<td><b>"+j+"</b></td>");
				}
				rc.response().write("</tr>");
				for(JsonArray j : (List<JsonArray>)rs.getJsonArray("results").getList()) {
					rc.response().write("<tr>");

					for(Object p : (List<Object>)j.getList()){
						rc.response().write("<td>"+String.valueOf(p)+"</td>");
					}

					rc.response().write("</tr>");
				}
				rc.response().write("</table>");

				rc.response().write("</body>");
				rc.response().write("</html>");
				rc.response().end();
			} else {
				// No reply or failure
				reply.cause().printStackTrace();
			}
		});

	}
	private void consultaMateriaHandler(RoutingContext rc){
		// Sender
		rc.response().setChunked(true);
		rc.response().putHeader("content-type", "text/html;charset=UTF-8");
		rc.response().write("<!DOCTYPE html>");
		rc.response().write("<html>");
		rc.response().write("<head>");
		rc.response().write("<title>Vertx</title>");            
		rc.response().write("</head>");
		rc.response().write("<body>");
		rc.response().write("<h1>La tabla Materia:</h1>");

		vertx.eventBus().send("consulta", "SELECT * FROM materia", reply -> {
			if (reply.succeeded()) {

				JsonObject rs = (JsonObject)reply.result().body();
				rc.response().write("<table>");
				rc.response().write("<tr>");
				for(String j : (List<String>)rs.getJsonArray("columnNames").getList()) {
					rc.response().write("<td><b>"+j+"</b></td>");
				}
				rc.response().write("</tr>");
				for(JsonArray j : (List<JsonArray>)rs.getJsonArray("results").getList()) {
					rc.response().write("<tr>");

					for(Object p : (List<Object>)j.getList()){
						rc.response().write("<td>"+String.valueOf(p)+"</td>");
					}

					rc.response().write("</tr>");
				}
				rc.response().write("</table>");

				rc.response().write("</body>");
				rc.response().write("</html>");
				rc.response().end();
			} else {
				// No reply or failure
				reply.cause().printStackTrace();
			}
		});

	}
	private void consultaEstudianteSemestreHandler(RoutingContext rc){
		// Sender
		rc.response().setChunked(true);
		rc.response().putHeader("content-type", "text/html;charset=UTF-8");
		rc.response().write("<!DOCTYPE html>");
		rc.response().write("<html>");
		rc.response().write("<head>");
		rc.response().write("<title>Vertx</title>");            
		rc.response().write("</head>");
		rc.response().write("<body>");
		rc.response().write("<h1>El numero de estudiantes que pertenecen a al semestre "+rc.request().getParam("semestre")+" son:</h1>");

		vertx.eventBus().send("consulta", "select count(*)  from estudiante where semestre_est="+rc.request().getParam("semestre"), reply -> {
			if (reply.succeeded()) {

				JsonObject rs = (JsonObject)reply.result().body();

				rc.response().write("<h1>"+rs.getJsonArray("results").getJsonArray(0).getLong(0)+"</h1>");
				rc.response().write("</body>");
				rc.response().write("</html>");
				rc.response().end();
			} else {
				// No reply or failure
				reply.cause().printStackTrace();
			}
		});

	}
	private void consultaProfesorEscuelaHandler(RoutingContext rc){

		// Sender
		rc.response().setChunked(true);
		rc.response().putHeader("content-type", "text/html;charset=UTF-8");
		rc.response().write("<!DOCTYPE html>");
		rc.response().write("<html>");
		rc.response().write("<head>");
		rc.response().write("<title>Vertx</title>");            
		rc.response().write("</head>");
		rc.response().write("<body>");
		rc.response().write("<h1>El numero de profesores que pertenecen a la escuela "+rc.request().getParam("escuela")+" son:</h1>");

		vertx.eventBus().send("consulta","SELECT COUNT(*)  FROM profesor WHERE escuela_prof ="+"'"+rc.request().getParam("escuela")+"'", reply -> {
			if (reply.succeeded()) {

				JsonObject rs = (JsonObject)reply.result().body();

				rc.response().write("<h1>"+rs.getJsonArray("results").getJsonArray(0).getLong(0)+"</h1>");
				rc.response().write("</body>");
				rc.response().write("</html>");
				rc.response().end();
			} else {
				// No reply or failure
				reply.cause().printStackTrace();
			}
		});

	}

	private Future<Void> eventBus(String query){
		Future<Void> future = Future.future();
		vertx.eventBus().send("consulta", query, reply -> {
			if (reply.succeeded()) {
				future.complete();
			} else {
				reply.cause().printStackTrace();
				future.fail(reply.cause());
			}
		});
		return future;
	}

}