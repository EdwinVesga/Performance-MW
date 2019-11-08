package controller;

import java.io.IOException;
import java.sql.SQLException;
import java.util.List;
import javax.servlet.RequestDispatcher;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import dao.EstudianteDAO;


@WebServlet("/ConsultaEstudianteSemestreA")
public class ConsultaEstudianteSemestreA extends HttpServlet {
	private static final long serialVersionUID = 1L;
	private EstudianteDAO estudianteDAO;
	public void init() {
		try {
			estudianteDAO = new EstudianteDAO();
		} catch (Exception e) {
			// TODO: handle exception
		}
	}
	
    public ConsultaEstudianteSemestreA() {
        super();
        // TODO Auto-generated constructor stub
    }

	
	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		// TODO Auto-generated method stub
		try {
			List<Integer> count = estudianteDAO.contarSemestreA();
			RequestDispatcher dispatcher = request.getRequestDispatcher("/ConsultaEstudianteSemestre.jsp");
			request.setAttribute("semestre", count.get(0));
			request.setAttribute("total", count.get(1));
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
