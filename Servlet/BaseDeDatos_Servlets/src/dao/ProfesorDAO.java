package dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import model.Profesor;
import model.Conexion;


public class ProfesorDAO {
	private Conexion con;
	private Connection connection;
	
	public ProfesorDAO(String jdbcURL, String jdbcUsername, String jdbcPassword) throws SQLException {
		con = new Conexion(jdbcURL, jdbcUsername, jdbcPassword);
	}
	
	public void insertar(Profesor profesor) throws SQLException {

		String query = "INSERT INTO profesor (id_prof, primer_nombre_prof, segundo_nombre_prof, primer_apellido_prof, segundo_apellido_prof, escuela_prof, fecha_incorporacion_prof) VALUES (?,?,?,?,?,?,?)";
		PreparedStatement statement = null;
		try {
			con.conectar();
			connection = con.getJdbcConnection();
			statement = connection.prepareStatement(query);
			statement.setInt(1, profesor.getId_prof());
			statement.setString(2, profesor.getPrimer_nombre_prof());
			statement.setString(3, profesor.getSegundo_nombre_prof());
			statement.setString(4, profesor.getPrimer_apellido_prof());
			statement.setString(5, profesor.getSegundo_apellido_prof());
			statement.setString(6, profesor.getEscuela_prof());
			statement.setString(7, profesor.getFecha_incorporacion_prof());
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
	public List<Profesor> listarProfesores() throws SQLException {

		List<Profesor> listaProfesores = new ArrayList<Profesor>();
		String sql = "SELECT * FROM profesor";
		con.conectar();
		connection = con.getJdbcConnection();
		Statement statement = connection.createStatement();
		ResultSet resulSet = statement.executeQuery(sql);

		while (resulSet.next()) {
			int id_prof = resulSet.getInt("id_prof");
			String primer_nombre_prof = resulSet.getString("primer_nombre_prof");
			String segundo_nombre_prof = resulSet.getString("segundo_nombre_prof");
			String primer_apellido_prof = resulSet.getString("primer_apellido_prof");
			String segundo_apellido_prof = resulSet.getString("segundo_apellido_prof");
			String escuela_prof = resulSet.getString("escuela_prof");
			String fecha_incorporacion_prof = resulSet.getString("fecha_incorporacion_prof");
			Profesor profesor = new Profesor(id_prof, primer_nombre_prof, segundo_nombre_prof, primer_apellido_prof,
					segundo_apellido_prof, escuela_prof, fecha_incorporacion_prof);
			listaProfesores.add(profesor);
		}
		con.desconectar();
		return listaProfesores;
	}

	public void actualizar(Profesor profesor) throws SQLException {
		String sql = "UPDATE profesor SET primer_nombre_prof = ?,segundo_nombre_prof = ?,primer_apellido_prof = ?, segundo_apellido_prof = ? WHERE id_prof = ?";
		con.conectar();
		connection = con.getJdbcConnection();
		PreparedStatement statement = connection.prepareStatement(sql);
		statement.setString(1, profesor.getPrimer_nombre_prof());
		statement.setString(2, profesor.getSegundo_nombre_prof());
		statement.setString(3, profesor.getPrimer_apellido_prof());
		statement.setString(4, profesor.getSegundo_apellido_prof());
		statement.setInt(5, profesor.getId_prof());
		
		
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
    public void eliminar(Integer id) throws SQLException {
		
		PreparedStatement statement = null;
		
		// Execute Query
		try {
			String sql = "DELETE FROM profesor WHERE id_est = ?";
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
    public int contarEscuela(String escuela) throws SQLException {
		PreparedStatement statement = null;
		int numberOfRows=0;
		try {
			String sql = "SELECT COUNT(*)  FROM profesor WHERE escuela_prof = ?";
			con.conectar();
			connection = con.getJdbcConnection();
			statement = connection.prepareStatement(sql);
			statement.setString(1, escuela);
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
