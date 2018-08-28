package model;

public class Profesor {
	String id_prof;
	String primer_nombre_prof;
 	String segundo_nombre_prof;
 	String primer_apellido_prof;
 	String segundo_apellido_prof;
 	String escuela_prof;
 	String fecha_incorporacion_prof;


	public Profesor(String id_prof, String primer_nombre_prof, String segundo_nombre_prof, String primer_apellido_prof,
			String segundo_apellido_prof, String escuela_prof, String fecha_incorporacion_prof) {
		super();
		this.id_prof = id_prof;
		this.primer_nombre_prof = primer_nombre_prof;
		this.segundo_nombre_prof = segundo_nombre_prof;
		this.primer_apellido_prof = primer_apellido_prof;
		this.segundo_apellido_prof = segundo_apellido_prof;
		this.escuela_prof = escuela_prof;
		this.fecha_incorporacion_prof = fecha_incorporacion_prof;
	}

	@Override
	public String toString() {
		return "Profesor [id_prof=" + id_prof + ", primer_nombre_prof=" + primer_nombre_prof + ", segundo_nombre_prof="
				+ segundo_nombre_prof + ", primer_apellido_prof=" + primer_apellido_prof + ", segundo_apellido_prof="
				+ segundo_apellido_prof + ", escuela_prof=" + escuela_prof + ", fecha_incorporacion_prof="
				+ fecha_incorporacion_prof + "]";
	}

	public String getId_prof() {
		return id_prof;
	}
	public void setId_prof(String id_prof) {
		this.id_prof = id_prof;
	}
	public String getPrimer_nombre_prof() {
		return primer_nombre_prof;
	}
	public void setPrimer_nombre_prof(String primer_nombre_prof) {
		this.primer_nombre_prof = primer_nombre_prof;
	}
	public String getSegundo_nombre_prof() {
		return segundo_nombre_prof;
	}
	public void setSegundo_nombre_prof(String segundo_nombre_prof) {
		this.segundo_nombre_prof = segundo_nombre_prof;
	}
	public String getPrimer_apellido_prof() {
		return primer_apellido_prof;
	}
	public void setPrimer_apellido_prof(String primer_apellido_prof) {
		this.primer_apellido_prof = primer_apellido_prof;
	}
	public String getSegundo_apellido_prof() {
		return segundo_apellido_prof;
	}
	public void setSegundo_apellido_prof(String segundo_apellido_prof) {
		this.segundo_apellido_prof = segundo_apellido_prof;
	}
	public String getEscuela_prof() {
		return escuela_prof;
	}
	public void setEscuela_prof(String escuela_prof) {
		this.escuela_prof = escuela_prof;
	}
	public String getFecha_incorporacion_prof() {
		return fecha_incorporacion_prof;
	}
	public void setFecha_incorporacion_prof(String fecha_incorporacion_prof) {
		this.fecha_incorporacion_prof = fecha_incorporacion_prof;
	}

}
