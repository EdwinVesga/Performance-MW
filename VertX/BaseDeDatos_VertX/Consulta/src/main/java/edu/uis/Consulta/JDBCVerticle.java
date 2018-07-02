package edu.uis.Consulta;

import io.vertx.core.AbstractVerticle;

import io.vertx.core.Future;

import io.vertx.core.json.JsonObject;
import io.vertx.ext.asyncsql.MySQLClient;
import io.vertx.ext.sql.SQLClient;
import io.vertx.ext.sql.SQLConnection;


/**
 *
 * @author Edwin_Vesga
 */
public class JDBCVerticle extends AbstractVerticle {




	@Override
	public void start(Future<Void> startFuture){
		JsonObject mySQLClientConfig=new JsonObject().put("host","localhost").put("post","3306")
				.put("maxPoolSize", 30).put("username", "root").put("password", "123456").put("database", "universidad").put("charset","UTF-8");
		SQLClient mySQLClient = MySQLClient.createShared(vertx, mySQLClientConfig);
		mySQLClient.getConnection( ar -> { 
			if (ar.failed()) {
				ar.cause();
				startFuture.fail(ar.cause());
			} else {

				startFuture.complete();
				SQLConnection connection = ar.result();
				vertx.eventBus().consumer("consulta", message -> {

					connection.query((String)message.body(), fetch -> { 
						connection.close();
						if (fetch.succeeded()) {

							message.reply(fetch.result().toJson());
						} else {
							fetch.cause();
						}
					});
				});
			}});  
	}}
