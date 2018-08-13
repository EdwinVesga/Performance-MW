package edu.uis.Consulta;

import java.util.Random;

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
				.put("maxPoolSize", 100).put("username", "performance").put("password", "123456").put("database", "universidad").put("charset","UTF-8"));
		
		mySQLClient.getConnection( ar -> { 
			if (ar.failed()) {
				ar.cause();
				startFuture.fail(ar.cause());
			} else {

				startFuture.complete();
				vertx.eventBus().consumer("puente", this::onMessage);
			}});  
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
			case "consultarSemestre":
				consultarSemestre(message);
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
			default:
				message.fail(ErrorCodes.BAD_ACTION.ordinal(),"Bad action: "+ action);
			}
		}
	}
	private void consultarSemestre(Message<JsonObject> message) {
		JsonArray params = new JsonArray().add(message.body().getInteger("semestre"));
		String query= "SELECT COUNT(*) FROM estudiante WHERE semestre_est= ?";
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
		String query= "SELECT COUNT(*) FROM profesor WHERE escuela_prof = ?";
		mySQLClient.queryWithParams(query, params, fetch -> { 
			if (fetch.succeeded()) {
				message.reply(fetch.result().toJson());
			} else {
				fetch.cause();
			}
		});
	}
	private void consultarEstudiante(Message<JsonObject> message) {

		mySQLClient.query("SELECT * FROM estudiante", fetch -> { 
			if (fetch.succeeded()) {
				message.reply(fetch.result().toJson());
			} else {
				fetch.cause();
			}
		});
	}
	private void consultarProfesor(Message<JsonObject> message) {
	
		mySQLClient.query("SELECT * FROM profesor", fetch -> { 
			if (fetch.succeeded()) {
				message.reply(fetch.result().toJson());
			} else {
				fetch.cause();
			}
		});
	}
	private void consultarMateria(Message<JsonObject> message) {
		
		mySQLClient.query("SELECT * FROM materia", fetch -> { 
			if (fetch.succeeded()) {
				message.reply(fetch.result().toJson());
			} else {
				fetch.cause();
			}
		});
	}
	private void insertarEstudiante(Message<JsonObject> message) {
		Random aleatorio = new Random(System.currentTimeMillis());
		int intAleatorio = aleatorio.nextInt(100);
		JsonArray params = new JsonArray().add(message.body().getInteger("id"));
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
		Random aleatorio = new Random(System.currentTimeMillis());
		int intAleatorio = aleatorio.nextInt(100);
		JsonArray params = new JsonArray().add(message.body().getInteger("id"));
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
		Random aleatorio = new Random(System.currentTimeMillis());
		int intAleatorio = aleatorio.nextInt(100);
		JsonArray params = new JsonArray().add(message.body().getInteger("id"));
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
