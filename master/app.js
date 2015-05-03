var net = require('net');
var fs = require('fs');
var readline = require('readline');
var uuid = require('uuid');
var _ = require('lodash');
var EE = require('events').EventEmitter;
var runserverEvent = new EE();
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

// таска на склейку файлов
gulp.task('logs', function() {
    return gulp.src('./logs/*.log')
        .pipe(concat('all.log'))
        .pipe(gulp.dest('./'));
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
    runserverEvent.once('runserver', runServer);
    var j =0;

    cluster.on('online', function(worker) {
        worker.once('message', catchAllParts);

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

    function createRstream(){
        var rStream = new require('stream').Readable();
        rStream._read = function noop() {};
        return rStream;
    }

    function catchAllParts(data) {
        if (++parts == _.keys(streams).length) concatParts();
    }

    function concatParts() {
        _.forEach(cluster.workers, function(w, key){
            w.kill();
        });
        gulp.start('logs');
        console.info("Обработка заняла: " + (new Date - start) + " ms");
    }

    function runServer(){
        net.createServer(function (socket) { //'connection' listener
            var id = uuid.v4();
            console.log('client connected');
            streams[id] = createRstream();
            //clients[id] = socket;
            streams[id].pipe(socket);

            socket.write('create ' + config.processNum);

            socket.on('end', function () {
                console.log('client disconnected');
            });

            socket.on('data', function () {
                console.log(data.toString());
            });

            socket.on('error', function () {
                delete streams[id];
                //delete clients[id];
                console.log(data.toString());
            });

        }).listen(config.port, function () { //'listening' listener
            console.log('server is UP at ' + config.port);
            var rd = readline.createInterface({
                input: fs.createReadStream('access.log'),
                output: process.stdout,
                terminal: false
            });

            rd.on('line', function (line) {

                streams[_.keys(streams)[streamsNum]].push(line+'\n');
                streamsNum ++;
                streamsNum = streamsNum == _.keys(streams).length ? 0 : streamsNum;

            });
            rd.on('close', function(){
                _.forEach(streams, function(obj, key){
                    obj.push(null);
                });
                console.warn('FINISH')
            });
        });
    }

}
