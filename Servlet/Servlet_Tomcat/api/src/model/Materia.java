package model;

public class Materia {
	String id_materia;
	String nombre_materia;
	String salon_materia;
	String horario_materia;
	
	public Materia(String id_materia, String nombre_materia, String salon_materia, String horario_materia) {
		super();
		this.id_materia = id_materia;
		this.nombre_materia = nombre_materia;
		this.salon_materia = salon_materia;
		this.horario_materia = horario_materia;
	}
	
	@Override
	public String toString() {
		return "Materia [id_materia=" + id_materia + ", nombre_materia=" + nombre_materia + ", salon_materia="
				+ salon_materia + ", horario_materia=" + horario_materia + "]";
	}


	public String getId_materia() {
		return id_materia;
	}
	public void setId_materia(String id_materia) {
		this.id_materia = id_materia;
	}
	public String getNombre_materia() {
		return nombre_materia;
	}
	public void setNombre_materia(String nombre_materia) {
		this.nombre_materia = nombre_materia;
	}
	public String getSalon_materia() {
		return salon_materia;
	}
	public void setSalon_materia(String salon_materia) {
		this.salon_materia = salon_materia;
	}
	public String getHorario_materia() {
		return horario_materia;
	}
	public void setHorario_materia(String horario_materia) {
		this.horario_materia = horario_materia;
	}
	
}
