var gulp = require('gulp');
var fs = require('fs');
var winston = require('winston');
var uuid = require('uuid');
var common = require('./common');
var concat = require('gulp-concat');
var start = new Date;
var cluster = require('cluster');
var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({
            colorize: true
        })
    ]
});


// таска на склейку файлов
// к сожалению склеивает каждый файл с лишним \r
// не придумал пока как избавиться
// поэтому all.log несколько больше access.log
gulp.task('logs', function() {
    return gulp.src('./logs/*.log')
        .pipe(concat('all.log'))
        .pipe(gulp.dest('./'));
});

if (cluster.isWorker) {
    // вся работа дочернего процесса
    var writeStream = fs.createWriteStream('logs/' + uuid.v4() + '-part.log', { flags : 'w' });

    process.stdin
        .pipe(common.split())
        .pipe(common.tr)
        .pipe(writeStream);

    writeStream.on('finish', function(){ // по окончании записи, шлём уведомление
       process.send('ready ' + cluster.worker.id);
    });

} else {
    //
    var net = require('net');
    var readline = require('readline');
    var _ = require('lodash');
    var EE = require('events').EventEmitter;
    var runserverEvent = new EE();
    var config = require('./config');
    var Readable = require('stream').Readable;
    var parts = 0;
    var streamsNum = 0;
    var streams = {};
    var numCPUs = require('os').cpus().length;
    var pilot = undefined;
    var s = undefined;

    runserverEvent.on('runserver', runServer);
    // в задании ничего не сказано про основной процесс  мастера, убивать его или нет.
    // поэтому сервера выключаться, а процесс завершится
    // управляющий сервер
    function runPilot(){
        pilot = net.createServer(function (socket) { //'connection' listener
            logger.info('agent connected');
            socket.write('create ' + config.processNumber);

            socket.once('end', function () {
                logger.info('agent disconnected');
            });

            socket.once('data', function (data) { // данные от сервера придут только 1 раз, количество завершённых дочерних процессов
                catchAllParts(parseInt(data.toString()));
            });

            socket.on('error', function (e) {
                logger.error(e);
            });

        }).listen(config.port2, function () { //'listening' listener
            logger.info('command server is UP at ' + config.port2);
            //runserverEvent.emit('runserver'); // сервер готов
        });

        pilot.on('error', function (e) {
            logger.error(e)
        });
    }


    // запускаем кластер
    cluster.setupMaster({silent: true});
    for ( var i = 0; i < numCPUs; i++) { // детей по количеству процессоров
        cluster.fork();
    }
    var j =0;
    cluster.on('online', function(worker) {
        worker.once('message', catchAllParts); // дочерний закончил, прислал 1 сообщение.
        var id = uuid.v4();
        streams[id] = createRstream();
        streams[id].pipe(worker.process.stdin);
        if ( ++j == numCPUs) runserverEvent.emit('runserver'); // все дети запустились
    });

    cluster.on('exit', function(worker, code, signal) {
        logger.info('worker ' + worker.process.pid + ' died');
    });

    cluster.on('error', function(e) {
        logger.error(e);
    });

    // поток из которого читают клиенты и дети
    function createRstream(){
        var rStream = new Readable();
        rStream._read = function noop() {};
        return rStream;
    }
    // проверяем все ли закончили
    function catchAllParts(data) {
        if (_.isFinite(data)) parts +=data; // от агента придёт инфа о том сколько его детей закончило, по завершению всех
        else parts++;
        console.log(parts);
        if (parts == _.keys(streams).length) concatParts();
    }
    // убиваем детей и соединяем файлы
    function concatParts() {
        _.forEach(cluster.workers, function(w, key){
            w.kill();
        });
        gulp.start('logs');// стартуем склейку
        logger.warn("Обработка заняла: " + (new Date - start) + " ms");
        pilot.close();
        s.close();
    }
    // потоковый сервер
    function runServer(){
            s = net.createServer(function (socket) { //'connection' listener
                var id = uuid.v4();
                logger.info('agent child connected');
                streams[id] = createRstream(); // на каждый клиент свой читающий поток
                streams[id].pipe(socket);

                socket.on('end', function () {
                    logger.info('agent child disconnected');
                });

                socket.on('data', function (data) {
                    // nothing here
                });

                socket.on('error', function (e) {
                    logger.error(e);
                });

            }).listen(config.port, function () { //'listening' listener
                logger.info('Stream server is UP at ' + config.port);
                // после запуска сервера начинаем построчно читать, с помощью встроенного модуля
                var rd = readline.createInterface({
                    input: fs.createReadStream('access.log'),
                    output: process.stdout,
                    terminal: false // не выводим в терминал
                });
                runPilot(); // запускаем командный сервер, что бы быть уверенным, что чтение файла фозможно
                logger.info('start parsing');
                rd.on('line', function (line) { // работаем с каждой строкой
                    // можно впринципе аккумулироать несколько строк перед отправкой,
                    // изменения только здесь надо будет внести,
                    // но одна строка == целое уоличество строк :)
                    streams[_.keys(streams)[streamsNum]].push(line + '\n');
                    streamsNum++;
                    streamsNum = streamsNum == _.keys(streams).length ? 0 : streamsNum;

                });
                // конец файла
                rd.on('close', function () {
                    _.forEach(streams, function (obj, key) {
                        obj.push(null); // даём клиентам и детям мастера понять, что файл закончился
                    });
                    logger.warn('FINISH');
                });

                rd.on('error', function (e) {
                    logger.error(e);
                });
            });

            s.on('error', function(e){
               logger.info(e)
            });
    }
}
