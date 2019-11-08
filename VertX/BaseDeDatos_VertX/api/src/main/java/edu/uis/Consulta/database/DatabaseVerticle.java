package edu.uis.Consulta.database;

import io.vertx.reactivex.core.AbstractVerticle;
import io.vertx.core.json.JsonObject;
import io.vertx.reactivex.ext.asyncsql.MySQLClient;
import io.vertx.reactivex.ext.sql.SQLClient;
import io.vertx.serviceproxy.ServiceBinder;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Properties;

public class DatabaseVerticle extends AbstractVerticle {

	public static final String CONFIG_DB_JDBC_MAX_POOL_SIZE = "db.jdbc.maxPoolSize";
	public static final String CONFIG_DB_SQL_QUERIES_RESOURCE_FILE = "db.sqlqueries.resource.file";
	public static final String CONFIG_DB_QUEUE = "db.queue";

	@Override
	public void start() throws Exception {
		 HashMap<SqlQuery, String> sqlQueries = loadSqlQueries();

		 SQLClient dbClient = MySQLClient.createShared(vertx, new JsonObject()
				 .put("host","db")
				 .put("post","3306")
				 .put("maxPoolSize",config().getInteger(CONFIG_DB_JDBC_MAX_POOL_SIZE,800))
				 .put("username", "performance")
				 .put("password", "123456")
				 .put("database", "universidad")
				 .put("charset","UTF-8"));

		 DatabaseService service = DatabaseService.create(dbClient, sqlQueries);
		 ServiceBinder binder = new ServiceBinder(vertx.getDelegate());
	        binder.setAddress(CONFIG_DB_QUEUE).register(DatabaseService.class, service);
	}

	 private HashMap<SqlQuery, String> loadSqlQueries() throws IOException {
		 String queriesFile = config().getString(CONFIG_DB_SQL_QUERIES_RESOURCE_FILE);

		    InputStream queriesInputStream;
		    if (queriesFile != null) {
		      queriesInputStream = new FileInputStream(queriesFile);
		    } else {
		      queriesInputStream = getClass().getResourceAsStream("/db-queries.properties");
		    }

		    Properties queriesProps = new Properties();
		    queriesProps.load(queriesInputStream);
		    queriesInputStream.close();

		    HashMap<SqlQuery, String> sqlQueries = new HashMap<>();
		    sqlQueries.put(SqlQuery.INSERT_EST, queriesProps.getProperty("insert-est"));
		    sqlQueries.put(SqlQuery.INSERT_PROF, queriesProps.getProperty("insert-prof"));
		    sqlQueries.put(SqlQuery.INSERT_MAT, queriesProps.getProperty("insert-mat"));
		    sqlQueries.put(SqlQuery.COUNT_TABLE_A, queriesProps.getProperty("count-table-a"));
		    sqlQueries.put(SqlQuery.COUNT_TABLE_B, queriesProps.getProperty("count-table-b"));
		    sqlQueries.put(SqlQuery.COUNT_TABLE_C, queriesProps.getProperty("count-table-c"));
		    sqlQueries.put(SqlQuery.DELETE_EST, queriesProps.getProperty("delete-est"));
		    sqlQueries.put(SqlQuery.DELETE_PROF, queriesProps.getProperty("delete-prof"));
		    sqlQueries.put(SqlQuery.DELETE_MAT, queriesProps.getProperty("delete-mat"));
		    sqlQueries.put(SqlQuery.CONSULT_EST , queriesProps.getProperty("consult-est"));
		    sqlQueries.put(SqlQuery.CONSULT_PROF, queriesProps.getProperty("consult-prof"));
		    sqlQueries.put(SqlQuery.CONSULT_MAT, queriesProps.getProperty("consult-mat"));
		return sqlQueries;
	 }
}
