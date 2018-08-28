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

import java.io.*;

import java.util.Properties;
import java.util.Enumeration;
import java.sql.DriverManager;

public class EstudianteDAO {

private String jdbc;
private String username;
private String password;
private String className;

	public EstudianteDAO() throws SQLException {

		Properties prop = new Properties();
    InputStream in = getClass().getResourceAsStream("/application.properties");
    if ( in == null ) {
        System.out.println("Missing application.properties in the war.");
    } else {
			try{
				prop.load(in);
				in.close();
			}catch(IOException e){
				e.printStackTrace();
			}

    }

		jdbc = prop.getProperty("universidad.datasource.url");
		username = prop.getProperty("universidad.datasource.username");
		password = prop.getProperty("universidad.datasource.password");
		className = prop.getProperty("universidad.datasource.driverClassName");


    try {
        Class.forName(className);
    } catch (ClassNotFoundException e) {
        System.out.println("Falta el Driver JDBC: "+className);
        e.printStackTrace();
        return;
    }

	}

	public void insertar(Estudiante estudiante) throws SQLException {

		Connection conn = null;
    try {
        conn = DriverManager.getConnection(jdbc, username, password);
			String query = "INSERT INTO estudiante (id_est, primer_nombre_est, segundo_nombre_est, primer_apellido_est, segundo_apellido_est, semestre_est, fecha_ingreso_est) VALUES (?,?,?,?,?,?,?)";
			try(PreparedStatement statement = conn.prepareStatement(query)){
				statement.setString(1, estudiante.getId());
				statement.setString(2, estudiante.getPrimerNombre());
				statement.setString(3, estudiante.getSegundoNombre());
				statement.setString(4, estudiante.getPrimerApellido());
				statement.setString(5, estudiante.getSegundoApellido());
				statement.setInt(6, estudiante.getSemestre());
				statement.setString(7, estudiante.getFechaIngreso());
				statement.executeUpdate();
				statement.close();
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}

		conn.close();
	}

	public void insertarA(Estudiante estudiante) throws SQLException {

		Connection conn = null;
    try {
        conn = DriverManager.getConnection(jdbc, username, password);
			String query = "INSERT INTO estudianteA (id_est, primer_nombre_est, segundo_nombre_est, primer_apellido_est, segundo_apellido_est, semestre_est, fecha_ingreso_est) VALUES (?,?,?,?,?,?,?)";
			try(PreparedStatement statement = conn.prepareStatement(query)){
				statement.setString(1, estudiante.getId());
				statement.setString(2, estudiante.getPrimerNombre());
				statement.setString(3, estudiante.getSegundoNombre());
				statement.setString(4, estudiante.getPrimerApellido());
				statement.setString(5, estudiante.getSegundoApellido());
				statement.setInt(6, estudiante.getSemestre());
				statement.setString(7, estudiante.getFechaIngreso());
				statement.executeUpdate();
				statement.close();
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}

		conn.close();
	}

	public void insertarB(Estudiante estudiante) throws SQLException {

		Connection conn = null;
    try {
        conn = DriverManager.getConnection(jdbc, username, password);
			String query = "INSERT INTO estudianteB (id_est, primer_nombre_est, segundo_nombre_est, primer_apellido_est, segundo_apellido_est, semestre_est, fecha_ingreso_est) VALUES (?,?,?,?,?,?,?)";
			try(PreparedStatement statement = conn.prepareStatement(query)){
				statement.setString(1, estudiante.getId());
				statement.setString(2, estudiante.getPrimerNombre());
				statement.setString(3, estudiante.getSegundoNombre());
				statement.setString(4, estudiante.getPrimerApellido());
				statement.setString(5, estudiante.getSegundoApellido());
				statement.setInt(6, estudiante.getSemestre());
				statement.setString(7, estudiante.getFechaIngreso());
				statement.executeUpdate();
				statement.close();
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}

		conn.close();
	}

	public void insertarC(Estudiante estudiante) throws SQLException {

		Connection conn = null;
    try {
        conn = DriverManager.getConnection(jdbc, username, password);
			String query = "INSERT INTO estudianteC (id_est, primer_nombre_est, segundo_nombre_est, primer_apellido_est, segundo_apellido_est, semestre_est, fecha_ingreso_est) VALUES (?,?,?,?,?,?,?)";
			try(PreparedStatement statement = conn.prepareStatement(query)){
				statement.setString(1, estudiante.getId());
				statement.setString(2, estudiante.getPrimerNombre());
				statement.setString(3, estudiante.getSegundoNombre());
				statement.setString(4, estudiante.getPrimerApellido());
				statement.setString(5, estudiante.getSegundoApellido());
				statement.setInt(6, estudiante.getSemestre());
				statement.setString(7, estudiante.getFechaIngreso());
				statement.executeUpdate();
				statement.close();
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}

		conn.close();
	}

	public List<Estudiante> listarEstudiantes() throws SQLException {
		List<Estudiante> listaEstudiantes = new ArrayList<Estudiante>();
		Connection conn = null;
    try {
        conn = DriverManager.getConnection(jdbc, username, password);
			String sql = "SELECT * FROM estudianteC";
			Statement statement = conn.createStatement();
			ResultSet resulSet = statement.executeQuery(sql);
			while (resulSet.next()) {
				String id_est = resulSet.getString("id_est");
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
			statement.close();
		}catch(SQLException e) {
			e.printStackTrace();
		}
		conn.close();
		return listaEstudiantes;
	}

	public Integer eliminar(String id) throws SQLException {
		int result=0;
		Connection conn = null;
    try {
       conn = DriverManager.getConnection(jdbc, username, password);
			String sql = "DELETE FROM estudiante WHERE id_est = ?";
			try(PreparedStatement statement = conn.prepareStatement(sql)){
				statement.setString(1, id);
				result = statement.executeUpdate();
				statement.close();
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}
		conn.close();
		return result;
	}

	public int contarSemestreA(String semestre) throws SQLException {
		int numberOfRows=0;
		Connection conn = null;
		try {
				conn = DriverManager.getConnection(jdbc, username, password);
				String sql = "SELECT COUNT(*) FROM estudianteA WHERE semestre_est = ?";
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
					statement.close();
				}
			}catch(SQLException e) {
				e.printStackTrace();
			}
			conn.close();
			return numberOfRows;
	}

	public int contarSemestreB(String semestre) throws SQLException {
		int numberOfRows=0;
		Connection conn = null;
		try {
				conn = DriverManager.getConnection(jdbc, username, password);
				String sql = "SELECT COUNT(*) FROM estudianteB WHERE semestre_est = ?";
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
					statement.close();
				}
			}catch(SQLException e) {
				e.printStackTrace();
			}
			conn.close();
			return numberOfRows;
	}

	public int contarSemestreC(String semestre) throws SQLException {
		int numberOfRows=0;
		Connection conn = null;
		try {
				conn = DriverManager.getConnection(jdbc, username, password);
				String sql = "SELECT COUNT(*) FROM estudianteC WHERE semestre_est = ?";
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
					statement.close();
				}
			}catch(SQLException e) {
				e.printStackTrace();
			}
			conn.close();
			return numberOfRows;
	}

}
