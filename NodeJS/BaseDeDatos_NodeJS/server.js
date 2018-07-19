'use strict'
var express  = require('express'),
    path     = require('path'),
    bodyParser = require('body-parser'),
    app = express(),
    expressValidator = require('express-validator');

var format = require('pg-format');
var arraylist = require('array-list')
var crypto = require('crypto'),
    biguint = require('biguint-format');

/*Configura el motor de plantillas EJS y la ruta de las vistas*/
app.set('views','./views');
app.set('view engine','ejs');

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(expressValidator());

/*Conexión MySQL*/
var connection  = require('express-myconnection'),
    mysql = require('mysql');

app.use(

    connection(mysql,{
        host     : 'localhost',
        user     : 'root',
        password : '123456',
        database : 'universidad',
        debug    : false
    },'request')

);

app.get('/',function(req,res){

	res.render(path.join(__dirname, '/views/index'));
});



//RESTful route
var router = express.Router();


var cp = router.route('/ConsultaProfesor');


//Muestra la consulta de profesores.
cp.get(function(req,res,next){


    req.getConnection(function(err,conn){

        if (err) return next("No se puede conectar.");

        var query = conn.query('SELECT * FROM profesor',function(err,rows){

            if(err){
                console.log(err);
                return next("Mysql error, revise el query");
            }

            res.render('ConsultaProfesor',{title:"NodeJS",data:rows});

         });

    });

});

var ce = router.route('/ConsultaEstudiante');

//Muestra la consulta de estudiantes.
ce.get(function(req,res,next){


    req.getConnection(function(err,conn){

        if (err) return next("No se puede conectar.");

        var query = conn.query('SELECT * FROM estudiante',function(err,rows){

            if(err){
                console.log(err);
                return next("Mysql error, revise el query");
            }

            res.render('ConsultaEstudiante',{title:"NodeJS",data:rows});

         });

    });


});

var cm = router.route('/ConsultaMateria');

//Muestra la consulta de materias.
cm.get(function(req,res,next){


    req.getConnection(function(err,conn){

        if (err) return next("No se puede conectar.");

        var query = conn.query('SELECT * FROM materia',function(err,rows){

            if(err){
                console.log(err);
                return next("Mysql error, revise el query");
            }

            res.render('ConsultaMateria',{title:"NodeJS",data:rows});

         });

    });

});



var cce = router.route('/ConsultaEstudianteSemestre');

//Muestra la cantidad de estudiantes por semestre.
cce.get(function(req,res,next){

    var semestre_est = req.param('semestre');

    req.getConnection(function(err,conn){

        if (err) return next("No se puede conectar.");

        var query = conn.query('select count(*) AS cantidad from estudiante where semestre_est= ?',[semestre_est],function(err,rows){

            if(err){
                console.log(err);
                return next("Mysql error, revise el query");
            }


            res.render('ConsultaEstudianteSemestre',{title:"NodeJS",semestre:semestre_est,rows});

         });

    });


});


var cpe = router.route('/ConsultaProfesorEscuela');

//Muestra la cantidad de profesores por escuela.
cpe.get(function(req,res,next){

    var escuela_prof = req.param('escuela');

    req.getConnection(function(err,conn){

        if (err) return next("No se puede conectar.");

        var query = conn.query('select count(*) AS cantidad from profesor where escuela_prof= ?',[escuela_prof],function(err,rows){

            if(err){
                console.log(err);
                return next("Mysql error, revise el query");
            }


            res.render('ConsultaProfesorEscuela',{title:"NodeJS",escuela:escuela_prof,rows});

         });

    });


});

var ie = router.route('/InsertarEliminar');

//Inserta y elimina un conjunto de datos.
ie.get(function(req,res,next){

    var id = req.param('id');

    var intAleatorio = parseInt(Math.random()*1000);

    req.getConnection(function(err,conn){

        if (err) return next("No se puede conectar.");

        //INSERT
        var query1 = conn.query('INSERT INTO estudiante VALUES (?,?,?,?,?,?,"2014-04-04")',[id, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio],function(err,row1){

            if(err){
                console.log(err);
                return next("Mysql error, revise el query1");
            }

            var query2 = conn.query('INSERT INTO profesor VALUES (?,?,?,?,?,?,"2014-04-04")',[id, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio],function(err,row2){

                if(err){
                    console.log(err);
                    return next("Mysql error, revise el query2");
                }

                var query3 = conn.query('INSERT INTO materia VALUES (?,?,?,?)',[id, intAleatorio, intAleatorio, intAleatorio],function(err,row3){

                    if(err){
                        console.log(err);
                        return next("Mysql error, revise el query3");
                    }

                    //DELETE
                    var query4 = conn.query('DELETE FROM estudiante WHERE id_est = ?',[id],function(err,row4){

                        if(err){
                            console.log(err);
                            return next("Mysql error, revise el query4");
                        }

                            var query5 = conn.query('DELETE FROM profesor WHERE id_prof = ?',[id],function(err,row5){

                                if(err){
                                    console.log(err);
                                    return next("Mysql error, revise el query5");
                                }

                                      var query6 = conn.query('DELETE FROM materia WHERE id_materia = ?',[id],function(err,row6){

                                          if(err){
                                              console.log(err);
                                              return next("Mysql error, revise el query6");
                                          }

                                          res.render('InsertarEliminar',{title:"NodeJS",id:id,row1,row2,row3, row4, row5, row6});

                                          });

                                });

                        });

                    });

                });

         });

    });


});


var cpri = router.route('/ContarPrimos');

//Realiza operaciones de números primos.
cpri.get(function(req,res,next){


    req.getConnection(function(err,conn){

        if (err) return next("No se puede conectar.");

            var array = [];
            var suma = 1;
            for (var i = 0; i < 100000; i++) {
                suma = suma + 1;
                var contador = 2;
                var primo=true;
                while ((primo) && (contador!=suma)){
                  if ((suma % contador) == 0)
                    primo = false;
                  contador++;
                }
      			if(primo) array.push(suma);

            }

            res.render('ContarPrimos',{title:"NodeJS",size:array.length});

    });


});



//Se aplica el router aquí
app.use('/', router);

//Empezar servidor
var server = app.listen(3000,function(){

   console.log("Escuchando por el puerto %s",server.address().port);

});
