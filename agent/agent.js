/**
 * Created by Владимир on 01.05.2015.
 */
var net = require('net');
var config = require('./config');
var common = require('./common');
var fs = require('fs');
var uuid = require('uuid');
var cluster = require('cluster');
var winston = require('winston');
var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({
            colorize: true
        })
    ]
});


if (cluster.isWorker) {
    //сразу соединяемся с раздающим сервером
    // но при долгом подлючении, возможно опаздать к раздаче потока, и процесс продолжит жить
    var client = net.connect({port: config.port, host: config.host},
        function () { //'connect' listener
            logger.info('child connected to server!');
            // запись в файл аналогична
            var writeStream = fs.createWriteStream('logs/' + uuid.v4() + '-part.log', { flags : 'w' });
            client
                .pipe(common.split())
                .pipe(common.tr)
                .pipe(writeStream);

            writeStream.on('finish', function(){
                process.send('ready'); // шлём мастеру, что закончили
                client.end(); // отключаемся
            });
        });

} else {
    var scpClient = require('scp2');
    var readyCount = 0; // количество закончивших работу процессов
    var processNumber = 1;
    var _ = require('lodash');

    function connectTo(){
        var client = net.connect({port: config.port2, host: config.host},
            function () { //'connect' listener
                clearInterval(timer); // перестаём попытки подсоединиться
                logger.info('connected to server!');
                // управляющий сервер прислал количество дочерних процессов
                client.on('data', function(data){
                    var command=data.toString();
                    if (command && command.indexOf('create ')>=0) { // проверяем даныые, если это нужная команда
                        processNumber = command.split(' ')[1];
                        //processNumber = require('os').cpus().length; // либо по количеству процессоров
                        cluster.setupMaster({silent: true});
                        for ( var i = 0; i < processNumber; i++) {
                            cluster.fork();
                        }
                    }
                });

                cluster.on('online', function(worker) {

                    worker.once('message', function(){ // получаем сообщение только в конце
                        if (++readyCount == processNumber) {
                            scpClient.scp('logs/*.log',{ // копируем файлы
                                host: config.scpHost,
                                username: config.user,
                                password: config.password,
                                //privateKey: config.keyPath,
                                path: config.path
                            }, function(e){
                                if (e) logger.error(e);
                                else {
                                    _.forEach(cluster.workers, function(w, key){
                                        w.kill();
                                    });
                                    client.end(processNumber);
                                    logger.info('agent is going down');
                                }
                            });
                        }
                    });
                });

                cluster.on('exit', function(worker, code, signal) {
                    logger.info('worker ' + worker.process.pid + ' died');
                });

            });
        client.on('error', function(e) {
            logger.error('waiting')
        });

    }
    logger.info('waiting for master...');
    // раз в секунду проверяем не работает ли сервер
    var timer = setInterval(     // вызывается раз в 1 секунд
        connectTo
        ,1000
    );
    //timer.unref();
}