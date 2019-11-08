package edu.uis.Consulta.database;

import java.util.HashMap;
import java.util.List;
import io.vertx.reactivex.SingleHelper;
import io.vertx.reactivex.ext.sql.SQLClient;
import io.vertx.core.*;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.sql.UpdateResult;


public class DatabaseServiceImpl implements DatabaseService{
	
	private final HashMap<SqlQuery, String> sqlQueries;
	private final SQLClient dbClient;

	DatabaseServiceImpl(SQLClient dbClient, HashMap<SqlQuery, String> sqlQueries) {
	    this.dbClient = dbClient;
	    this.sqlQueries = sqlQueries;
	}

	@Override
	public DatabaseService EliminarEstudiante(String id, Handler<AsyncResult<UpdateResult>> resultHandler) {
		
		JsonArray params = new JsonArray().add(id);
		dbClient.rxUpdateWithParams(sqlQueries.get(SqlQuery.DELETE_EST), params)
				.subscribe(SingleHelper.toObserver(resultHandler));

		return this;
		
	}

	@Override
	public DatabaseService EliminarProfesor(String id, Handler<AsyncResult<UpdateResult>> resultHandler) {
		
		JsonArray params = new JsonArray().add(id);
		dbClient.rxUpdateWithParams(sqlQueries.get(SqlQuery.DELETE_PROF), params)
				.subscribe(SingleHelper.toObserver(resultHandler));
		
		return this;
	}

	@Override
	public DatabaseService EliminarMateria(String id, Handler<AsyncResult<UpdateResult>> resultHandler) {
		
		JsonArray params = new JsonArray().add(id);
		dbClient.rxUpdateWithParams(sqlQueries.get(SqlQuery.DELETE_MAT), params)
				.subscribe(SingleHelper.toObserver(resultHandler));
		
		return this;
	}

	@Override
	public DatabaseService contarSemestreA(int intAleatorio, Handler<AsyncResult<Integer>> resultHandler) {
		
		JsonArray params = new JsonArray().add(intAleatorio);
		dbClient.rxQueryWithParams(sqlQueries.get(SqlQuery.COUNT_TABLE_A), params)
				.map(v -> v.getNumRows()).subscribe(SingleHelper.toObserver(resultHandler));
		
		return this;
	}

	@Override
	public DatabaseService contarSemestreB(int intAleatorio, Handler<AsyncResult<Integer>> resultHandler) {
		
		JsonArray params = new JsonArray().add(intAleatorio);
		dbClient.rxQueryWithParams(sqlQueries.get(SqlQuery.COUNT_TABLE_B), params)
				.map(v -> v.getNumRows()).subscribe(SingleHelper.toObserver(resultHandler));
		
		return this;
	}

	@Override
	public DatabaseService contarSemestreC(int intAleatorio, Handler<AsyncResult<Integer>> resultHandler) {
		
		JsonArray params = new JsonArray().add(intAleatorio);
		dbClient.rxQueryWithParams(sqlQueries.get(SqlQuery.COUNT_TABLE_C), params)
				.map(v -> v.getNumRows()).subscribe(SingleHelper.toObserver(resultHandler));
		
		return this;
	}

	@Override
	public DatabaseService consultarEstudiante(Handler<AsyncResult<List<JsonObject>>> resultHandler) {
		
		dbClient.rxQuery(sqlQueries.get(SqlQuery.CONSULT_EST))
			    .map(v -> v.getRows())
			    .subscribe(SingleHelper.toObserver(resultHandler));
		
		return this;
	}

	@Override
	public DatabaseService consultarProfesor(Handler<AsyncResult<List<JsonObject>>> resultHandler) {
		
		dbClient.rxQuery(sqlQueries.get(SqlQuery.CONSULT_PROF))
				.map(v -> v.getRows())
				.subscribe(SingleHelper.toObserver(resultHandler));
		return this;
	}

	@Override
	public DatabaseService consultarMateria(Handler<AsyncResult<List<JsonObject>>> resultHandler) {
		
		dbClient.rxQuery(sqlQueries.get(SqlQuery.CONSULT_MAT))
	    		.map(v -> v.getRows())
	    		.subscribe(SingleHelper.toObserver(resultHandler));
		
		return this;
	}

	@Override
	public DatabaseService insertarEstudiante(String id, int intAleatorio,
			Handler<AsyncResult<UpdateResult>> resultHandler) {
		JsonArray params = new JsonArray().add(id)
										  .add(intAleatorio)
									      .add(intAleatorio)
									      .add(intAleatorio)
									      .add(intAleatorio)
									      .add(intAleatorio);
		
		dbClient.rxUpdateWithParams(sqlQueries.get(SqlQuery.INSERT_EST), params)
				.subscribe(SingleHelper.toObserver(resultHandler));
		
		return this;
	}

	@Override
	public DatabaseService insertarProfesor(String id, int intAleatorio,
			Handler<AsyncResult<UpdateResult>> resultHandler) {
		JsonArray params = new JsonArray().add(id)
				  .add(intAleatorio)
			      .add(intAleatorio)
			      .add(intAleatorio)
			      .add(intAleatorio)
			      .add(intAleatorio);

		dbClient.rxUpdateWithParams(sqlQueries.get(SqlQuery.INSERT_PROF), params)
				.subscribe(SingleHelper.toObserver(resultHandler));

		return this;
	}

	@Override
	public DatabaseService insertarMateria(String id, int intAleatorio,
			Handler<AsyncResult<UpdateResult>> resultHandler) {
		JsonArray params = new JsonArray().add(id)
				  .add(intAleatorio)
			      .add(intAleatorio)
			      .add(intAleatorio);

		dbClient.rxUpdateWithParams(sqlQueries.get(SqlQuery.INSERT_MAT), params)
				.subscribe(SingleHelper.toObserver(resultHandler));

		return this;
	}

}
