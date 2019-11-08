'use strict'
var express  = require('express'),
    path     = require('path'),
    bodyParser = require('body-parser'),
    app = express(),
    expressValidator = require('express-validator');

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
var router = express.Router();

var async = require('async');
var pool = require('./database')

app.get('/',function(req,res){

	res.render(path.join(__dirname, '/views/index'));
});

//RESTful route

router.get('/ConsultaEstudiante', (req,res,next)=>{

  try {

    var query = pool.query ("SELECT * FROM estudianteC", (err, result)=>{
    if (err) throw new Error (err);
    res.render('ConsultaEstudiante',{title:"NodeJS",data:result});

    });

    } catch (err) {
      throw new Error (err);
    }

});


router.get('/ConsultaProfesor', (req,res,next)=>{

  try {

    var query = pool.query ("SELECT * FROM profesorC", (err, result)=>{
    if (err) throw new Error (err);
    res.render('ConsultaProfesor',{title:"NodeJS",data:result});

    });

    } catch (err) {
      throw new Error (err);
    }

});


router.get('/ConsultaMateria', (req,res,next)=>{

  try {

    var query = pool.query ("SELECT * FROM materiaC", (err, result)=>{
    if (err) throw new Error (err);
    res.render('ConsultaMateria',{title:"NodeJS",data:result});

    });

    } catch (err) {
      throw new Error (err);
    }

});

router.get('/ConsultaEstudianteSemestreA', (req,res,next)=>{

  let cantidadSemestre = 0;
  let intAleatorio = Math.floor(Math.random()*10)+1;
  try {
      var query = pool.query ("select * from estudianteA where semestre_est= ?", intAleatorio, (err, result)=>{
      if (err) throw new Error (err);

      cantidadSemestre=result.length;
      res.render('ConsultaEstudianteSemestre',{title:"NodeJS", semestre:intAleatorio, cantidad:cantidadSemestre});

      });
    } catch (err) {
          throw new Error (err);
    }

});

router.get('/ConsultaEstudianteSemestreB', (req,res,next)=>{

  let cantidadSemestre = 0;
  let intAleatorio = Math.floor(Math.random()*10)+1;
  try {
      var query = pool.query ("select * from estudianteB where semestre_est= ?", intAleatorio, (err, result)=>{
      if (err) throw new Error (err);

      cantidadSemestre=result.length;
      res.render('ConsultaEstudianteSemestre',{title:"NodeJS", semestre:intAleatorio, cantidad:cantidadSemestre});

      });
    } catch (err) {
          throw new Error (err);
    }

});

router.get('/ConsultaEstudianteSemestreC', (req,res,next)=>{

  let cantidadSemestre = 0;
  let intAleatorio = Math.floor(Math.random()*10)+1;
  try {
      var query = pool.query ("select * from estudianteC where semestre_est= ?", intAleatorio, (err, result)=>{
      if (err) throw new Error (err);

      cantidadSemestre=result.length;
      res.render('ConsultaEstudianteSemestre',{title:"NodeJS", semestre:intAleatorio, cantidad:cantidadSemestre});

      });
    } catch (err) {
          throw new Error (err);
    }

});

router.get('/ConsultaProfesorEscuela', (req,res,next)=>{

  let escuela_prof = req.param('escuela');

  try {

    var query = pool.query ("select count(*) from profesorC where escuela_prof= ?", escuela_prof, (err, result)=>{
    if (err) throw new Error (err);

    res.render('ConsultaProfesorEscuela',{title:"NodeJS",escuela:escuela_prof, rows:result});

    });

    } catch (err) {
      throw new Error (err);
    }

});

router.get('/Insertar1', (req,res,next)=>{

  let id1 = req.query.id;
  let intAleatorio = Math.floor(Math.random()*10)+1;

  try{
    async.parallel([
      function(callback) {
        pool.query ("INSERT INTO estudiante VALUES (?,?,?,?,?,?,'2014-04-04')", [id1, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO profesor VALUES (?,?,?,?,?,?,'2014-04-04')", [id1, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO materia VALUES (?,?,?,?)", [id1, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      }
    ], function (err) {
      if (err) throw new Error (err);
      res.render('InsertarEliminar',{title:"NodeJS"});
    });
  } catch (err) {
        throw new Error (err);
  }

});

router.get('/Insertar3', (req,res,next)=>{

  let id1 = req.query.id1;
  let id2 = req.query.id2;
  let id3 = req.query.id3;
  let intAleatorio = Math.floor(Math.random()*10)+1;

  try{
    async.parallel([
      function(callback) {
        pool.query ("INSERT INTO estudiante VALUES (?,?,?,?,?,?,'2014-04-04')", [id1, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO profesor VALUES (?,?,?,?,?,?,'2014-04-04')", [id1, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO materia VALUES (?,?,?,?)", [id1, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO estudiante VALUES (?,?,?,?,?,?,'2014-04-04')", [id2, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO profesor VALUES (?,?,?,?,?,?,'2014-04-04')", [id2, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO materia VALUES (?,?,?,?)", [id2, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO estudiante VALUES (?,?,?,?,?,?,'2014-04-04')", [id3, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO profesor VALUES (?,?,?,?,?,?,'2014-04-04')", [id3, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO materia VALUES (?,?,?,?)", [id3, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      }
    ], function (err) {
      if (err) throw new Error (err);
      res.render('InsertarEliminar',{title:"NodeJS"});
    });
  } catch (err) {
        throw new Error (err);
  }

});


router.get('/Insertar6', (req,res,next)=>{

  let id1 = req.query.id1;
  let id2 = req.query.id2;
  let id3 = req.query.id3;
  let id4 = req.query.id4;
  let id5 = req.query.id5;
  let id6 = req.query.id6;
  let intAleatorio = Math.floor(Math.random()*10)+1;

  try{
    async.parallel([
      function(callback) {
        pool.query ("INSERT INTO estudiante VALUES (?,?,?,?,?,?,'2014-04-04')", [id1, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO profesor VALUES (?,?,?,?,?,?,'2014-04-04')", [id1, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO materia VALUES (?,?,?,?)", [id1, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO estudiante VALUES (?,?,?,?,?,?,'2014-04-04')", [id2, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO profesor VALUES (?,?,?,?,?,?,'2014-04-04')", [id2, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO materia VALUES (?,?,?,?)", [id2, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO estudiante VALUES (?,?,?,?,?,?,'2014-04-04')", [id3, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO profesor VALUES (?,?,?,?,?,?,'2014-04-04')", [id3, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO materia VALUES (?,?,?,?)", [id3, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO estudiante VALUES (?,?,?,?,?,?,'2014-04-04')", [id4, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO profesor VALUES (?,?,?,?,?,?,'2014-04-04')", [id4, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO materia VALUES (?,?,?,?)", [id4, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO estudiante VALUES (?,?,?,?,?,?,'2014-04-04')", [id5, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO profesor VALUES (?,?,?,?,?,?,'2014-04-04')", [id5, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO materia VALUES (?,?,?,?)", [id5, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO estudiante VALUES (?,?,?,?,?,?,'2014-04-04')", [id6, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO profesor VALUES (?,?,?,?,?,?,'2014-04-04')", [id6, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      },
      function(callback) {
        pool.query ("INSERT INTO materia VALUES (?,?,?,?)", [id6, intAleatorio, intAleatorio, intAleatorio]);
        callback();
      }
    ], function (err) {
      if (err) throw new Error (err);
      res.render('InsertarEliminar',{title:"NodeJS"});
    });
  } catch (err) {
        throw new Error (err);
  }

});

router.get('/ContarPrimos1000', (req,res,next)=>{

            var total = 0;
            var suma = 1;
            for (let i = 0; i < 1000; i++) {
                suma = suma + 1;
                var contador = 2;
                var primo = true;
                while ((primo) && (contador!=suma)){
                  if ((suma % contador) == 0)
                    primo = false;
                  contador++;
                }
      			if(primo) total++;

            }

            res.render('ContarPrimos',{title:"NodeJS",size:total, limit:1000});

});

router.get('/ContarPrimos2000', (req,res,next)=>{

            var total = 0;
            var suma = 1;
            for (let i = 0; i < 2000; i++) {
                suma = suma + 1;
                var contador = 2;
                var primo = true;
                while ((primo) && (contador!=suma)){
                  if ((suma % contador) == 0)
                    primo = false;
                  contador++;
                }
            if(primo) total++;

            }

            res.render('ContarPrimos',{title:"NodeJS",size:total, limit:2000});

});

router.get('/ContarPrimos3000', (req,res,next)=>{

            var total = 0;
            var suma = 1;
            for (let i = 0; i < 3000; i++) {
                suma = suma + 1;
                var contador = 2;
                var primo = true;
                while ((primo) && (contador!=suma)){
                  if ((suma % contador) == 0)
                    primo = false;
                  contador++;
                }
            if(primo) total++;

            }

            res.render('ContarPrimos',{title:"NodeJS",size:total, limit:3000});

});


app.use('/', router);


var server = app.listen(4000);
