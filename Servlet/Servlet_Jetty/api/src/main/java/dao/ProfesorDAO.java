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
import model.Profesor;



public class ProfesorDAO {
	private DataSource ds;

	public ProfesorDAO() throws SQLException {
		try {
			InitialContext envContext = new InitialContext();
		    this.ds = (DataSource)envContext.lookup("java:/comp/env/jdbc/ConexionDB");
		}catch(NamingException e) {
			e.printStackTrace();
		}
	}

	public void insertar(Profesor profesor) throws SQLException {
		try(Connection conn = ds.getConnection()) {
			String query = "INSERT INTO profesor (id_prof, primer_nombre_prof, segundo_nombre_prof, primer_apellido_prof, segundo_apellido_prof, escuela_prof, fecha_incorporacion_prof) VALUES (?,?,?,?,?,?,?)";
			try(PreparedStatement statement = conn.prepareStatement(query)){
				statement.setString(1, profesor.getId_prof());
				statement.setString(2, profesor.getPrimer_nombre_prof());
				statement.setString(3, profesor.getSegundo_nombre_prof());
				statement.setString(4, profesor.getPrimer_apellido_prof());
				statement.setString(5, profesor.getSegundo_apellido_prof());
				statement.setString(6, profesor.getEscuela_prof());
				statement.setString(7, profesor.getFecha_incorporacion_prof());
				statement.executeUpdate();
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}

	}
	public List<Profesor> listarProfesores() throws SQLException {

		List<Profesor> listaProfesores = new ArrayList<Profesor>();
		try(Connection conn = ds.getConnection()){
			String sql = "SELECT * FROM profesorC";
			Statement statement = conn.createStatement();
			ResultSet resulSet = statement.executeQuery(sql);
			while (resulSet.next()) {
				String id_prof = resulSet.getString("id_prof");
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

		}catch(SQLException e) {
			e.printStackTrace();
		}

		return listaProfesores;
	}


    public void eliminar(String id) throws SQLException {
    	int result = 0;
		try(Connection conn = ds.getConnection()) {
			String sql = "DELETE FROM profesor WHERE id_prof = ?";
			try(PreparedStatement statement = conn.prepareStatement(sql)){
				statement.setString(1, id);
				result = statement.executeUpdate();
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}
	}
    public int contarEscuela(String escuela) throws SQLException {

		int numberOfRows=0;
		try(Connection conn = ds.getConnection()){
			String sql = "SELECT COUNT(*)  FROM profesorC WHERE escuela_prof = ?";
			try(PreparedStatement statement = conn.prepareStatement(sql)){
				statement.setString(1, escuela);
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
			}
		}catch(SQLException e) {
			e.printStackTrace();
		}

		return numberOfRows;

	}

}
