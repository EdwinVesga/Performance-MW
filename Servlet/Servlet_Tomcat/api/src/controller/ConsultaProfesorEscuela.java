package controller;

import java.io.IOException;
import java.sql.SQLException;

import javax.servlet.RequestDispatcher;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import dao.ProfesorDAO;

@WebServlet("/ConsultaProfesorEscuela")
public class ConsultaProfesorEscuela extends HttpServlet {
	private static final long serialVersionUID = 1L;
	private ProfesorDAO profesorDAO;
	
	public void init() {
		try {
			profesorDAO = new ProfesorDAO();
		} catch (Exception e) {
			// TODO: handle exception
		}
	}
       
    public ConsultaProfesorEscuela() {
        super();
        // TODO Auto-generated constructor stub
    }

	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		try {
			Integer count = profesorDAO.contarEscuela(request.getParameter("escuela"));
			RequestDispatcher dispatcher = request.getRequestDispatcher("/ConsultaProfesorEscuela.jsp");
			request.setAttribute("count", count);
			System.out.println("Count: "+count);
			request.setAttribute("escuela", request.getParameter("escuela"));
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
