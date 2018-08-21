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

	private String jdbc;
	private String username;
	private String password;
	private String className;

	public MateriaDAO() throws SQLException {
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

	public void insertar(Materia materia) throws SQLException {

		Connection conn = null;
    try {
        conn = DriverManager.getConnection(jdbc, username, password);
			String query = "INSERT INTO materia (id_materia, nombre_materia, salon_materia, horario_materia) VALUES (?,?,?,?)";
			try(PreparedStatement statement = conn.prepareStatement(query)){
				statement.setInt(1, materia.getId_materia());
				statement.setString(2, materia.getNombre_materia());
				statement.setString(3, materia.getSalon_materia());
				statement.setString(4, materia.getHorario_materia());
				statement.executeUpdate();
				statement.close();
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}
		conn.close();
	}
	public List<Materia> listarMaterias() throws SQLException {

		List<Materia> listaMaterias = new ArrayList<Materia>();
		Connection conn = null;
    try {
        conn = DriverManager.getConnection(jdbc, username, password);
			String sql = "SELECT * FROM materiaC";
			Statement statement = conn.createStatement();
			ResultSet resulSet = statement.executeQuery(sql);
			while (resulSet.next()) {
				int id_materia = resulSet.getInt("id_materia");
				String nombre_materia = resulSet.getString("nombre_materia");
				String salon_materia = resulSet.getString("salon_materia");
				String horario_materia = resulSet.getString("horario_materia");
				Materia materia = new Materia(id_materia, nombre_materia, salon_materia, horario_materia);
				listaMaterias.add(materia);
			}
			statement.close();
		}catch(SQLException e) {
			e.printStackTrace();
		}
		conn.close();
		return listaMaterias;
	}


	public Integer eliminar(Integer id) throws SQLException {
		int result = 0;
		Connection conn = null;
    try {
        conn = DriverManager.getConnection(jdbc, username, password);
			String sql = "DELETE FROM materia WHERE id_materia = ?";
			try(PreparedStatement statement = conn.prepareStatement(sql)){
				statement.setInt(1, id);
				result = statement.executeUpdate();
				statement.close();
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}
		conn.close();
		return result;
	}

}
