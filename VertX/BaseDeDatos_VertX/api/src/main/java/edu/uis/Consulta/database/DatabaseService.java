package edu.uis.Consulta.database;

import io.vertx.codegen.annotations.Fluent;
import io.vertx.codegen.annotations.GenIgnore;
import io.vertx.codegen.annotations.ProxyGen;
import io.vertx.codegen.annotations.VertxGen;
import io.vertx.core.AsyncResult;
import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.sql.UpdateResult;
import io.vertx.reactivex.ext.sql.SQLClient;
import java.util.HashMap;
import java.util.List;

@ProxyGen
@VertxGen
public interface DatabaseService {
	
	@GenIgnore
	static DatabaseService create(SQLClient dbClient, HashMap<SqlQuery, String> sqlQueries) {
	  return new DatabaseServiceImpl(dbClient, sqlQueries);
	}
	
	@GenIgnore
	  static edu.uis.Consulta.database.reactivex.DatabaseService createProxy(Vertx vertx, String address) {
	    return new edu.uis.Consulta.database.reactivex.DatabaseService(new DatabaseServiceVertxEBProxy(vertx, address));
	  }

	@Fluent
	DatabaseService insertarEstudiante(String id, int intAleatorio, Handler<AsyncResult<UpdateResult>> resultHandler);
	
	@Fluent
	DatabaseService insertarProfesor(String id, int intAleatorio, Handler<AsyncResult<UpdateResult>> resultHandler);
	
	@Fluent
	DatabaseService insertarMateria(String id, int intAleatorio, Handler<AsyncResult<UpdateResult>> resultHandler);
	
	@Fluent
	DatabaseService EliminarEstudiante(String id, Handler<AsyncResult<UpdateResult>> resultHandler);
	
	@Fluent
	DatabaseService EliminarProfesor(String id, Handler<AsyncResult<UpdateResult>> resultHandler);
	
	@Fluent
	DatabaseService EliminarMateria(String id, Handler<AsyncResult<UpdateResult>> resultHandler);

	@Fluent
	DatabaseService contarSemestreA(int intAleatorio, Handler<AsyncResult<Integer>> resultHandler);
	
	@Fluent
	DatabaseService contarSemestreB(int intAleatorio, Handler<AsyncResult<Integer>> resultHandler);
	
	@Fluent
	DatabaseService contarSemestreC(int intAleatorio, Handler<AsyncResult<Integer>> resultHandler);
	
	@Fluent
	DatabaseService consultarEstudiante(Handler<AsyncResult<List<JsonObject>>> resultHandler);
	
	@Fluent
	DatabaseService consultarProfesor(Handler<AsyncResult<List<JsonObject>>> resultHandler);
	
	@Fluent
	DatabaseService consultarMateria(Handler<AsyncResult<List<JsonObject>>> resultHandler);
	
}
