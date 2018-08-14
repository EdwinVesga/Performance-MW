package controller;

import java.io.IOException;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import dao.EstudianteDAO;
import dao.MateriaDAO;
import dao.ProfesorDAO;
import java.sql.SQLException;
import java.util.List;
import javax.servlet.RequestDispatcher;
import model.Estudiante;
import model.Profesor;
import model.Materia;
import java.util.Random;
import java.util.ArrayList;

/**
 * Servlet implementation class AdminEstudiante
 */
@WebServlet("/adminEstudiante")

public class AdminEstudiante extends HttpServlet {
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

	/**
	 * @see HttpServlet#HttpServlet()
	 */
	public AdminEstudiante() {
		super();
		// TODO Auto-generated constructor stub
	}

	/**
	 * @see HttpServlet#doGet(HttpServletRequest request, HttpServletResponse
	 *      response)
	 */
	protected void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		String action = request.getParameter("action");
		System.out.println(action);
		try {
			switch (action) {
			case "index":
				index(request, response);
				break;
			case "consultaEstudiante":
				consultaEstudiante(request, response);
				break;
			case "consultaProfesor":
				consultaProfesor(request, response);
				break;
			case "consultaMateria":
				consultaMateria(request, response);
				break;
			case "consultaEstudianteSemestre":
				consultaEstudianteSemestre(request, response);
				break;
			case "consultaProfesorEscuela":
				consultaProfesorEscuela(request, response);
				break;
			case "insertaryeliminar":
				insertaryeliminar(request, response);
				break;
			case "contarprimos":
				contarprimos(request,response);
			default:
				break;
			}
		} catch (SQLException e) {
			e.getStackTrace();
		}

	}

	protected void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		doGet(request, response);
	}
	private void index(HttpServletRequest request, HttpServletResponse response)
			throws SQLException, ServletException, IOException {
		RequestDispatcher dispatcher = request.getRequestDispatcher("index.jsp");
		dispatcher.forward(request, response);
	}

	private void consultaEstudiante(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		RequestDispatcher dispatcher = request.getRequestDispatcher("/ConsultaEstudiante.jsp");
		try {
		List<Estudiante> listaEstudiantes = estudianteDAO.listarEstudiantes();
		request.setAttribute("lista", listaEstudiantes);
		dispatcher.forward(request, response);
		}catch(SQLException e)
		{
		 e.printStackTrace();
		}

	}
	private void consultaProfesor(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
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
	private void consultaMateria(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException{
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
	private void consultaEstudianteSemestre(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException{
		try {
		Integer count = estudianteDAO.contarSemestre(request.getParameter("semestre"));
		RequestDispatcher dispatcher = request.getRequestDispatcher("/ConsultaEstudianteSemestre.jsp");
		request.setAttribute("count", count);
		request.setAttribute("semestre", request.getParameter("semestre"));
		dispatcher.forward(request, response);
		}catch(SQLException e) {
			e.printStackTrace();
		}
	}
	private void consultaProfesorEscuela(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException{
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
	private void contarprimos(HttpServletRequest request, HttpServletResponse response) {
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
	private void insertaryeliminar(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {

				int id = Integer.parseInt(request.getParameter("id"));
				Random aleatorio = new Random();
				int intAleatorio = aleatorio.nextInt(1000);

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
					
				}catch(Exception e){
					e.printStackTrace();
				}
				finally {
					try{
						int count = 0;
						RequestDispatcher dispatcher = request.getRequestDispatcher("/Insertar.jsp");
						count = count + estudianteDAO.eliminar(id) + profesorDAO.eliminar(id)+ materiaDAO.eliminar(id);
						if(count == 3) {
						dispatcher.forward(request, response);
						}
						}catch(Exception e) {
							e.printStackTrace();
						}
				}
	}

}
