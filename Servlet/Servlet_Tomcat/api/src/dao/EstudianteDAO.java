package dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import model.Estudiante;
import javax.naming.Context;
import javax.naming.InitialContext;
import javax.naming.NamingException;
import javax.sql.DataSource;

public class EstudianteDAO {

	private DataSource ds;
	public EstudianteDAO() throws SQLException {
		try {
			Context envContext = new InitialContext();
		    this.ds = (DataSource)envContext.lookup("java:/comp/env/jdbc/ConexionDB");
		}catch(NamingException e) {
			e.printStackTrace();
		}
		
	}

	public void insertar(Estudiante estudiante) throws SQLException {

		try(Connection conn = ds.getConnection()) {
			String query = "INSERT INTO estudiante (id_est, primer_nombre_est, segundo_nombre_est, primer_apellido_est, segundo_apellido_est, semestre_est, fecha_ingreso_est) VALUES (?,?,?,?,?,?,?)";
			try(PreparedStatement statement = conn.prepareStatement(query)){
				statement.setInt(1, estudiante.getId());
				statement.setString(2, estudiante.getPrimerNombre());
				statement.setString(3, estudiante.getSegundoNombre());
				statement.setString(4, estudiante.getPrimerApellido());
				statement.setString(5, estudiante.getSegundoApellido());
				statement.setInt(6, estudiante.getSemestre());
				statement.setString(7, estudiante.getFechaIngreso());
				statement.executeUpdate();
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}
	}

	public List<Estudiante> listarEstudiantes() throws SQLException {
		List<Estudiante> listaEstudiantes = new ArrayList<Estudiante>();
		try(Connection conn = ds.getConnection()){
			String sql = "SELECT * FROM estudianteC";
			Statement statement = conn.createStatement();
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
			
		}catch(SQLException e) {
			e.printStackTrace();
		}
		return listaEstudiantes;
	}

	public Integer eliminar(Integer id) throws SQLException {
		int result=0;
		try(Connection conn = ds.getConnection()) {
			String sql = "DELETE FROM estudiante WHERE id_est = ?";
			try(PreparedStatement statement = conn.prepareStatement(sql)){
				statement.setInt(1, id);
				result = statement.executeUpdate();
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}
		return result;
	}

	public int contarSemestre(String semestre) throws SQLException {
		int numberOfRows=0;
			try(Connection conn = ds.getConnection()){
				String sql = "SELECT COUNT(*)  FROM estudianteC WHERE semestre_est = ?";
				try(PreparedStatement statement = conn.prepareStatement(sql)){
					statement.setInt(1, Integer.parseInt(semestre));
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
