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
import dao.MateriaDAO;
import dao.ProfesorDAO;
import model.Estudiante;
import model.Materia;
import model.Profesor;


public class Insertar1 extends HttpServlet {
	private static final long serialVersionUID = 1L;
	private EstudianteDAO estudianteDAO;
	private ProfesorDAO profesorDAO;
	private MateriaDAO materiaDAO;

	public void init() {
		try {

			estudianteDAO = new EstudianteDAO();
			profesorDAO = new ProfesorDAO();
			materiaDAO = new MateriaDAO();
		} catch (Exception e) {
			// TODO: handle exception
		}
	}


    public Insertar1() {
        super();

    }

	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {

		String id = request.getParameter("id");
		Random aleatorio = new Random();
		int intAleatorio = aleatorio.nextInt(10)+1;

		Estudiante estudiante = new Estudiante(id,
				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
				intAleatorio, "2014-04-04");


		Profesor profesor = new Profesor(id,
				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
				String.valueOf(intAleatorio), "2014-04-04");


		Materia materia = new Materia(id,
				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
				String.valueOf(intAleatorio));

		try{

			estudianteDAO.insertar(estudiante);
			profesorDAO.insertar(profesor);
			materiaDAO.insertar(materia);

			RequestDispatcher dispatcher = request.getRequestDispatcher("/Insertar.jsp");
			dispatcher.forward(request, response);

		}catch(Exception e){
			e.printStackTrace();
		}
	}

	protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {

		doGet(request, response);
	}

}