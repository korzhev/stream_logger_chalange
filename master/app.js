var net = require('net');
var fs = require('fs');
var readline = require('readline');
var uuid = require('uuid');
var _ = require('lodash');
var EE = require('events').EventEmitter;
var runserverEvent = new EE();
var pilotReadyEvent = new EE();
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
//var clients = {};
var streams = {};
var config = require('./config');
var streamsNum = 0;
var common = require('./common');
var parts = 0;
var gulp = require('gulp');
var concat = require('gulp-concat');
var start = new Date;
var serverReady = 0;

// таска на склейку файлов
gulp.task('logs', function() {
    return gulp.src('./logs/*.log')
        .pipe(concat('all.log'))
        .pipe(gulp.dest('./'));
});

var pilot = net.createServer(function (socket) { //'connection' listener
    socket.write('create ' + config.processNumber);

    socket.on('end', function () {
        console.log('client disconnected');
    });

    socket.on('data', function (data) {

        console.log(parseInt(data.toString()))
        catchAllParts(parseInt(data.toString()));
    });


    socket.on('error', function (e) {
        console.log(e);
    });

}).listen(config.port2, function () { //'listening' listener
    console.log('server1 is UP at ' + config.port2);
    runserverEvent.emit('runserver');
});

pilot.on('error', function (e) {
    console.log(e)
});



if (cluster.isWorker) {
    var writeStream = fs.createWriteStream('logs/' + uuid.v4() + '-part.log', { flags : 'w' });

    //fs.createReadStream('access.log')
    process.stdin
        .pipe(common.split())
        .pipe(common.tr)
        .pipe(writeStream);

    writeStream.on('finish', function(){
       process.send('ready ' + cluster.worker.id);
    });

} else {

    cluster.setupMaster({silent: true});
    for ( var i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    runserverEvent.on('runserver', runServer);
    var j =0;

    cluster.on('online', function(worker) {
        worker.once('message', catchAllParts);
        console.log(j);
        var id = uuid.v4();
        streams[id] = createRstream();
        //clients[id] = worker.process.stdin;
        streams[id].pipe(worker.process.stdin);
        j++;
        if (j == numCPUs) runserverEvent.emit('runserver');
    });

    cluster.on('exit', function(worker, code, signal) {
        console.log('worker ' + worker.process.pid + ' died');
    });

    cluster.on('error', function(e) {
        console.log(e);
    });

    function createRstream(){
        var rStream = new require('stream').Readable();
        rStream._read = function noop() {};
        return rStream;
    }

    function catchAllParts(data) {
        if (_.isFinite(data)) parts +=data;
        else parts++
        console.log('parts', parts, _.keys(streams).length)
        if (parts == _.keys(streams).length) concatParts();
    }

    function concatParts() {
        _.forEach(cluster.workers, function(w, key){
            w.kill();
        });
        gulp.start('logs');
        console.info("Обработка заняла: " + (new Date - start) + " ms");
    }

    function runServer(){
        console.log('here', serverReady)
        if (serverReady == 1) {

            var s = net.createServer(function (socket) { //'connection' listener
                var id = uuid.v4();
                console.log('client1 connected');
                streams[id] = createRstream();
                //clients[id] = socket;
                streams[id].pipe(socket);

                socket.on('end', function () {
                    console.log('client1 disconnected');
                });

                socket.on('data', function (data) {
                    console.log('data');
                });

                socket.on('error', function (e) {
                    //delete streams[id];
                    //delete clients[id];
                    console.log(e);
                });

            }).listen(config.port, function () { //'listening' listener
                console.log('server is UP at ' + config.port);
                var rd = readline.createInterface({
                    input: fs.createReadStream('access.log'),
                    output: process.stdout,
                    terminal: false
                });

                rd.on('line', function (line) {

                    streams[_.keys(streams)[streamsNum]].push(line + '\n');
                    streamsNum++;
                    streamsNum = streamsNum == _.keys(streams).length ? 0 : streamsNum;

                });
                rd.on('close', function () {
                    _.forEach(streams, function (obj, key) {
                        obj.push(null);
                    });
                    console.warn('FINISH');
                });

                rd.on('error', function (e) {

                    console.warn(e);
                });
            });

            s.on('error', function(e){
               console.log(e)
            });
        } else {
            serverReady++;
        }
    }

}
