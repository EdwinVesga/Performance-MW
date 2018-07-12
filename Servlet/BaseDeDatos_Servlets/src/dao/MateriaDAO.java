package dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import model.Materia;
import model.Conexion;


public class MateriaDAO {
	private Conexion con;
	private Connection connection;
	
	public MateriaDAO(String jdbcURL, String jdbcUsername, String jdbcPassword) throws SQLException {
		con = new Conexion(jdbcURL, jdbcUsername, jdbcPassword);
	}
	
	public void insertar(Materia materia) throws SQLException {

		String query = "INSERT INTO materia (id_materia, nombre_materia, salon_materia, horario_materia) VALUES (?,?,?,?)";
		PreparedStatement statement = null;
		try {
			con.conectar();
			connection = con.getJdbcConnection();
			statement = connection.prepareStatement(query);
			statement.setInt(1, materia.getId_materia());
			statement.setString(2, materia.getNombre_materia());
			statement.setString(3, materia.getSalon_materia());
			statement.setString(4, materia.getHorario_materia());
			
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
	public List<Materia> listarMaterias() throws SQLException {

		List<Materia> listaMaterias = new ArrayList<Materia>();
		String sql = "SELECT * FROM materia";
		con.conectar();
		connection = con.getJdbcConnection();
		Statement statement = connection.createStatement();
		ResultSet resulSet = statement.executeQuery(sql);

		while (resulSet.next()) {
			int id_materia = resulSet.getInt("id_materia");
			String nombre_materia = resulSet.getString("nombre_materia");
			String salon_materia = resulSet.getString("salon_materia");
			String horario_materia = resulSet.getString("horario_materia");
			Materia materia = new Materia(id_materia, nombre_materia, salon_materia, horario_materia);
			listaMaterias.add(materia);
		}
		con.desconectar();
		return listaMaterias;
	}

	public void actualizar(Materia materia) throws SQLException {
		String sql = "UPDATE materia SET nombre_materia = ?, salon_materia = ?, horario_materia = ? WHERE id_materia = ?";
		con.conectar();
		connection = con.getJdbcConnection();
		PreparedStatement statement = connection.prepareStatement(sql);
		statement.setString(1, materia.getNombre_materia());
		statement.setString(2, materia.getSalon_materia());
		statement.setString(3, materia.getHorario_materia());
		statement.setInt(4, materia.getId_materia());
		
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
			String sql = "DELETE FROM materia WHERE id_materia = ?";
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
	
}
