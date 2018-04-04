

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
		vertx.createHttpServer().requestHandler(r -> {
			
				
				r.response().setChunked(true);
				r.response().putHeader("content-type", "text/html;charset=UTF-8");
				r.response().write("<!DOCTYPE html>");
				r.response().write("<html>");
				r.response().write("<head>");
				r.response().write("<title>Vertx</title>");            
				r.response().write("</head>");
				r.response().write("<body>");
				r.response().write("<h1>Se guardó: 'ArchivoDeTextoServlet.txt'.</h1>");
				r.response().write("</body>");
				r.response().write("</html>");
				
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
		
			}
			r.response().end();
	}).listen(8080,result -> {
            if (result.succeeded()) {
                fut.complete();
            } else {
                fut.fail(result.cause());
            }
        });
    }
}

