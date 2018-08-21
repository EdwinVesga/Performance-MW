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
import dao.MateriaDAO;
import model.Materia;

public class ConsultaMateria extends HttpServlet {
	private static final long serialVersionUID = 1L;
	private MateriaDAO materiaDAO;
	public void init() {
		try {
			materiaDAO = new MateriaDAO();
		} catch (Exception e) {
			// TODO: handle exception
		}
	}


    public ConsultaMateria() {
        super();

    }


	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		RequestDispatcher dispatcher = request.getRequestDispatcher("/ConsultaMateria.jsp");
		try {
		List<Materia> listaMaterias = materiaDAO.listarMaterias();
		request.setAttribute("lista", listaMaterias);
		dispatcher.forward(request, response);
		}catch(SQLException e)
		{
			e.printStackTrace();
		}
	}


	protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		// TODO Auto-generated method stub
		doGet(request, response);
	}

}
