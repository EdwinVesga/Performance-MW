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
import dao.ProfesorDAO;
import model.Profesor;


public class ConsultaProfesor extends HttpServlet {
	private static final long serialVersionUID = 1L;
	private ProfesorDAO profesorDAO;

	public void init() {
		try {
			profesorDAO = new ProfesorDAO();
		} catch (Exception e) {
			// TODO: handle exception
		}
	}

    public ConsultaProfesor() {
        super();

    }

	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		RequestDispatcher dispatcher = request.getRequestDispatcher("/ConsultaProfesor.jsp");
		try {
		List<Profesor> listaProfesores = profesorDAO.listarProfesores();
		request.setAttribute("lista", listaProfesores);
		dispatcher.forward(request, response);
		} catch(SQLException e)
		{
			e.printStackTrace();
		}
	}

	protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		// TODO Auto-generated method stub
		doGet(request, response);
	}

}
