package controller;

import java.io.IOException;
import java.sql.SQLException;
import javax.servlet.RequestDispatcher;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import dao.EstudianteDAO;

public class ConsultaEstudianteSemestreC extends HttpServlet {
	private static final long serialVersionUID = 1L;
	private EstudianteDAO estudianteDAO;
	public void init() {
		try {
			estudianteDAO = new EstudianteDAO();
		} catch (Exception e) {
			// TODO: handle exception
		}
	}

    public ConsultaEstudianteSemestreC() {
        super();
        // TODO Auto-generated constructor stub
    }


	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		// TODO Auto-generated method stub
		try {
			Integer count = estudianteDAO.contarSemestreC(request.getParameter("semestre"));
			RequestDispatcher dispatcher = request.getRequestDispatcher("/ConsultaEstudianteSemestre.jsp");
			request.setAttribute("count", count);
			request.setAttribute("semestre", request.getParameter("semestre"));
			dispatcher.forward(request, response);
			}catch(SQLException e) {
				e.printStackTrace();
			}
	}

	protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		// TODO Auto-generated method stub
		doGet(request, response);
	}

}
