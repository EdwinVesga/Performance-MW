package dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import javax.naming.Context;
import javax.naming.InitialContext;
import javax.naming.NamingException;
import javax.sql.DataSource;
import model.Materia;

import java.io.*;

import java.util.Properties;
import java.util.Enumeration;
import java.sql.DriverManager;

public class MateriaDAO {

	private DataSource ds;

	public MateriaDAO() throws SQLException {
		try {
			Context envContext = new InitialContext();
				this.ds = (DataSource)envContext.lookup("java:/comp/env/jdbc/ConexionDB");
		}catch(NamingException e) {
			e.printStackTrace();
		}

	}


	public void insertar(Materia materia) throws SQLException {

		try(Connection conn = ds.getConnection()) {
			String query = "INSERT INTO materia (id_materia, nombre_materia, salon_materia, horario_materia) VALUES (?,?,?,?)";
			try(PreparedStatement statement = conn.prepareStatement(query)){
				statement.setString(1, materia.getId_materia());
				statement.setString(2, materia.getNombre_materia());
				statement.setString(3, materia.getSalon_materia());
				statement.setString(4, materia.getHorario_materia());
				statement.executeUpdate();
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}
	}
	public List<Materia> listarMaterias() throws SQLException {

		List<Materia> listaMaterias = new ArrayList<Materia>();
		try(Connection conn = ds.getConnection()) {
			String sql = "SELECT * FROM materiaC";
			Statement statement = conn.createStatement();
			ResultSet resulSet = statement.executeQuery(sql);
			while (resulSet.next()) {
				String id_materia = resulSet.getString("id_materia");
				String nombre_materia = resulSet.getString("nombre_materia");
				String salon_materia = resulSet.getString("salon_materia");
				String horario_materia = resulSet.getString("horario_materia");
				Materia materia = new Materia(id_materia, nombre_materia, salon_materia, horario_materia);
				listaMaterias.add(materia);
			}
		}catch(SQLException e) {
			e.printStackTrace();
		}
		return listaMaterias;
	}


	public Integer eliminar(String id) throws SQLException {
		int result = 0;
		try(Connection conn = ds.getConnection()) {
			String sql = "DELETE FROM materia WHERE id_materia = ?";
			try(PreparedStatement statement = conn.prepareStatement(sql)){
				statement.setString(1, id);
				result = statement.executeUpdate();
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}
		return result;
	}

}
