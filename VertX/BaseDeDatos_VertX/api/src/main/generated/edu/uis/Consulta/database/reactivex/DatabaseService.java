/*
 * Copyright 2014 Red Hat, Inc.
 *
 * Red Hat licenses this file to you under the Apache License, version 2.0
 * (the "License"); you may not use this file except in compliance with the
 * License.  You may obtain a copy of the License at:
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

package edu.uis.Consulta.database.reactivex;

import java.util.Map;
import io.reactivex.Observable;
import io.reactivex.Flowable;
import io.reactivex.Single;
import io.reactivex.Completable;
import io.reactivex.Maybe;
import java.util.List;
import io.vertx.ext.sql.UpdateResult;
import io.vertx.core.json.JsonObject;
import io.vertx.core.AsyncResult;
import io.vertx.core.Handler;


@io.vertx.lang.rx.RxGen(edu.uis.Consulta.database.DatabaseService.class)
public class DatabaseService {

  @Override
  public String toString() {
    return delegate.toString();
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (o == null || getClass() != o.getClass()) return false;
    DatabaseService that = (DatabaseService) o;
    return delegate.equals(that.delegate);
  }
  
  @Override
  public int hashCode() {
    return delegate.hashCode();
  }

  public static final io.vertx.lang.rx.TypeArg<DatabaseService> __TYPE_ARG = new io.vertx.lang.rx.TypeArg<>(    obj -> new DatabaseService((edu.uis.Consulta.database.DatabaseService) obj),
    DatabaseService::getDelegate
  );

  private final edu.uis.Consulta.database.DatabaseService delegate;
  
  public DatabaseService(edu.uis.Consulta.database.DatabaseService delegate) {
    this.delegate = delegate;
  }

  public edu.uis.Consulta.database.DatabaseService getDelegate() {
    return delegate;
  }

  public edu.uis.Consulta.database.reactivex.DatabaseService insertarEstudiante(String id, int intAleatorio, Handler<AsyncResult<UpdateResult>> resultHandler) { 
    delegate.insertarEstudiante(id, intAleatorio, resultHandler);
    return this;
  }

  public Single<UpdateResult> rxInsertarEstudiante(String id, int intAleatorio) { 
    return io.vertx.reactivex.impl.AsyncResultSingle.toSingle(handler -> {
      insertarEstudiante(id, intAleatorio, handler);
    });
  }

  public edu.uis.Consulta.database.reactivex.DatabaseService insertarProfesor(String id, int intAleatorio, Handler<AsyncResult<UpdateResult>> resultHandler) { 
    delegate.insertarProfesor(id, intAleatorio, resultHandler);
    return this;
  }

  public Single<UpdateResult> rxInsertarProfesor(String id, int intAleatorio) { 
    return io.vertx.reactivex.impl.AsyncResultSingle.toSingle(handler -> {
      insertarProfesor(id, intAleatorio, handler);
    });
  }

  public edu.uis.Consulta.database.reactivex.DatabaseService insertarMateria(String id, int intAleatorio, Handler<AsyncResult<UpdateResult>> resultHandler) { 
    delegate.insertarMateria(id, intAleatorio, resultHandler);
    return this;
  }

  public Single<UpdateResult> rxInsertarMateria(String id, int intAleatorio) { 
    return io.vertx.reactivex.impl.AsyncResultSingle.toSingle(handler -> {
      insertarMateria(id, intAleatorio, handler);
    });
  }

  public edu.uis.Consulta.database.reactivex.DatabaseService EliminarEstudiante(String id, Handler<AsyncResult<UpdateResult>> resultHandler) { 
    delegate.EliminarEstudiante(id, resultHandler);
    return this;
  }

  public Single<UpdateResult> rxEliminarEstudiante(String id) { 
    return io.vertx.reactivex.impl.AsyncResultSingle.toSingle(handler -> {
      EliminarEstudiante(id, handler);
    });
  }

  public edu.uis.Consulta.database.reactivex.DatabaseService EliminarProfesor(String id, Handler<AsyncResult<UpdateResult>> resultHandler) { 
    delegate.EliminarProfesor(id, resultHandler);
    return this;
  }

  public Single<UpdateResult> rxEliminarProfesor(String id) { 
    return io.vertx.reactivex.impl.AsyncResultSingle.toSingle(handler -> {
      EliminarProfesor(id, handler);
    });
  }

  public edu.uis.Consulta.database.reactivex.DatabaseService EliminarMateria(String id, Handler<AsyncResult<UpdateResult>> resultHandler) { 
    delegate.EliminarMateria(id, resultHandler);
    return this;
  }

  public Single<UpdateResult> rxEliminarMateria(String id) { 
    return io.vertx.reactivex.impl.AsyncResultSingle.toSingle(handler -> {
      EliminarMateria(id, handler);
    });
  }

  public edu.uis.Consulta.database.reactivex.DatabaseService contarSemestreA(int intAleatorio, Handler<AsyncResult<Integer>> resultHandler) { 
    delegate.contarSemestreA(intAleatorio, resultHandler);
    return this;
  }

  public Single<Integer> rxContarSemestreA(int intAleatorio) { 
    return io.vertx.reactivex.impl.AsyncResultSingle.toSingle(handler -> {
      contarSemestreA(intAleatorio, handler);
    });
  }

  public edu.uis.Consulta.database.reactivex.DatabaseService contarSemestreB(int intAleatorio, Handler<AsyncResult<Integer>> resultHandler) { 
    delegate.contarSemestreB(intAleatorio, resultHandler);
    return this;
  }

  public Single<Integer> rxContarSemestreB(int intAleatorio) { 
    return io.vertx.reactivex.impl.AsyncResultSingle.toSingle(handler -> {
      contarSemestreB(intAleatorio, handler);
    });
  }

  public edu.uis.Consulta.database.reactivex.DatabaseService contarSemestreC(int intAleatorio, Handler<AsyncResult<Integer>> resultHandler) { 
    delegate.contarSemestreC(intAleatorio, resultHandler);
    return this;
  }

  public Single<Integer> rxContarSemestreC(int intAleatorio) { 
    return io.vertx.reactivex.impl.AsyncResultSingle.toSingle(handler -> {
      contarSemestreC(intAleatorio, handler);
    });
  }

  public edu.uis.Consulta.database.reactivex.DatabaseService consultarEstudiante(Handler<AsyncResult<List<JsonObject>>> resultHandler) { 
    delegate.consultarEstudiante(resultHandler);
    return this;
  }

  public Single<List<JsonObject>> rxConsultarEstudiante() { 
    return io.vertx.reactivex.impl.AsyncResultSingle.toSingle(handler -> {
      consultarEstudiante(handler);
    });
  }

  public edu.uis.Consulta.database.reactivex.DatabaseService consultarProfesor(Handler<AsyncResult<List<JsonObject>>> resultHandler) { 
    delegate.consultarProfesor(resultHandler);
    return this;
  }

  public Single<List<JsonObject>> rxConsultarProfesor() { 
    return io.vertx.reactivex.impl.AsyncResultSingle.toSingle(handler -> {
      consultarProfesor(handler);
    });
  }

  public edu.uis.Consulta.database.reactivex.DatabaseService consultarMateria(Handler<AsyncResult<List<JsonObject>>> resultHandler) { 
    delegate.consultarMateria(resultHandler);
    return this;
  }

  public Single<List<JsonObject>> rxConsultarMateria() { 
    return io.vertx.reactivex.impl.AsyncResultSingle.toSingle(handler -> {
      consultarMateria(handler);
    });
  }


  public static  DatabaseService newInstance(edu.uis.Consulta.database.DatabaseService arg) {
    return arg != null ? new DatabaseService(arg) : null;
  }
}
