package controller;

import java.io.IOException;
import java.util.ArrayList;
import javax.servlet.RequestDispatcher;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;


@WebServlet("/ContarPrimos")
public class ContarPrimos extends HttpServlet {
	private static final long serialVersionUID = 1L;


    public ContarPrimos() {
        super();
        // TODO Auto-generated constructor stub
    }

	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {

		ArrayList<Integer> array = new ArrayList<Integer>();
		RequestDispatcher dispatcher = request.getRequestDispatcher("/ContarPrimos.jsp");
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
			if(primo) array.add(suma);
        }
    		request.setAttribute("size",array.size());
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
