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
app.use(bodyParser.urlencoded({ extended: true })); //support x-www-form-urlencoded
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
        debug    : false //Se configura true si se quiere ver el debug logger
    },'request')

);

app.get('/',function(req,res){

    //res.send('Bienvenido a la base de datos MySQL con Node.js');
	res.render(path.join(__dirname, '/views/index'));
});



//RESTful route
var router = express.Router();


//Router middleware.

router.use(function(req, res, next) {
    console.log(req.method, req.url);
    next();
});

var cp = router.route('/consultaprofesores');


//Muestra la consulta de profesores.
cp.get(function(req,res,next){


    req.getConnection(function(err,conn){

        if (err) return next("No se puede conectar.");

        var query = conn.query('SELECT * FROM profesor',function(err,rows){

            if(err){
                console.log(err);
                return next("Mysql error, revise el query");
            }

            res.render('consultaprofesores',{title:"Consulta",data:rows});

         });

    });

});

var ce = router.route('/consultaestudiantes');

//Muestra la consulta de estudiantes.
ce.get(function(req,res,next){


    req.getConnection(function(err,conn){

        if (err) return next("No se puede conectar.");

        var query = conn.query('SELECT * FROM estudiante',function(err,rows){

            if(err){
                console.log(err);
                return next("Mysql error, revise el query");
            }

            res.render('consultaestudiantes',{title:"Consulta",data:rows});

         });

    });


});

var cm = router.route('/consultamaterias');

//Muestra la consulta de materias.
cm.get(function(req,res,next){


    req.getConnection(function(err,conn){

        if (err) return next("No se puede conectar.");

        var query = conn.query('SELECT * FROM materia',function(err,rows){

            if(err){
                console.log(err);
                return next("Mysql error, revise el query");
            }

            res.render('consultamaterias',{title:"Consulta",data:rows});

         });

    });

});



var cce = router.route('/consultaestudiantessemestre');

//Muestra la cantidad de estudiantes.
cce.get(function(req,res,next){

    var semestre_est = req.param('semestre');

    req.getConnection(function(err,conn){

        if (err) return next("No se puede conectar.");

        var query = conn.query('select count(*) AS cantidad from estudiante where semestre_est= ?',[semestre_est],function(err,rows){

            if(err){
                console.log(err);
                return next("Mysql error, revise el query");
            }


            res.render('consultaestudiantessemestre',{title:"Consulta",rows});

         });

    });


});


var cpe = router.route('/consultaprofesoresescuela');

//Muestra la cantidad de profesores.
cpe.get(function(req,res,next){

    var escuela_prof = req.param('escuela');

    req.getConnection(function(err,conn){

        if (err) return next("No se puede conectar.");

        var query = conn.query('select count(*) AS cantidad from profesor where escuela_prof= ?',[escuela_prof],function(err,rows){

            if(err){
                console.log(err);
                return next("Mysql error, revise el query");
            }


            res.render('consultaprofesoresescuela',{title:"Consulta",rows});

         });

    });


});

var e = router.route('/modificacion');

//Muestra la cantidad de estudiantes.
e.get(function(req,res,next){


    var id_est = req.param('id');
    var primer_nombre_est = req.param('pne');
    var primer_apellido_est = req.param('pae');

    req.getConnection(function(err,conn){

        if (err) return next("No se puede conectar.");

        var query = conn.query('UPDATE estudiante SET primer_nombre_est= ?, primer_apellido_est= ? WHERE id_est= ?',[primer_nombre_est,primer_apellido_est,id_est],function(err,rows){

            if(err){
                console.log(err);
                return next("Mysql error, revise el query");
            }


            res.render('modificacion',{title:"Modificacion",rows});

         });

    });


});

var e = router.route('/eliminacion');

//Muestra la cantidad de estudiantes.
e.get(function(req,res,next){

    var id_est = req.param('eliminarestudiante');

    req.getConnection(function(err,conn){

        if (err) return next("No se puede conectar.");

        var query = conn.query('DELETE FROM estudiante WHERE id_est= ?',[id_est],function(err,rows){

            if(err){
                console.log(err);
                return next("Mysql error, revise el query");
            }


            res.render('eliminacion',{title:"Eliminacion",rows});

         });

    });


});

//Se aplica el router aquí
app.use('/api', router);

//Empezar servidor
var server = app.listen(3000,function(){

   console.log("Escuchando por el puerto %s",server.address().port);

});
