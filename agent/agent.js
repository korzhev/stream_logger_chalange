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
                process.send('ready ' + cluster.worker.id);
            });
        });
} else {

    cluster.setupMaster({silent: true});
    for ( var i = 0; i < 4; i++) {
        cluster.fork();
    }

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


