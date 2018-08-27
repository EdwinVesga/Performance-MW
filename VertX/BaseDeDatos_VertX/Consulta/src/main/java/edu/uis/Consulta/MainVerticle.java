package edu.uis.Consulta;

import io.vertx.core.AbstractVerticle;
import io.vertx.core.CompositeFuture;
import io.vertx.core.DeploymentOptions;
import io.vertx.core.Future;
import io.vertx.core.Vertx;

public class MainVerticle extends AbstractVerticle{


	@Override
	public void start(Future<Void> startFuture) {
		Future<String> dbVerticleDeployment = Future.future();
		vertx.deployVerticle(new JDBCVerticle(), dbVerticleDeployment.completer());
		Future<String> httpVerticleDeployment = Future.future();
		vertx.deployVerticle(
				new HttpServerVerticle(),
				new DeploymentOptions().setInstances(1).setWorker(true),
				httpVerticleDeployment.completer());
		CompositeFuture.all(httpVerticleDeployment, dbVerticleDeployment).setHandler(ar -> {
			if (ar.succeeded()) {
				startFuture.complete();
			} else {
				startFuture.fail(ar.cause());
			}
		});
	}
	public static void main(String[] args) {
		Future<String> future = Future.future();
		Vertx.vertx().deployVerticle(new MainVerticle(), future.completer());
	}

}
