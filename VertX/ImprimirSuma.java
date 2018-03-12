
import io.vertx.core.AbstractVerticle;
import io.vertx.core.WorkerExecutor;
import io.vertx.core.Future;
import java.util.ArrayList;

public class ImprimirSuma extends AbstractVerticle {
    
    @Override
    public void start(Future<Void> fut) {
        WorkerExecutor executor=vertx.createSharedWorkerExecutor("my-worker-pool");
        vertx.createHttpServer().requestHandler(r -> {
        
            r.response().end(
                    "<h1>Imprimir suma</h1>"
            );
            executor.executeBlocking(future -> {
			int a = 1;
            int b = 1;
            int suma = 0;

            for (int i = 0; i < 10000; i++) {
                suma = suma + a + b + i;
				System.out.println(suma);
            }}, res -> {});
                  
        }).listen(8080, result -> {
            if (result.succeeded()) {
                fut.complete();
            } else {
                fut.fail(result.cause());
            }
        });
    }
}
