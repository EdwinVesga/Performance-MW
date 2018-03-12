

import io.vertx.core.AbstractVerticle;
import java.io.BufferedWriter;
import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import io.vertx.core.Future;
import io.vertx.core.WorkerExecutor;

public class EscribirAlFinalDelFichero extends AbstractVerticle {
 

  
@Override
 public void start(Future<Void> fut) {
	 
		WorkerExecutor executor=vertx.createSharedWorkerExecutor("my-worker-pool");
		vertx.createHttpServer().requestHandler(req -> {req.response().putHeader("content-type", "text/html").end("<h1>Se guarda: 'ArchivoDeTextoVertX'</h1>");
			
			executor.executeBlocking(future -> {
		
			try {
                FileWriter fs = new FileWriter("../ArchivoDeTextoVertX.txt", true);
                BufferedWriter bw = new BufferedWriter(fs);
                bw.write("Hello World! ");
                bw.newLine();
                bw.close();
            } 
            catch (IOException ex) 
            {
                System.out.println("Error: "+ex.getMessage());
            }}, res -> {});
			
	}).listen(8080, result -> {
          if (result.succeeded()) 
		  {
            fut.complete();
          } 
		  else 
		  {
            fut.fail(result.cause());
          }
        });
  }
 

}


