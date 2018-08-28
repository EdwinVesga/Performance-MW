package controller;

import java.io.IOException;
import java.util.Random;
import javax.servlet.RequestDispatcher;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import dao.EstudianteDAO;
import model.Estudiante;

/**
 * Servlet implementation class Insertar1000
 */
@WebServlet("/Insertar1000")
public class Insertar1000 extends HttpServlet {
	private static final long serialVersionUID = 1L;
	private EstudianteDAO estudianteDAO;
	public void init() {
		try {
			estudianteDAO = new EstudianteDAO();
		} catch (Exception e) {
			// TODO: handle exception
		}
	}

    public Insertar1000() {
        super();
        // TODO Auto-generated constructor stub
    }


	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		// TODO Auto-generated method stub
		String id = request.getParameter("id");
		Random aleatorio = new Random();
		int intAleatorio = aleatorio.nextInt(1000);

		Estudiante estudiante = new Estudiante(id,
				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
				intAleatorio, "2014-04-04");
		try{
			estudianteDAO.insertarA(estudiante);
			RequestDispatcher dispatcher = request.getRequestDispatcher("/Insertar.jsp");
			dispatcher.forward(request, response);
		}catch(Exception e){
			e.printStackTrace();
		}
	}


	protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		// TODO Auto-generated method stub
		doGet(request, response);
	}

}
