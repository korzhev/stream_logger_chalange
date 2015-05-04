/**
 * Created by Владимир on 01.05.2015.
 */
var net = require('net');
var config = require('./config');
var common = require('./common');
var fs = require('fs');
var uuid = require('uuid');
var _ = require('lodash');
var EE = require('events').EventEmitter;
var cluster = require('cluster');



if (cluster.isWorker) {

    var client = net.connect({port: config.port, host: config.host},
        function () { //'connect' listener
            console.log('connected to server!');
            //client.write('world!\r\n');


            var writeStream = fs.createWriteStream('logs/' + uuid.v4() + '-part.log', { flags : 'w' });

            //fs.createReadStream('access.log')
            client
                .pipe(common.split())
                .pipe(common.tr)
                .pipe(writeStream);

            writeStream.on('finish', function(){
                process.send('ready1');
            });
        });
    //        client.ref();

} else {
    var readyCount=0;
    var processNumber =1;
    function connectTo(){
        var client = net.connect({port: config.port2, host: config.host},
            function () { //'connect' listener
                clearInterval(timer);
                console.log('connected to server!');


                client.on('data', function(data){
                    var command=data.toString();
                    console.log(command)
                    if (command && command.indexOf('create ')>=0) {
                        processNumber = command.split(' ')[1];
                        cluster.setupMaster({silent: true});
                        for ( var i = 0; i < processNumber; i++) {
                            cluster.fork();
                        }
                    }
                    //client.end();
                });

                cluster.on('online', function(worker) {

                    worker.on('message', function(){
                        if (++readyCount == processNumber) client.write(processNumber);
                    });
                });

                cluster.on('exit', function(worker, code, signal) {
                    console.log('worker ' + worker.process.pid + ' died');
                });

                //var writeStream = fs.createWriteStream('logs/' + uuid.v4() + '-part.log', { flags : 'w' });
                //client.pipe(common.split()).pipe(common.tr).pipe(writeStream);
                //
                //writeStream.on('finish', function(){
                //    client.write('ready\n');
                //});
            });
        //client.ref();
        client.on('error', function(e) {
            console.error('waiting')
        });

    }

    //cluster.setupMaster({silent: true});
    //for ( var i = 0; i < 4; i++) {
    //    cluster.fork();
    //}
    //connectTo();
    var timer = setInterval(     // вызывается раз в 1 секунд
        connectTo
        ,1000
    );
    //timer.unref();

    //var client = net.connect({port: config.port, host: config.host},
    //    function () { //'connect' listener
    //        console.log('connected to server!');
    //        client.write('world!\r\n');
    //    });
    //client.on('data', function (data) {
    //    console.log(data.toString());
    //    client.end();
    //});
    //client.on('end', function () {
    //    console.log('disconnected from server');
    //});
}


