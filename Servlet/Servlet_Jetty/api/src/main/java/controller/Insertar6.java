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

/**
 * Servlet implementation class InsertarEliminar6
 */
 public class Insertar6 extends HttpServlet {
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


     public Insertar6() {
         super();

     }

 	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {

 		String id1 = request.getParameter("id1");
 		String id2 = request.getParameter("id2");
 		String id3 = request.getParameter("id3");
 		String id4 = request.getParameter("id4");
 		String id5 = request.getParameter("id5");
 		String id6 = request.getParameter("id6");
 		Random aleatorio = new Random();
 		int intAleatorio = aleatorio.nextInt(10)+1;

 		Estudiante estudiante1 = new Estudiante(id1,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				intAleatorio, "2014-04-04");
 		Estudiante estudiante2 = new Estudiante(id2,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				intAleatorio, "2014-04-04");
 		Estudiante estudiante3 = new Estudiante(id3,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				intAleatorio, "2014-04-04");
 		Estudiante estudiante4 = new Estudiante(id4,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				intAleatorio, "2014-04-04");
 		Estudiante estudiante5 = new Estudiante(id5,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				intAleatorio, "2014-04-04");
 		Estudiante estudiante6 = new Estudiante(id6,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				intAleatorio, "2014-04-04");


 		Profesor profesor1 = new Profesor(id1,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), "2014-04-04");
 		Profesor profesor2 = new Profesor(id2,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), "2014-04-04");
 		Profesor profesor3 = new Profesor(id3,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), "2014-04-04");
 		Profesor profesor4 = new Profesor(id4,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), "2014-04-04");
 		Profesor profesor5 = new Profesor(id5,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), "2014-04-04");
 		Profesor profesor6 = new Profesor(id6,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio), "2014-04-04");



 		Materia materia1 = new Materia(id1,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio));
 		Materia materia2 = new Materia(id2,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio));
 		Materia materia3 = new Materia(id3,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio));
 		Materia materia4 = new Materia(id4,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio));
 		Materia materia5 = new Materia(id5,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio));
 		Materia materia6 = new Materia(id6,
 				String.valueOf(intAleatorio), String.valueOf(intAleatorio),
 				String.valueOf(intAleatorio));


 		try{

 			estudianteDAO.insertar(estudiante1);
 			profesorDAO.insertar(profesor1);
 			materiaDAO.insertar(materia1);
 			estudianteDAO.insertar(estudiante2);
 			profesorDAO.insertar(profesor2);
 			materiaDAO.insertar(materia2);
 			estudianteDAO.insertar(estudiante3);
 			profesorDAO.insertar(profesor3);
 			materiaDAO.insertar(materia3);
 			estudianteDAO.insertar(estudiante4);
 			profesorDAO.insertar(profesor4);
 			materiaDAO.insertar(materia4);
 			estudianteDAO.insertar(estudiante5);
 			profesorDAO.insertar(profesor5);
 			materiaDAO.insertar(materia5);
 			estudianteDAO.insertar(estudiante6);
 			profesorDAO.insertar(profesor6);
 			materiaDAO.insertar(materia6);

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
