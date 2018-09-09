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

router.get('/ConsultaEstudiante', function(req,res,next){

  try {

    var query = pool.query ("SELECT * FROM estudianteC", function (err, result) {
    if (err) throw new Error (err);
    res.render('ConsultaEstudiante',{title:"NodeJS",data:result});

    });

    } catch (err) {
      throw new Error (err);
    }

});


router.get('/ConsultaProfesor', function(req,res,next){

  try {

    var query = pool.query ("SELECT * FROM profesorC", function (err, result) {
    if (err) throw new Error (err);
    res.render('ConsultaProfesor',{title:"NodeJS",data:result});

    });

    } catch (err) {
      throw new Error (err);
    }

});


router.get('/ConsultaMateria', function(req,res,next){

  try {

    var query = pool.query ("SELECT * FROM materiaC", function (err, result) {
    if (err) throw new Error (err);
    res.render('ConsultaMateria',{title:"NodeJS",data:result});

    });

    } catch (err) {

    }

});


router.get('/ConsultaEstudianteSemestreA', function(req,res,next){

  let semestre_est = req.param('semestre');
  try {

    var query = pool.query ("select count(*) from estudianteA where semestre_est= ?", semestre_est,  function (err, result) {
    if (err) throw new Error (err);

    res.render('ConsultaEstudianteSemestre',{title:"NodeJS",semestre:semestre_est, rows:result});

    });

    } catch (err) {
        throw new Error (err);
    }

});

router.get('/ConsultaEstudianteSemestreB', function(req,res,next){

  let semestre_est = req.param('semestre');

  try {

    var query = pool.query ("select count(*) from estudianteB where semestre_est= ?", semestre_est,  function (err, result) {
    if (err) throw new Error (err);

    res.render('ConsultaEstudianteSemestre',{title:"NodeJS",semestre:semestre_est, rows:result});

    });

    } catch (err) {
        throw new Error (err);
    }

});

router.get('/ConsultaEstudianteSemestreC', function(req,res,next){

  let semestre_est = req.param('semestre');

  try {

    var query = pool.query ("select count(*) from estudianteC where semestre_est= ?", semestre_est,  function (err, result) {
    if (err) throw new Error (err);

    res.render('ConsultaEstudianteSemestre',{title:"NodeJS",semestre:semestre_est, rows:result});

    });

    } catch (err) {
        throw new Error (err);
    }

});

router.get('/ConsultaProfesorEscuela', function(req,res,next){

  let escuela_prof = req.param('escuela');

  try {

    var query = pool.query ("select count(*) from profesorC where escuela_prof= ?", escuela_prof, function(err, result) {
    if (err) throw new Error (err);

    res.render('ConsultaProfesorEscuela',{title:"NodeJS",escuela:escuela_prof, rows:result});

    });

    } catch (err) {
      throw new Error (err);
    }

});

router.get('/Insertar1000', async function(req,res,next){

  let id = req.param('id');
  const intAleatorio = parseInt(Math.random()*1000);

  try {

    var insert1 = await pool.query ("INSERT INTO estudianteA VALUES (?,?,?,?,?,?,'2014-04-04')", [id, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);

    res.render('Insertar',{title:"NodeJS"});

  } catch (err) {
      throw new Error (err);
  }

});

router.get('/Insertar10000', async function(req,res,next){

  let id = req.param('id');
  const intAleatorio = parseInt(Math.random()*1000);

  try {

    var insert1 = await pool.query ("INSERT INTO estudianteB VALUES (?,?,?,?,?,?,'2014-04-04')", [id, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);

    res.render('Insertar',{title:"NodeJS"});

  } catch (err) {
      throw new Error (err);
  }

});

router.get('/Insertar100000', async function(req,res,next){

  let id = req.param('id');
  const intAleatorio = parseInt(Math.random()*1000);

  try {

    var insert1 = await pool.query ("INSERT INTO estudianteC VALUES (?,?,?,?,?,?,'2014-04-04')", [id, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);

    res.render('Insertar',{title:"NodeJS"});

  } catch (err) {
      throw new Error (err);
  }

});


router.get('/InsertarEliminar', async function(req,res,next){

  let id = req.param('id');
  const intAleatorio = parseInt(Math.random()*1000);

  try {

    var insert1 = await pool.query ("INSERT INTO estudiante VALUES (?,?,?,?,?,?,'2014-04-04')", [id, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
    var insert2 = await pool.query ("INSERT INTO profesor VALUES (?,?,?,?,?,?,'2014-04-04')", [id, intAleatorio, intAleatorio, intAleatorio, intAleatorio, intAleatorio]);
    var insert3 = await pool.query ("INSERT INTO materia VALUES (?,?,?,?)", [id, intAleatorio, intAleatorio, intAleatorio]);
    var delete1 = await pool.query ("DELETE FROM estudiante WHERE id_est = ?", id);
    var delete2 = await pool.query ("DELETE FROM profesor WHERE id_prof = ?", id);
    var delete3 = await pool.query ("DELETE FROM materia WHERE id_materia = ?", id);

    res.render('InsertarEliminar',{title:"NodeJS"});

  } catch (err) {
      throw new Error (err);
  }

});


router.get('/ContarPrimos', function(req,res,next){

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


app.use('/', router);


var server = app.listen(4000);
