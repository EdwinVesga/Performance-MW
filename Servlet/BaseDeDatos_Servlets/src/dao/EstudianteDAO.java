package dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import model.Estudiante;
import model.Conexion;

public class EstudianteDAO {

	private Conexion con;
	private Connection connection;

	public EstudianteDAO(String jdbcURL, String jdbcUsername, String jdbcPassword) throws SQLException {
		con = new Conexion(jdbcURL, jdbcUsername, jdbcPassword);
	}

	public void insertar(Estudiante estudiante) throws SQLException {

		String query = "INSERT INTO estudiante (id_est, primer_nombre_est, segundo_nombre_est, primer_apellido_est, segundo_apellido_est, semestre_est, fecha_ingreso_est) VALUES (?,?,?,?,?,?,?)";
		PreparedStatement statement = null;
		try {
			con.conectar();
			connection = con.getJdbcConnection();
			statement = connection.prepareStatement(query);
			statement.setInt(1, estudiante.getId());
			statement.setString(2, estudiante.getPrimerNombre());
			statement.setString(3, estudiante.getSegundoNombre());
			statement.setString(4, estudiante.getPrimerApellido());
			statement.setString(5, estudiante.getSegundoApellido());
			statement.setInt(6, estudiante.getSemestre());
			statement.setString(7, estudiante.getFechaIngreso());
		} catch (SQLException e) {
			e.printStackTrace();
		}
		// Execute Query
		try {
			statement.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		}

		// close connection
		try {
			statement.close();
		} catch (SQLException e) {
			e.printStackTrace();
		}
		try {
			connection.close();
		} catch (SQLException e) {
			e.printStackTrace();
		}

	}

	// listar todos los productos
	public List<Estudiante> listarEstudiantes() throws SQLException {

		List<Estudiante> listaEstudiantes = new ArrayList<Estudiante>();
		String sql = "SELECT * FROM estudiante";
		con.conectar();
		connection = con.getJdbcConnection();
		Statement statement = connection.createStatement();
		ResultSet resulSet = statement.executeQuery(sql);

		while (resulSet.next()) {
			int id_est = resulSet.getInt("id_est");
			String primer_nombre_est = resulSet.getString("primer_nombre_est");
			String segundo_nombre_est = resulSet.getString("segundo_nombre_est");
			String primer_apellido_est = resulSet.getString("primer_apellido_est");
			String segundo_apellido_est = resulSet.getString("segundo_apellido_est");
			int semestre_est = resulSet.getInt("semestre_est");
			String fecha_ingreso_est = resulSet.getString("fecha_ingreso_est");
			Estudiante estudiante = new Estudiante(id_est, primer_nombre_est, segundo_nombre_est, primer_apellido_est,
					segundo_apellido_est, semestre_est, fecha_ingreso_est);
			listaEstudiantes.add(estudiante);
		}
		con.desconectar();
		return listaEstudiantes;
	}

	// eliminar
	public void eliminar(Integer id) throws SQLException {

		PreparedStatement statement = null;

		// Execute Query
		try {
			String sql = "DELETE FROM estudiante WHERE id_est = ?";
			con.conectar();
			connection = con.getJdbcConnection();
			statement = connection.prepareStatement(sql);
			statement.setInt(1, id);
		} catch (SQLException e) {
			e.printStackTrace();
		}

		// Execute Query
		try {
			statement.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		}
		// close connection
		try {
			statement.close();
		} catch (SQLException e) {
			e.printStackTrace();
		}
		try {
			connection.close();
		} catch (SQLException e) {
			e.printStackTrace();
		}

	}

	public int contarSemestre(String semestre) throws SQLException {
		PreparedStatement statement = null;
		int numberOfRows=0;
		try {
			String sql = "SELECT COUNT(*)  FROM estudiante WHERE semestre_est = ?";
			con.conectar();
			connection = con.getJdbcConnection();
			statement = connection.prepareStatement(sql);
			statement.setInt(1, Integer.parseInt(semestre));
		} catch (SQLException e) {
			e.printStackTrace();
		}
		try {
			ResultSet rs = statement.executeQuery();
			if (rs.next()) {
		        numberOfRows = rs.getInt(1);
		      } else {
		        System.out.println("error: could not get the record counts");
		      }
		} catch (SQLException e) {
			e.printStackTrace();
		}
		// close connection
		try {
			statement.close();
		} catch (SQLException e) {
			e.printStackTrace();
		}
		try {
			connection.close();
		} catch (SQLException e) {
			e.printStackTrace();
		}
			return numberOfRows;

	}
}
