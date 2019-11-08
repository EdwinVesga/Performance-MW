package edu.uis.Consulta.http;

import io.vertx.reactivex.core.RxHelper;
import io.vertx.reactivex.core.AbstractVerticle;
import io.reactivex.Observable;
import io.reactivex.Scheduler;
import io.reactivex.Single;
import java.util.concurrent.ThreadLocalRandom;
import edu.uis.Consulta.database.reactivex.DatabaseService;
import io.vertx.core.eventbus.DeliveryOptions;
import io.vertx.core.http.HttpServerOptions;
import io.vertx.reactivex.core.http.HttpServer;
import io.vertx.reactivex.ext.web.Router;
import io.vertx.reactivex.ext.web.RoutingContext;
import io.vertx.reactivex.ext.web.handler.BodyHandler;
import io.vertx.reactivex.ext.web.templ.freemarker.FreeMarkerTemplateEngine;
import model.Estudiante;
import model.Materia;
import model.Profesor;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.sql.UpdateResult;
import java.util.ArrayList;
import java.util.List;

public class HttpServerVerticle extends AbstractVerticle{

	public static final String CONFIG_HTTP_SERVER_PORT = "http.server.port";
	public static final String CONFIG_DB_QUEUE = "db.queue";
	private FreeMarkerTemplateEngine TemplateEngine;
	private DatabaseService dbService;
	private Scheduler executor_io;
	@Override
	public void start(){
		executor_io = RxHelper.blockingScheduler(vertx,false);
		TemplateEngine = FreeMarkerTemplateEngine.create(vertx);
		Router router = Router.router(vertx);
		String DbQueue = config().getString(CONFIG_DB_QUEUE, "db.queue");
		dbService = edu.uis.Consulta.database.DatabaseService.createProxy(vertx.getDelegate(), DbQueue);
		int portNumber = config().getInteger(CONFIG_HTTP_SERVER_PORT, 4000);
		HttpServer server = vertx.createHttpServer(new HttpServerOptions().setPort(portNumber));
		router.get().handler(BodyHandler.create());
		router.get("/").handler(this::indexHandler);
		router.get("/ConsultaEstudiante").handler(this::consultaEstudianteHandler);
		router.get("/ConsultaProfesor").handler(this::consultaProfesorHandler);
		router.get("/ConsultaMateria").handler(this::consultaMateriaHandler);
		router.get("/ConsultaEstudianteSemestreA").handler(this::consultaEstudianteSemestreAHandler);
		router.get("/ConsultaEstudianteSemestreB").handler(this::consultaEstudianteSemestreBHandler);
		router.get("/ConsultaEstudianteSemestreC").handler(this::consultaEstudianteSemestreCHandler);
		router.get("/ConsultaProfesorEscuela").handler(this::consultaProfesorEscuelaHandler);
		router.get("/Insertar1").handler(this::insertar1Handler);
		router.get("/Insertar3").handler(this::insertar3Handler);
		router.get("/Insertar6").handler(this::insertar6Handler);
		router.get("/ContarPrimos1000").handler(this::ContarPrimos1000Handler);
		router.get("/ContarPrimos2000").handler(this::ContarPrimos2000Handler);
		router.get("/ContarPrimos3000").handler(this::ContarPrimos3000Handler);
		server.requestHandler(router);
		server.rxListen().subscribe();
	}


	private void indexHandler(RoutingContext rc){

		JsonObject ctx = new JsonObject().put("title", "Vertx");
		TemplateEngine.rxRender(ctx,"templates/index.ftl")
					  .subscribeOn(RxHelper.scheduler(vertx))
					  .subscribe(ar-> { rc.response().putHeader("Content-type", "text/html");
									    rc.response().end(ar);
					  				  },
							     err -> rc.fail(err.getCause()));
	}

	private void insertar1Handler(RoutingContext rc) {

			int intAleatorio = ThreadLocalRandom.current().nextInt(10)+1;

			Single<UpdateResult> insEst = dbService.rxInsertarEstudiante(rc.request().getParam("id"), intAleatorio);
			Single<UpdateResult> insProf = dbService.rxInsertarProfesor(rc.request().getParam("id"), intAleatorio);
			Single<UpdateResult> insMat = dbService.rxInsertarMateria(rc.request().getParam("id"), intAleatorio);
			Single.merge(insEst,insProf,insMat)
			.lastElement()
			.flatMap(v -> TemplateEngine.rxRender(new JsonObject().put("title", "Vertx"), "templates/Insertar.ftl").toMaybe())
			.subscribe(ar -> {rc.response().putHeader("Content-type", "text/html");
							  rc.response().end(ar);
							 },
					   err -> rc.fail(err.getCause()));

	}
	private void insertar3Handler(RoutingContext rc) {

			int intAleatorio = ThreadLocalRandom.current().nextInt(10)+1;

			Observable.range(1, 3)
					.map(i -> rc.request().getParam("id"+i))
					.flatMap(v->{
						Observable<UpdateResult> insEst = dbService
								.rxInsertarEstudiante(v, intAleatorio).toObservable();
						Observable<UpdateResult> insProf = dbService
								.rxInsertarProfesor(v, intAleatorio).toObservable();
						Observable<UpdateResult> insMat = dbService
								.rxInsertarMateria(v, intAleatorio).toObservable();
						return Observable.merge(insEst,insProf,insMat);
					}).lastElement()
			.flatMap(v -> TemplateEngine.rxRender(new JsonObject().put("title", "Vertx"), "templates/Insertar.ftl").toMaybe())
			.subscribe(ar -> {rc.response().putHeader("Content-type", "text/html");
							  rc.response().end(ar);
							 },
					   err -> rc.fail(err.getCause()));

	}
	private void insertar6Handler(RoutingContext rc) {

			int intAleatorio = ThreadLocalRandom.current().nextInt(10)+1;

			Observable.range(1, 6)
					.map(i -> rc.request().getParam("id"+i))
					.flatMap(v -> {
						Observable<UpdateResult> insEst = dbService
								.rxInsertarEstudiante(v, intAleatorio).toObservable();
						Observable<UpdateResult> insProf = dbService
								.rxInsertarProfesor(v, intAleatorio).toObservable();
						Observable<UpdateResult> insMat = dbService
								.rxInsertarMateria(v, intAleatorio).toObservable();
						return Observable.merge(insEst,insProf,insMat);
					}).lastElement()
			.flatMap(v -> TemplateEngine.rxRender(new JsonObject().put("title", "Vertx"), "templates/Insertar.ftl").toMaybe())
			.subscribe(ar -> {rc.response().putHeader("Content-type", "text/html");
							  rc.response().end(ar);
							 },
					   err -> rc.fail(err.getCause()));

	}

	private void consultaEstudianteHandler(RoutingContext rc){

		dbService.rxConsultarEstudiante()
		.subscribeOn(executor_io)
		.flatMap(v -> {
			List<Estudiante> listaEstudiantes = new ArrayList<Estudiante>();
			List<JsonObject> rows = v;
			for(JsonObject arr : rows) {
				String id_est = arr.getString("id_est");
				String primer_nombre_est = arr.getString("primer_nombre_est");
				String segundo_nombre_est = arr.getString("segundo_nombre_est");
				String primer_apellido_est = arr.getString("primer_apellido_est");
				String segundo_apellido_est = arr.getString("segundo_apellido_est");
				int semestre_est = arr.getInteger("semestre_est");
				String fecha_ingreso_est = arr.getString("fecha_ingreso_est");
				Estudiante estudiante = new Estudiante(id_est, primer_nombre_est, segundo_nombre_est, primer_apellido_est,
						segundo_apellido_est, semestre_est, fecha_ingreso_est);
				listaEstudiantes.add(estudiante);
			}
			return TemplateEngine.rxRender(new JsonObject()
					.put("lista", listaEstudiantes)
					.put("title", "Vertx"),"templates/ConsultaEstudiante.ftl");

		}).subscribe(ar-> {rc.response().putHeader("Content-type", "text/html");
						  rc.response().end(ar);
						  },
					 err -> rc.fail(err.getCause())
		);

	}

	private void consultaProfesorHandler(RoutingContext rc){

		dbService.rxConsultarProfesor()
		.subscribeOn(executor_io)
		.flatMap(v -> {
			List<Profesor> listaProfesores = new ArrayList<Profesor>();
			List<JsonObject> rows = v;
			for(JsonObject arr : rows) {
				String id_prof = arr.getString("id_prof");
				String primer_nombre_prof = arr.getString("primer_nombre_prof");
				String segundo_nombre_prof = arr.getString("segundo_nombre_prof");
				String primer_apellido_prof = arr.getString("primer_apellido_prof");
				String segundo_apellido_prof = arr.getString("segundo_apellido_prof");
				String escuela_prof = arr.getString("escuela_prof");
				String fecha_incorporacion_prof = arr.getString("fecha_incorporacion_prof");
				Profesor profesor = new Profesor(id_prof, primer_nombre_prof, segundo_nombre_prof, primer_apellido_prof,
						segundo_apellido_prof, escuela_prof, fecha_incorporacion_prof);
				listaProfesores.add(profesor);
			}

			return TemplateEngine.rxRender(new JsonObject()
					.put("lista", listaProfesores)
					.put("title", "Vertx"), "templates/ConsultaProfesor.ftl");

		}).subscribe(ar -> { rc.response().putHeader("Content-type", "text/html");
						     rc.response().end(ar);
						   },
				     err -> rc.fail(err.getCause()));

	}

	private void consultaMateriaHandler(RoutingContext rc){

		dbService.rxConsultarMateria()
		.subscribeOn(executor_io)
		.flatMap(v -> {
			List<Materia> listaMaterias = new ArrayList<Materia>();
			List<JsonObject> rows = v;
			for(JsonObject arr : rows) {
				String id_materia = arr.getString("id_materia");
				String nombre_materia = arr.getString("nombre_materia");
				String salon_materia = arr.getString("salon_materia");
				String horario_materia = arr.getString("horario_materia");
				Materia materia = new Materia(id_materia, nombre_materia, salon_materia, horario_materia);
				listaMaterias.add(materia);
			}

			return TemplateEngine.rxRender(new JsonObject()
					.put("lista", listaMaterias)
					.put("title", "Vertx"), "templates/ConsultaMateria.ftl");

		}).subscribe(ar -> { rc.response().putHeader("Content-type", "text/html");
						     rc.response().end(ar);
					       },
				     err -> rc.fail(err.getCause()));

	}

	private void consultaEstudianteSemestreAHandler(RoutingContext rc){

		int intAleatorio = ThreadLocalRandom.current().nextInt(10)+1;

		dbService.rxContarSemestreA(intAleatorio)
			 .flatMap(v -> TemplateEngine.rxRender(new JsonObject()
					 .put("total",v)
					 .put("semestre",intAleatorio)
					 .put("title", "Vertx"), "templates/ConsultaEstudianteSemestre.ftl"))
			 .subscribe(ar-> {rc.response().putHeader("Content-type", "text/html");
						      rc.response().end(ar);
						     },
					    err -> rc.fail(err.getCause()));
	}

	private void consultaEstudianteSemestreBHandler(RoutingContext rc){

		int intAleatorio = ThreadLocalRandom.current().nextInt(10)+1;

		dbService.rxContarSemestreB(intAleatorio)
			 .flatMap(v -> TemplateEngine.rxRender(new JsonObject()
					 .put("total",v)
					 .put("semestre",intAleatorio)
					 .put("title", "Vertx"), "templates/ConsultaEstudianteSemestre.ftl"))
			 .subscribe(ar-> {rc.response().putHeader("Content-type", "text/html");
						      rc.response().end(ar);
						     },
					    err -> rc.fail(err.getCause()));
	}

	private void consultaEstudianteSemestreCHandler(RoutingContext rc){

		int intAleatorio = ThreadLocalRandom.current().nextInt(10)+1;

		dbService.rxContarSemestreC(intAleatorio)
			 .flatMap(v -> TemplateEngine.rxRender(new JsonObject()
					 .put("total",v)
					 .put("semestre",intAleatorio)
					 .put("title", "Vertx"), "templates/ConsultaEstudianteSemestre.ftl"))
			 .subscribe(ar-> {rc.response().putHeader("Content-type", "text/html");
						      rc.response().end(ar);
						     },
					    err -> rc.fail(err.getCause()));
	}

	private void consultaProfesorEscuelaHandler(RoutingContext rc){
		DeliveryOptions options = new DeliveryOptions().addHeader("action", "consultarEscuela" );
		JsonObject request = new JsonObject().put("escuela", rc.request().getParam("escuela"));
		vertx.eventBus().rxSend("Profesor", request, options)
		.subscribe(reply -> {
			JsonObject rs = (JsonObject)reply.body();
			JsonObject resultset = (JsonObject)rs.getJsonArray("rows").getJsonObject(0);
			rc.put("escuela", rc.request().getParam("escuela"));
			rc.put("count", resultset.getValue("COUNT(*)"));
			rc.put("title", "Vertx");
			TemplateEngine.rxRender(rc.getBodyAsJson(), "templates/ConsultaProfesorEscuela.ftl")
			.subscribe(ar->{rc.response().putHeader("Content-type", "text/html");
							rc.response().end(ar);
					},err ->{rc.fail(err.getCause());});
		}, err -> {
			rc.fail(err.getCause());
		});
	}

	private void ContarPrimos1000Handler(RoutingContext rc) {

        Observable.range(2, 1000)
        .subscribeOn(executor_io)
        		  .reduce(0,(total, i)->{ int contador = 2;
        		  						  boolean primo=true;
        		  						  while ((primo) && (contador!=i)){
        		  							  if (i % contador == 0)
        		  								  primo = false;
        		  							  contador++;
        		  						  								  }
        		  						  if(primo) total++;
        		  						  return total;
          								 })
        .flatMap(v -> TemplateEngine.rxRender(new JsonObject()
        		.put("size", v)
        		.put("title", "Vertx")
        		.put("limite", 1000), "templates/ContarPrimos.ftl"))
	    .subscribe(ar-> {rc.response().putHeader("Content-type", "text/html");
						 rc.response().end(ar);
	    				},
	    		   err -> rc.fail(err.getCause()));

	}
	private void ContarPrimos2000Handler(RoutingContext rc) {

		Observable.range(2, 2000)
			.subscribeOn(executor_io)
				  .reduce(0,(total, i)->{ int contador = 2;
				  						  boolean primo=true;
				  						  while ((primo) && (contador!=i)){
				  						 	  if (i % contador == 0)
				  					 		 	 primo = false;
				  						      contador++;
				  						 								  }
				  						  if(primo) total++;
				  						  return total;
          								})
        	.flatMap(v -> TemplateEngine.rxRender(new JsonObject()
        			.put("size", v)
        			.put("title", "Vertx")
        			.put("limite", 2000), "templates/ContarPrimos.ftl"))
    	    .subscribe(ar-> {rc.response().putHeader("Content-type", "text/html");
    					     rc.response().end(ar);
    	    				},
    	    		   err -> rc.fail(err.getCause()));
	}
	private void ContarPrimos3000Handler(RoutingContext rc) {

		Observable.range(2, 3000)
				.subscribeOn(executor_io)
		          .reduce(0,(total, i)->{ int contador = 2;
		          						  boolean primo=true;
		          						  while ((primo) && (contador!=i)){
		          							  if (i % contador == 0)
		          								  primo = false;
		          							  contador++;
		  						 								  		  }
		          						  if(primo) total++;
		          						  return total;
										})
		          .flatMap(v -> TemplateEngine.rxRender(new JsonObject()
		        		  .put("size", v)
		        		  .put("title", "Vertx")
		        		  .put("limite", 3000), "templates/ContarPrimos.ftl"))
		          .subscribe(ar-> {rc.response().putHeader("Content-type", "text/html");
		          				   rc.response().end(ar);
		          				  },
		        		     err -> rc.fail(err.getCause()));

	}
}
