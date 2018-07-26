package edu.uis.Consulta;



import io.vertx.core.AbstractVerticle;
import io.vertx.core.Future;
import io.vertx.core.WorkerExecutor;
import io.vertx.core.http.HttpServer;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.handler.BodyHandler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.util.Random;
import java.util.ArrayList;
import java.util.List;


public class HttpServerVerticle extends AbstractVerticle {

	private WorkerExecutor executor;
	@Override
	public void start(Future<Void> startFuture){

		HttpServer server = vertx.createHttpServer();
	    executor=vertx.createSharedWorkerExecutor("my-worker-pool");
		Router router = Router.router(vertx);
		router.get("/").handler(this::indexHandler);
		router.get("/ConsultaEstudiante").handler(this::consultaEstudianteHandler);
		router.get("/ConsultaProfesor").handler(this::consultaProfesorHandler);
		router.get("/ConsultaMateria").handler(this::consultaMateriaHandler);
		router.get("/ConsultaEstudianteSemestre").handler(this::consultaEstudianteSemestreHandler);
		router.post().handler(BodyHandler.create());
		router.get("/ConsultaProfesorEscuela").handler(this::consultaProfesorEscuelaHandler);
		router.get("/InsertarEliminar").handler(this::insertarHandler);
		router.get("/ContarPrimos").handler(this::contarPrimosHandler);
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

		rc.response().write("<b>Seleccione la consulta que desea hacer:</b><br><br>");
		rc.response().write("<form action='/ConsultaEstudiante' method='GET'>");
		rc.response().write("<input type='submit' value='Estudiantes' />");
		rc.response().write("</form>");
		rc.response().write("<br>");

		rc.response().write("<form action='/ConsultaProfesor' method='GET'>");
		rc.response().write("<input type='submit' value='Profesores' />");
		rc.response().write("</form>");
		rc.response().write("<br>");

		rc.response().write("<form action='/ConsultaMateria' method='GET'>");
		rc.response().write("<input type='submit' value='Materias' />");
		rc.response().write("</form>");
		rc.response().write("<br>");

		rc.response().write("<b>Consultar cantidad de estudiantes por semestre:</b>");
		rc.response().write("<br><br>");
		rc.response().write("Ingrese el semestre: <br>");
		rc.response().write("<form action='/ConsultaEstudianteSemestre' method='GET'>");
		rc.response().write("<input type='text' name='semestre' />");
		rc.response().write("<br><br>");
		rc.response().write("<input type='submit' value='Consultar' />");
		rc.response().write("</form>");
		rc.response().write("<br><br>");

		rc.response().write("<b>Consultar cantidad de profesores por escuela:</b>");
		rc.response().write("<br><br>");
		rc.response().write("Ingrese el nombre de la escuela: <br>");
		rc.response().write("<form action='/ConsultaProfesorEscuela' method='GET'>");
		rc.response().write("<input type='text' name='escuela' />");
		rc.response().write("<br><br>");
		rc.response().write("<input type='submit' value='Consultar' />");
		rc.response().write("</form>");


		rc.response().write("<h1>Insertar y eliminar registros:</h1>");
		rc.response().write("Ingrese el id:<br>");
		rc.response().write("<form action='/InsertarEliminar' method='GET'>");
		rc.response().write("<input type='text' name='id' />");
		rc.response().write("<br><br>");
		rc.response().write("<input type='submit' value='Insertar y eliminar' />");
		rc.response().write("</form>");
		rc.response().write("<br>");

		rc.response().write("<h1>Contar Primos:</h1>");
		rc.response().write("<form action='/ContarPrimos' method='GET'>");
		rc.response().write("<input type='submit' value='Contar Primos' />");
		rc.response().write("</form>");
		rc.response().write("<br>");

		rc.response().write("</body>");
		rc.response().write("</html>");
		rc.response().end();
	}
	private void insertarHandler(RoutingContext rc) {

		Random aleatorio = new Random(System.currentTimeMillis());
		int intAleatorio = aleatorio.nextInt(100);
		rc.response().setChunked(true);
		rc.response().putHeader("content-type", "text/html;charset=UTF-8");
		rc.response().write("<!DOCTYPE html>");
		rc.response().write("<html>");
		rc.response().write("<head>");
		rc.response().write("<title>Vertx</title>");
		rc.response().write("</head>");
		rc.response().write("<body>");
		rc.response().write("<h1>Se inserta y elimina un conjunto de datos.</h1>");

		eventBus("INSERT INTO estudiante VALUES ("+rc.request().getParam("id")+",'"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"',"+intAleatorio+",'2014-04-04')").
				compose(v -> eventBus("INSERT INTO profesor VALUES ("+rc.request().getParam("id")+",'"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"','2014-04-04')"))
				.compose(v -> eventBus("INSERT INTO materia VALUES ("+rc.request().getParam("id")+",'"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"')")).
		compose(ar -> eventBus("DELETE FROM estudiante WHERE id_est ="+rc.request().getParam("id")))
						.compose(v -> eventBus("DELETE FROM profesor WHERE id_prof ="+rc.request().getParam("id")))
						.compose(v -> eventBus("DELETE FROM materia WHERE id_materia ="+rc.request().getParam("id"))).
				setHandler(arg ->{
					if(arg.succeeded()) {
						rc.response().write("</br>");
						rc.response().write("<b>El proceso terminó correctamente.</b>");
						rc.response().write("</br>");
						rc.response().end();
					}else {arg.cause();}
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
		rc.response().write("<h1>La tabla Estudiante:</h1>");

		vertx.eventBus().send("consulta", "SELECT * FROM estudiante", reply -> {
			if (reply.succeeded()) {

				JsonObject rs = (JsonObject)reply.result().body();
				rc.response().write("<table border='1'>");
				rc.response().write("<tr>");
				rc.response().write("<th>Código</th>");
				rc.response().write("<th>Primer nombre</th>");
				rc.response().write("<th>Segundo nombre</th>");
				rc.response().write("<th>Primer apellido</th>");
				rc.response().write("<th>Segundo apellido</th>");
				rc.response().write("<th>Semestre</th>");
				rc.response().write("<th>Fecha de ingreso</th>");

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
				rc.response().write("<table border='1'>");
				rc.response().write("<tr>");
				rc.response().write("<th>Código</th>");
				rc.response().write("<th>Primer nombre</th>");
				rc.response().write("<th>Segundo nombre</th>");
				rc.response().write("<th>Primer apellido</th>");
				rc.response().write("<th>Segundo apellido</th>");
				rc.response().write("<th>Escuela</th>");
				rc.response().write("<th>Fecha de incorporación</th>");

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
				rc.response().write("<table border='1'>");
				rc.response().write("<tr>");
				rc.response().write("<th>Código</th>");
				rc.response().write("<th>Materia</th>");
				rc.response().write("<th>Salón</th>");
				rc.response().write("<th>Horario</th>");

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
		rc.response().write("<h1>La cantidad de estudiantes que pertenecen al semestre "+rc.request().getParam("semestre")+" son:</h1>");

		vertx.eventBus().send("consulta", "select count(*)  from estudiante where semestre_est="+rc.request().getParam("semestre"), reply -> {
			if (reply.succeeded()) {

				JsonObject rs = (JsonObject)reply.result().body();

				rc.response().write("<font color='blue'>");
				rc.response().write("<h1>"+rs.getJsonArray("results").getJsonArray(0).getLong(0)+"</h1>");
				rc.response().write("</font>");
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
		rc.response().write("<h1>La cantidad de profesores que pertenecen a la escuela de "+rc.request().getParam("escuela")+" son:</h1>");

		vertx.eventBus().send("consulta","SELECT COUNT(*)  FROM profesor WHERE escuela_prof ="+"'"+rc.request().getParam("escuela")+"'", reply -> {
			if (reply.succeeded()) {

				JsonObject rs = (JsonObject)reply.result().body();

				rc.response().write("<font color='blue'>");
				rc.response().write("<h1>"+rs.getJsonArray("results").getJsonArray(0).getLong(0)+"</h1>");
				rc.response().write("</font>");
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
		vertx.eventBus().send("update", query, reply -> {
			if (reply.succeeded()) {
				future.complete();
			} else {
				reply.cause().printStackTrace();
				future.fail(reply.cause());
			}
		});
		return future;
	}
	private void contarPrimosHandler(RoutingContext rc) {
		rc.response().setChunked(true);
		rc.response().putHeader("content-type", "text/html;charset=UTF-8");
		rc.response().write("<!DOCTYPE html>");
		rc.response().write("<html>");
		rc.response().write("<head>");
		rc.response().write("<title>Vertx</title>");
		rc.response().write("</head>");
		rc.response().write("<body>");
		rc.response().write("<h1>Imprime la cantidad de primos entre 0 y 100000.</h1>");
        executor.executeBlocking(future -> {
		ArrayList<Integer> array = new ArrayList<>();
        int suma = 1;
        for (int i = 0; i < 100000; i++) {
            suma = suma + 1;
            int contador = 2;
            boolean primo=true;
            while ((primo) && (contador!=suma)){
              if (suma % contador == 0)
                primo = false;
              contador++;
            }

			if(primo) array.add(suma);
        }
		future.complete(array);
		}, false, res -> {

			if(res.succeeded()){

			ArrayList<Integer> array = (ArrayList<Integer>)res.result();
			rc.response().write("<font color='blue'>");
			rc.response().write("<h1>"+array.size()+"</h1>");
			rc.response().write("</font>");
			rc.response().write("</body>");
			rc.response().write("</html>");
			rc.response().end();}
			else{res.cause();}
		});

	}

}
