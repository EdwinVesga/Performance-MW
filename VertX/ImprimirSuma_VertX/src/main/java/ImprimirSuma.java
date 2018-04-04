
import io.vertx.core.AbstractVerticle;
import io.vertx.core.WorkerExecutor;
import io.vertx.core.Future;
import java.util.ArrayList;

public class ImprimirSuma extends AbstractVerticle {
    
    @Override
    public void start(Future<Void> fut) {
        WorkerExecutor executor=vertx.createSharedWorkerExecutor("my-worker-pool");
        vertx.createHttpServer().requestHandler(r -> {
            
            executor.executeBlocking(future -> {
			int a = 1;
            int b = 1;
            int suma = 0;

            for (int i = 0; i < 10000; i++) {
                suma = suma + a + b + i;
				if ( (suma % 20) == 0 )
					System.out.println(suma);
            }
			future.complete();
			}, res -> {
				if(res.succeeded()){
				r.response().setChunked(true);
				r.response().putHeader("content-type", "text/html;charset=UTF-8");
				r.response().write("<!DOCTYPE html>");
				r.response().write("<html>");
				r.response().write("<head>");
				r.response().write("<title>Vertx</title>");            
				r.response().write("</head>");
				r.response().write("<body>");
				r.response().write("<h1>Imprime suma.</h1>");
				r.response().write("</body>");
				r.response().write("</html>");
				r.response().end();}
				else{res.cause();}				
			});
		        		
        }).listen(8080,result -> {
            if (result.succeeded()) {
                fut.complete();
            } else {
                fut.fail(result.cause());
            }
        });
    }
}
