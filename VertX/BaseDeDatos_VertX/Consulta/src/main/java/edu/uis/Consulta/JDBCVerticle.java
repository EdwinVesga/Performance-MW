package edu.uis.Consulta;


import io.vertx.core.AbstractVerticle;
import io.vertx.core.Future;
import io.vertx.core.eventbus.Message;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.asyncsql.MySQLClient;
import io.vertx.ext.sql.SQLClient;

public class JDBCVerticle extends AbstractVerticle {

	private SQLClient mySQLClient;

	@Override
	public void start(Future<Void> startFuture){

	    mySQLClient = MySQLClient.createShared(vertx, new JsonObject().put("host","db").put("post","3306")
				.put("maxPoolSize", 100000).put("username", "performance").put("password", "123456").put("database", "universidad").put("charset","UTF-8"));
		vertx.eventBus().consumer("puente", this::onMessage);
		startFuture.complete();
	}
	public enum ErrorCodes{
		NO_ACTION_SPECIFIED, BAD_ACTION, DB_ERROR
	}
	private void onMessage(Message<JsonObject> message) {
		if(message.headers().contains("action")) {
			String action = message.headers().get("action");
			switch(action) {
			case "consultarEstudiante":
				consultarEstudiante(message);
				break;
			case "consultarProfesor":
				consultarProfesor(message);
				break;
			case "consultarMateria":
				consultarMateria(message);
				break;
			case "consultarSemestreA":
				consultarSemestreA(message);
				break;
			case "consultarSemestreB":
				consultarSemestreB(message);
				break;
			case "consultarSemestreC":
				consultarSemestreC(message);
				break;
			case "consultarEscuela":
				consultarEscuela(message);
				break;
			case "eliminarEstudiante":
				eliminarEstudiante(message);
				break;
			case "eliminarProfesor":
				eliminarProfesor(message);
				break;
			case "eliminarMateria":
				eliminarMateria(message);
				break;
			case "insertarEstudiante":
				insertarEstudiante(message);
				break;
			case "insertarProfesor":
				insertarProfesor(message);
				break;
			case "insertarMateria":
				insertarMateria(message);
				break;
			case "insertar1000":
				insertarEstudianteSemestreA(message);
				break;
			case "insertar10000":
				insertarEstudianteSemestreB(message);
				break;
			case "insertar100000":
				insertarEstudianteSemestreC(message);
				break;
			default:
				message.fail(ErrorCodes.BAD_ACTION.ordinal(),"Bad action: "+ action);
			}
		}
	}
	private void consultarSemestreA(Message<JsonObject> message) {
		JsonArray params = new JsonArray().add(message.body().getInteger("semestre"));
		String query= "SELECT COUNT(*) FROM estudianteA WHERE semestre_est= ?";
		mySQLClient.queryWithParams(query, params, fetch -> {
			if (fetch.succeeded()) {
				message.reply(fetch.result().toJson());
			} else {
				fetch.cause();
			}
		});
	}
	private void consultarSemestreB(Message<JsonObject> message) {
		JsonArray params = new JsonArray().add(message.body().getInteger("semestre"));
		String query= "SELECT COUNT(*) FROM estudianteB WHERE semestre_est= ?";
		mySQLClient.queryWithParams(query, params, fetch -> {
			if (fetch.succeeded()) {
				message.reply(fetch.result().toJson());
			} else {
				fetch.cause();
			}
		});
	}
	private void consultarSemestreC(Message<JsonObject> message) {
		JsonArray params = new JsonArray().add(message.body().getInteger("semestre"));
		String query= "SELECT COUNT(*) FROM estudianteC WHERE semestre_est= ?";
		mySQLClient.queryWithParams(query, params, fetch -> {
			if (fetch.succeeded()) {
				message.reply(fetch.result().toJson());
			} else {
				fetch.cause();
			}
		});
	}
	private void consultarEscuela(Message<JsonObject> message) {
		JsonArray params = new JsonArray().add(message.body().getString("escuela"));
		String query= "SELECT COUNT(*) FROM profesorC WHERE escuela_prof = ?";
		mySQLClient.queryWithParams(query, params, fetch -> {
			if (fetch.succeeded()) {
				message.reply(fetch.result().toJson());
			} else {
				fetch.cause();
			}
		});
	}
	private void consultarEstudiante(Message<JsonObject> message) {

		mySQLClient.query("SELECT * FROM estudianteC", fetch -> {
			if (fetch.succeeded()) {
				message.reply(fetch.result().toJson());
			} else {
				fetch.cause();
			}
		});
	}
	private void consultarProfesor(Message<JsonObject> message) {

		mySQLClient.query("SELECT * FROM profesorC", fetch -> {
			if (fetch.succeeded()) {
				message.reply(fetch.result().toJson());
			} else {
				fetch.cause();
			}
		});
	}
	private void consultarMateria(Message<JsonObject> message) {

		mySQLClient.query("SELECT * FROM materiaC", fetch -> {
			if (fetch.succeeded()) {
				message.reply(fetch.result().toJson());
			} else {
				fetch.cause();
			}
		});
	}
	private void insertarEstudianteSemestreA(Message<JsonObject> message) {
		JsonArray params = new JsonArray().add(message.body().getInteger("id"));
		Integer intAleatorio = message.body().getInteger("intAleatorio");
		String query= "INSERT INTO estudianteA VALUES (?,'"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"',"+intAleatorio+",'2014-04-04')";
		mySQLClient.updateWithParams(query, params, fetch -> {
			if (fetch.succeeded()) {
				message.reply(new JsonObject());
			} else {
				fetch.cause();
			}
		});
	}
	private void insertarEstudianteSemestreB(Message<JsonObject> message) {
		JsonArray params = new JsonArray().add(message.body().getInteger("id"));
		Integer intAleatorio = message.body().getInteger("intAleatorio");
		String query= "INSERT INTO estudianteB VALUES (?,'"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"',"+intAleatorio+",'2014-04-04')";
		mySQLClient.updateWithParams(query, params, fetch -> {
			if (fetch.succeeded()) {
				message.reply(new JsonObject());
			} else {
				fetch.cause();
			}
		});
	}
	private void insertarEstudianteSemestreC(Message<JsonObject> message) {
		JsonArray params = new JsonArray().add(message.body().getInteger("id"));
		Integer intAleatorio = message.body().getInteger("intAleatorio");
		String query= "INSERT INTO estudianteC VALUES (?,'"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"',"+intAleatorio+",'2014-04-04')";
		mySQLClient.updateWithParams(query, params, fetch -> {
			if (fetch.succeeded()) {
				message.reply(new JsonObject());
			} else {
				fetch.cause();
			}
		});
	}
	private void insertarEstudiante(Message<JsonObject> message) {
		JsonArray params = new JsonArray().add(message.body().getInteger("id"));
		Integer intAleatorio = message.body().getInteger("intAleatorio");
		String query= "INSERT INTO estudiante VALUES (?,'"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"',"+intAleatorio+",'2014-04-04')";
		mySQLClient.updateWithParams(query, params, fetch -> {
			if (fetch.succeeded()) {
				message.reply(new JsonObject());
			} else {
				fetch.cause();
			}
		});
	}
	private void eliminarEstudiante(Message<JsonObject> message) {
		JsonArray params = new JsonArray().add(message.body().getInteger("id"));
		String query = "DELETE FROM estudiante WHERE id_est = ?";
		mySQLClient.updateWithParams(query, params, fetch -> {
			if (fetch.succeeded()) {
				message.reply(new JsonObject());
			} else {
				fetch.cause();
			}
		});
	}
	private void insertarProfesor(Message<JsonObject> message) {
		JsonArray params = new JsonArray().add(message.body().getInteger("id"));
		Integer intAleatorio = message.body().getInteger("intAleatorio");
		String query = "INSERT INTO profesor VALUES (?,'"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"','2014-04-04')";
		mySQLClient.updateWithParams(query, params, fetch -> {
			if (fetch.succeeded()) {
				message.reply(new JsonObject());
			} else {
				fetch.cause();
			}
		});
	}
	private void eliminarProfesor(Message<JsonObject> message) {
		JsonArray params = new JsonArray().add(message.body().getInteger("id"));
		String query = "DELETE FROM profesor WHERE id_prof = ?";
		mySQLClient.updateWithParams(query, params, fetch -> {
			if (fetch.succeeded()) {
				message.reply(new JsonObject());
			} else {
				fetch.cause();
			}
		});
	}
	private void insertarMateria(Message<JsonObject> message) {
		JsonArray params = new JsonArray().add(message.body().getInteger("id"));
		Integer intAleatorio = message.body().getInteger("intAleatorio");
		String query = "INSERT INTO materia VALUES (?,'"+intAleatorio+"','"+intAleatorio+"','"+intAleatorio+"')";
		mySQLClient.updateWithParams(query, params, fetch -> {
			if (fetch.succeeded()) {
				message.reply(new JsonObject());
			} else {
				fetch.cause();
			}
		});
	}
	private void eliminarMateria(Message<JsonObject> message) {
		JsonArray params = new JsonArray().add(message.body().getInteger("id"));
		String query = "DELETE FROM materia WHERE id_materia = ?";
		mySQLClient.updateWithParams(query, params, fetch -> {
			if (fetch.succeeded()) {
				message.reply(new JsonObject());
			} else {
				fetch.cause();
			}
		});
	}

}
