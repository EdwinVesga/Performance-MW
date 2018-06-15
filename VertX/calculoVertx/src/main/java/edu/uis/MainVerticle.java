package edu.uis;


import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.core.WorkerExecutor;
import io.vertx.core.AbstractVerticle;
import java.util.ArrayList;
public class MainVerticle extends AbstractVerticle {

	@Override
    public void start(Future<Void> fut) {
        WorkerExecutor executor=vertx.createSharedWorkerExecutor("my-worker-pool");
        ArrayList<Integer> array = new ArrayList<>();      
        vertx.createHttpServer().requestHandler(r -> {
        	
        	r.response().setChunked(true);
			r.response().putHeader("content-type", "text/html;charset=UTF-8");
			r.response().write("<!DOCTYPE html>");
			r.response().write("<html>");
			r.response().write("<head>");
			r.response().write("<title>Vertx</title>");            
			r.response().write("</head>");
			r.response().write("<body>");
			r.response().write("<h1>Imprime lista de primos.</h1>");
            executor.executeBlocking(future -> {
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
                
			if(primo == true) array.add(suma);
            }
			future.complete();
			}, false, res -> {
			
				if(res.succeeded()){
				for(Integer e : array) {
					r.response().write(""+e+"</br>");
				}
				r.response().write("</body>");
				r.response().write("</html>");
				r.response().end();}
				else{res.cause();}				
			});
		        		
        }).listen(4000,result -> {
            if (result.succeeded()) {
                fut.complete();
            } else {
                fut.fail(result.cause());
            }
        });
}
	
	public static void main(String[] args) {
		Future<String> future = Future.future();
		Vertx.vertx().deployVerticle(new MainVerticle(), future.completer());
	
	}

}
