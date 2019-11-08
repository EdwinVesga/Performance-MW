package edu.uis.Consulta;


import io.vertx.reactivex.core.AbstractVerticle;
import io.reactivex.Single;
import io.vertx.core.DeploymentOptions;
import io.vertx.core.VertxOptions;
import io.vertx.core.dns.AddressResolverOptions;
import io.vertx.reactivex.core.Future;
import io.vertx.reactivex.core.RxHelper;
import io.vertx.reactivex.core.Vertx;


public class MainVerticle extends AbstractVerticle{


	@Override
	public void start() {

		DeploymentOptions serveropt = new DeploymentOptions().setInstances(6);
		DeploymentOptions jdbcopt = new DeploymentOptions().setWorker(true)
																											 .setWorkerPoolSize(10)
																											 .setWorkerPoolName("jdbc")
																											 .setInstances(10);
		Future<String> database = Future.future();
		vertx.rxDeployVerticle("edu.uis.Consulta.database.DatabaseVerticle",
				jdbcopt).subscribe(id -> database.completer());
		Future<String> httpserver = Future.future();
		vertx.rxDeployVerticle("edu.uis.Consulta.http.HttpServerVerticle",
				serveropt).subscribe(id -> httpserver.completer());

	}

	public static void main(String[] args) {
		Future<String> future = Future.future();
		VertxOptions options = new VertxOptions()
				.setAddressResolverOptions(new AddressResolverOptions().setMaxQueries(10).setRotateServers(true))
				.setEventLoopPoolSize(VertxOptions.DEFAULT_EVENT_LOOP_POOL_SIZE);
		Single<String> deployment = RxHelper.deployVerticle(Vertx.vertx(options), new MainVerticle());
		deployment.subscribe(id -> future.completer());
	}

}
