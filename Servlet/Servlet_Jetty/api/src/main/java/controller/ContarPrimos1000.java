package controller;

import java.io.IOException;
import java.util.ArrayList;

import javax.servlet.RequestDispatcher;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * Servlet implementation class ContarPrimos1000
 */
public class ContarPrimos1000 extends HttpServlet {
	private static final long serialVersionUID = 1L;


    public ContarPrimos1000() {
        super();
        // TODO Auto-generated constructor stub
    }

    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {

		int total = 0;
		RequestDispatcher dispatcher = request.getRequestDispatcher("/ContarPrimos.jsp");
        int suma = 1;
        for (int i = 0; i < 1000; i++) {
            suma = suma + 1;
            int contador = 2;
            boolean primo=true;
            while ((primo) && (contador!=suma)){
              if (suma % contador == 0)
                primo = false;
              contador++;
            }
			if(primo) total++;
        }
    		request.setAttribute("size",total);
				request.setAttribute("limit",1000);
    		try {
    		dispatcher.forward(request, response);
    		}catch(Exception e) {
    			e.printStackTrace();
    		}
	}

	protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		// TODO Auto-generated method stub
		doGet(request, response);
	}

}
